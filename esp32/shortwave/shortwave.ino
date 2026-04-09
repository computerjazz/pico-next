// ============================================================
// Answering-machine recorder/player — ESP32 (fragmentation-resistant)
// ============================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#include <ESP32I2SAudio.h>
#include <BackgroundAudioMP3.h>
#include "driver/i2s_std.h"
#include "env.h"

// ============================================================
// Pin configuration
// ============================================================

#define BUTTON_PIN        34
#define I2S_MIC_SCK       14
#define I2S_MIC_WS        27
#define I2S_MIC_SD        32
#define I2S_PLAY_SCK      14
#define I2S_PLAY_WS       27
#define I2S_PLAY_DOUT     25
#define LED_PIN           33

#define BUTTON_ACTIVE_STATE HIGH
#define REQUIRED_STABLE     5

// ============================================================
// Audio / buffering
// ============================================================

#define BUFFER_SAMPLES   512
#define BYTES_PER_SAMPLE 2
#define CHUNK_BYTES      (BUFFER_SAMPLES * BYTES_PER_SAMPLE)
#define CHUNK_MS         ((BUFFER_SAMPLES * 1000) / ENV_SAMPLE_RATE)
#define QUEUE_DEPTH      4
#define BA_FEED_CHUNK    1024

// ============================================================
// Credentials
// ============================================================

const char* ssid       = ENV_SSID;
const char* password   = ENV_PASSWORD;
const char* serverHost = ENV_SERVER_HOST;
const int   serverPort = 443;
const char* authToken  = ENV_AUTH_TOKEN;

// ============================================================
// Timing constants
// ============================================================

#define POLL_INTERVAL_MS        60000UL
#define SHORT_PRESS_MAX_MS      1000UL
#define SHORT_PRESS_MIN_MS      40
#define DOUBLE_BLINK_PERIOD_MS  5000UL
#define MAX_STREAM_BYTES        (2 * 1024 * 1024)

// ============================================================
// BackgroundAudio objects
// ============================================================

static ESP32I2SAudio         g_i2sOut(I2S_PLAY_SCK, I2S_PLAY_WS, I2S_PLAY_DOUT);
static BackgroundAudioMP3Class<RawDataBuffer<4 * 1024>> g_mp3(g_i2sOut);

static i2s_chan_handle_t g_micRxChan = nullptr;
static bool              g_micInstalled = false;

// ============================================================
// Audio chunk pool (upload path)
// ============================================================

struct AudioChunk {
  size_t   size;
  bool     isFinal;
  uint8_t* data;
};

static AudioChunk    chunkPool[QUEUE_DEPTH];
static QueueHandle_t freeChunks;
static QueueHandle_t audioQueue;

// ============================================================
// State
// ============================================================

static String         recordingId     = "";
static volatile bool  recording       = false;
static volatile int   chunkIndex      = 0;
static volatile bool  stopRequested   = false;
static volatile bool  uploadStreamActive = false;

static String latestMsgKey           = "";
static String lastListenedMsgKey     = "";
static bool   firstAnsweringPollDone = false;
static bool   playbackPending        = false;
static bool   playbackActive         = false;
static unsigned long lastPollMs      = 0;
static unsigned long nextDoubleBlinkMs = 0;
static int    doubleBlinkPhase       = 0;

#define PLAYBACK_TASK_STACK 24576
static TaskHandle_t  playbackTask = nullptr;

// ============================================================
// New-driver mic: install / uninstall
// ============================================================

static bool installMicI2S() {
#if USE_MIC
  if (g_micInstalled) return true;

  i2s_chan_config_t chanCfg = {
    .id             = I2S_NUM_1,
    .role           = I2S_ROLE_MASTER,
    .dma_desc_num   = 4,
    .dma_frame_num  = 512,
    .auto_clear     = false,
    .auto_clear_before_cb = false,
    .intr_priority  = 0,
  };
  esp_err_t err = i2s_new_channel(&chanCfg, nullptr, &g_micRxChan);
  if (err != ESP_OK) {
    Serial.printf("mic: i2s_new_channel failed: %d\n", (int)err);
    return false;
  }
  i2s_std_config_t stdCfg = {
    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG((uint32_t)ENV_SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(
                    I2S_DATA_BIT_WIDTH_32BIT,
                    I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
      .mclk  = I2S_GPIO_UNUSED,
      .bclk  = (gpio_num_t)I2S_MIC_SCK,
      .ws    = (gpio_num_t)I2S_MIC_WS,
      .dout  = I2S_GPIO_UNUSED,
      .din   = (gpio_num_t)I2S_MIC_SD,
      .invert_flags = {
        .mclk_inv = false,
        .bclk_inv = false,
        .ws_inv   = false,
      },
    },
  };
  stdCfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;
  err = i2s_channel_init_std_mode(g_micRxChan, &stdCfg);
  if (err != ESP_OK) {
    Serial.printf("mic: i2s_channel_init_std_mode failed: %d\n", (int)err);
    i2s_del_channel(g_micRxChan);
    g_micRxChan = nullptr;
    return false;
  }
  err = i2s_channel_enable(g_micRxChan);
  if (err != ESP_OK) {
    Serial.printf("mic: i2s_channel_enable failed: %d\n", (int)err);
    i2s_del_channel(g_micRxChan);
    g_micRxChan = nullptr;
    return false;
  }
  g_micInstalled = true;
  Serial.println("mic: I2S channel installed (new driver, port 1)");
#endif
  return true;
}

static void uninstallMicI2S() {
#if USE_MIC
  if (!g_micInstalled || !g_micRxChan) return;
  i2s_channel_disable(g_micRxChan);
  i2s_del_channel(g_micRxChan);
  g_micRxChan    = nullptr;
  g_micInstalled = false;
  Serial.println("mic: I2S channel removed");
#endif
}

// ============================================================
// Stream helpers
// ============================================================

static WiFiClientSecure* streamClient = nullptr;

static bool openStream() {
  if (streamClient) { streamClient->stop(); delete streamClient; }
  streamClient = new WiFiClientSecure();
  streamClient->setInsecure();
  Serial.printf("openStream: heap=%d largest=%d\n",
                esp_get_free_heap_size(),
                heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
  if (!streamClient->connect(serverHost, serverPort)) {
    Serial.println("Stream connect failed");
    delete streamClient; streamClient = nullptr;
    return false;
  }
  streamClient->printf(
    "POST /api/upload-audio-stream HTTP/1.1\r\n"
    "Host: %s\r\n"
    "Authorization: Bearer %s\r\n"
    "Content-Type: application/octet-stream\r\n"
    "Transfer-Encoding: chunked\r\n"
    "Connection: close\r\n"
    "ngrok-skip-browser-warning: true\r\n"
    "x-recording-id: %s\r\n"
    "x-sample-rate: %s\r\n"
    "\r\n",
    serverHost, authToken, recordingId.c_str(), String(ENV_SAMPLE_RATE).c_str());
  Serial.println("Stream opened");
  return true;
}

static void sendChunk(const uint8_t* data, size_t len) {
  char header[12];
  int hlen = snprintf(header, sizeof(header), "%X\r\n", (unsigned)len);
  streamClient->write((const uint8_t*)header, hlen);
  streamClient->write(data, len);
  streamClient->write((const uint8_t*)"\r\n", 2);
  streamClient->flush();
}

static int closeStream() {
  streamClient->print("0\r\n\r\n");
  unsigned long t0 = millis();
  while (streamClient->available() == 0) {
    if (!streamClient->connected()) break;
    if (millis() - t0 > 10000) break;
    vTaskDelay(10);
  }
  int code = -1;
  if (streamClient->available()) {
    String line = streamClient->readStringUntil('\n');
    code = line.substring(9, 12).toInt();
  }
  Serial.printf("Stream closed, HTTP: %d\n", code);
  streamClient->stop(); delete streamClient; streamClient = nullptr;
  return code;
}

// ============================================================
// Poll helpers
// ============================================================

static String extractJsonField(const String& json, const char* key) {
  String pat = String("\"") + key + "\":\"";
  int i = json.indexOf(pat); if (i < 0) return "";
  i += pat.length();
  int j = json.indexOf('"', i); if (j < 0) return "";
  return json.substring(i, j);
}

static void buildMsgKey(const String& fn, const String& mt, String* out) {
  *out = (fn.length() && mt.length()) ? (fn + "|" + mt) : "";
}

static bool pollAnsweringMachine() {
  HTTPClient http; WiFiClientSecure client; client.setInsecure();
  String url = String("https://") + serverHost + "/api/answering-machine";
  if (!http.begin(client, url)) { Serial.println("poll: begin failed"); return false; }
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("ngrok-skip-browser-warning", "true");
  int code = http.GET();
  String body = http.getString(); http.end();
  if (code == 404) {
    latestMsgKey = "";
    if (!firstAnsweringPollDone) { lastListenedMsgKey = ""; firstAnsweringPollDone = true; }
    return true;
  }
  if (code != 200) { Serial.printf("poll: HTTP %d\n", code); return false; }
  buildMsgKey(extractJsonField(body, "fileName"), extractJsonField(body, "mtime"), &latestMsgKey);
  if (!firstAnsweringPollDone) { lastListenedMsgKey = latestMsgKey; firstAnsweringPollDone = true; }
  return true;
}

static bool hasUnlistenedMessages() {
  return latestMsgKey.length() > 0 && latestMsgKey != lastListenedMsgKey;
}

// ============================================================
// Playback
// ============================================================

static bool g_mp3Started = false;

static bool streamAnsweringMachineMp3() {
  char url[192];
  snprintf(url, sizeof(url), "https://%s/api/answering-machine/audio", serverHost);

  WiFiClientSecure* client = new WiFiClientSecure();
  HTTPClient*       http   = new HTTPClient();
  if (!client || !http) {
    if (http) delete http; if (client) delete client;
    return false;
  }
  client->setInsecure();

  if (!http->begin(*client, url)) {
    Serial.println("play: http begin failed");
    delete http; delete client; return false;
  }
  char authHdr[256];
  snprintf(authHdr, sizeof(authHdr), "Bearer %s", authToken);
  http->addHeader("Authorization", authHdr);
  http->addHeader("ngrok-skip-browser-warning", "true");

  int code = http->GET();
  Serial.printf("play: HTTP %d\n", code);
  if (code != 200) { http->end(); delete http; delete client; return false; }

  WiFiClient* stream = http->getStreamPtr();
  if (!stream) { Serial.println("play: no stream"); http->end(); delete http; delete client; return false; }

  g_mp3.flush();
  uint8_t feedBuf[BA_FEED_CHUNK];
  size_t totalRead = 0;
  bool   aborted   = false;
  unsigned long lastDataMs = millis();

  while ((stream->connected() || stream->available()) && !aborted) {
    while (stream->available() && g_mp3.availableForWrite() >= (int)sizeof(feedBuf)) {
      int n = stream->read(feedBuf, sizeof(feedBuf));
      if (n > 0) {
        g_mp3.write(feedBuf, n);
        totalRead  += (size_t)n;
        lastDataMs  = millis();
        if (totalRead > MAX_STREAM_BYTES) {
          Serial.println("play: stream size cap");
          aborted = true; break;
        }
      } else if (n < 0) {
        Serial.println("play: stream read error");
        aborted = true; break;
      } else {
        break;
      }
    }
    if (!aborted && totalRead > 0 && (millis() - lastDataMs) > 8000UL) {
      Serial.println("play: stall timeout");
      aborted = true; break;
    }
    yield();
  }

  if (!aborted) {
    unsigned long drainStart = millis();
    while (g_mp3.available() > 0 && (millis() - drainStart < 5000UL)) {
      yield();
    }
  }

  http->end(); delete http; delete client;
  Serial.printf("play: done (totalRead=%zu, aborted=%d)\n", totalRead, (int)aborted);
  return !aborted;
}

static void playAnsweringMachineAudio() {
  Serial.println("play: waiting for any active upload...");
  unsigned long t0 = millis();
  while ((recording || stopRequested || uploadStreamActive) && millis() - t0 < 10000UL) {
    vTaskDelay(pdMS_TO_TICKS(20));
  }

  uninstallMicI2S();

  if (!g_mp3Started) {
    Serial.printf("play: begin() heap before=%d largest=%d\n",
                  esp_get_free_heap_size(),
                  heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
    g_mp3.begin();
    g_mp3Started = true;
    Serial.printf("play: begin() done heap=%d\n", esp_get_free_heap_size());
  }

  bool ok = streamAnsweringMachineMp3();

  if (!installMicI2S()) {
    Serial.println("mic: reinstall failed, retrying once");
    delay(20);
    installMicI2S();
  }

  if (ok) {
    lastListenedMsgKey = latestMsgKey;
    Serial.println("play: finished");
  }
}

// ============================================================
// Playback worker task (large stack, Core 1)
// ============================================================

static void playbackWorker(void*) {
  while (true) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    playAnsweringMachineAudio();
    playbackActive = false;
  }
}

// ============================================================
// Audio task (Core 0) — reads mic via new I2S driver
// ============================================================

static void audioTask(void*) {
  while (true) {
    if (!recording) {
      if (stopRequested) {
        AudioChunk* chunk;
        if (xQueueReceive(freeChunks, &chunk, pdMS_TO_TICKS(500)) == pdTRUE) {
          chunk->size    = 0;
          chunk->isFinal = true;
          xQueueSend(audioQueue, &chunk, portMAX_DELAY);
          stopRequested = false;
        }
      }
      vTaskDelay(10);
      continue;
    }

    AudioChunk* chunk;
    if (xQueueReceive(freeChunks, &chunk, pdMS_TO_TICKS(100)) != pdTRUE) {
      Serial.println("audioTask: no free chunks, dropping window");
      vTaskDelay(pdMS_TO_TICKS(CHUNK_MS));
      continue;
    }

#if USE_MIC
    if (!g_micInstalled || !g_micRxChan) {
      xQueueSend(freeChunks, &chunk, portMAX_DELAY);
      vTaskDelay(pdMS_TO_TICKS(10));
      continue;
    }
    static int32_t s_raw32[BUFFER_SAMPLES];
    size_t bytesRead = 0;
    esp_err_t err = i2s_channel_read(
        g_micRxChan,
        s_raw32,
        BUFFER_SAMPLES * sizeof(int32_t),
        &bytesRead,
        pdMS_TO_TICKS(250));

    if (err != ESP_OK) {
      Serial.printf("audioTask: i2s_channel_read err %d\n", (int)err);
      chunk->size = 0;
      i2s_channel_disable(g_micRxChan);
      i2s_channel_enable(g_micRxChan);
    } else {
      size_t samplesRead = bytesRead / sizeof(int32_t);
      int16_t* dst = (int16_t*)chunk->data;
      for (size_t i = 0; i < samplesRead; i++) {
        dst[i] = (int16_t)(s_raw32[i] >> 16);
      }
      chunk->size = samplesRead * sizeof(int16_t);
    }
#else
    static float phase = 0.0f;
    const float  inc   = 2.0f * (float)M_PI * 440.0f / ENV_SAMPLE_RATE;
    int16_t* samples   = (int16_t*)chunk->data;
    for (int i = 0; i < BUFFER_SAMPLES; i++) {
      samples[i] = (int16_t)(sinf(phase) * 16000.0f);
      phase += inc;
      if (phase > 2.0f * (float)M_PI) phase -= 2.0f * (float)M_PI;
    }
    chunk->size = CHUNK_BYTES;
    vTaskDelay(pdMS_TO_TICKS(CHUNK_MS));
#endif

    chunk->isFinal = false;
    xQueueSend(audioQueue, &chunk, portMAX_DELAY);
  }
}

// ============================================================
// Network task (Core 1) — drains queue, streams over HTTPS
// ============================================================

static void networkTask(void*) {
  Serial.println("networkTask: started");
  AudioChunk* chunk;
  bool streaming = false;

  while (true) {
    if (xQueueReceive(audioQueue, &chunk, portMAX_DELAY) != pdTRUE) continue;
    if (!chunk) continue;

    if (chunk->isFinal) {
      if (streaming) { closeStream(); streaming = false; uploadStreamActive = false; }
      xQueueSend(freeChunks, &chunk, portMAX_DELAY);
    } else {
      if (!streaming) {
        if (openStream()) { streaming = true; uploadStreamActive = true; }
        else {
          // DRAIN QUEUE in event of connect failure, else fragments accumulate
          Serial.println("Connect failed — draining queue");
          uploadStreamActive = false;
          xQueueSend(freeChunks, &chunk, portMAX_DELAY);
          AudioChunk* d;
          while (xQueueReceive(audioQueue, &d, 0) == pdTRUE)
            if (d) xQueueSend(freeChunks, &d, portMAX_DELAY);
          vTaskDelay(pdMS_TO_TICKS(1000));
          continue;
        }
      }
      sendChunk(chunk->data, chunk->size);
      Serial.printf("Sent chunk %d (%zu B), heap=%d\n",
                    chunkIndex++, chunk->size, esp_get_free_heap_size());
      xQueueSend(freeChunks, &chunk, portMAX_DELAY);
    }
  }
}

// ============================================================
// Button debounce
// ============================================================

static bool getIsButtonPressed() {
  static bool stableState = (BUTTON_ACTIVE_STATE == HIGH) ? LOW : HIGH;
  static bool lastReading = (BUTTON_ACTIVE_STATE == HIGH) ? LOW : HIGH;
  static int  stableCount = 0;
  bool reading = digitalRead(BUTTON_PIN);
  if (reading == lastReading) stableCount++; else stableCount = 0;
  if (stableCount >= REQUIRED_STABLE) stableState = reading;
  lastReading = reading;
  return stableState == BUTTON_ACTIVE_STATE;
}

// ============================================================
// setup
// ============================================================

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(I2S_PLAY_DOUT, OUTPUT);
  digitalWrite(I2S_PLAY_DOUT, LOW);

  WiFi.begin(ssid, password);
  Serial.print("Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nConnected!");

  configTime(0, 0, "pool.ntp.org");
  struct tm ti;
  while (!getLocalTime(&ti)) { delay(500); Serial.println("Waiting NTP..."); }
  Serial.println("Time synced");

  // Chunk pool — metadata static, data buffers heap-allocated
  freeChunks = xQueueCreate(QUEUE_DEPTH, sizeof(AudioChunk*));
  audioQueue = xQueueCreate(QUEUE_DEPTH, sizeof(AudioChunk*));
  for (int i = 0; i < QUEUE_DEPTH; i++) {
    chunkPool[i].data = (uint8_t*)malloc(CHUNK_BYTES);
    if (!chunkPool[i].data) {
      Serial.printf("setup: chunk[%d] data alloc failed!", i);
    }
    AudioChunk* p = &chunkPool[i];
    xQueueSend(freeChunks, &p, 0);
  }
  Serial.printf("setup: heap after chunk alloc: %d, largest: %d",
                esp_get_free_heap_size(),
                heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));

  if (!installMicI2S()) Serial.println("setup: mic install failed");

  // NOTE: g_mp3.begin() is intentionally NOT called here.
  // BackgroundAudio's I2S DMA buffers + the libmad decoder workspace
  // together consume ~40 KB of heap that WiFiClientSecure also needs
  // for TLS handshakes during recording upload. Calling begin() here
  // would fragment the heap and cause "Stream connect failed" on every
  // upload attempt. Instead, begin() is called lazily on first playback
  // inside playAnsweringMachineAudio(), at which point the upload path
  // is fully idle (enforced by the recording/uploadStreamActive guard).

  xTaskCreatePinnedToCore(audioTask,     "audio", 12288,             nullptr, 2, nullptr,       0);
  xTaskCreatePinnedToCore(networkTask,   "net",   16384,             nullptr, 1, nullptr,       1);
  xTaskCreatePinnedToCore(playbackWorker,"play",  PLAYBACK_TASK_STACK, nullptr, 1, &playbackTask, 1);
  if (!playbackTask) Serial.println("playback task create failed");

  Serial.printf("Free heap after setup: %d\n", esp_get_free_heap_size());
}

// ============================================================
// loop
// ============================================================

static bool safeToRecord() {
  // Only start a recording if all chunk buffers are presently free
  UBaseType_t freeCount = uxQueueMessagesWaiting(freeChunks);
  UBaseType_t queueCount = uxQueueMessagesWaiting(audioQueue);
  if (freeCount==QUEUE_DEPTH && queueCount==0 && !playbackActive && !recording && !uploadStreamActive && !stopRequested) {
    // Also, require that a sufficiently large contiguous heap block is available.
    size_t largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
    if (largest >= 34000) { // empirically, WiFiClientSecure needs ~32K-38K
      return true;
    }
  }
  return false;
}

void loop() {
  unsigned long now = millis();

  // Periodic answering-machine poll
  if (lastPollMs == 0 || now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollAnsweringMachine();
  }

  // --- Button ---
  static bool prevPressed    = false;
  static unsigned long pressStart = 0;
  bool isPressed = getIsButtonPressed();

  // Only allow recording to start when it's actually safe to do so!
  if (isPressed && !prevPressed) {
    pressStart = millis();
    if (safeToRecord()) {
      recording  = true;
      chunkIndex = 0;
      struct tm ti;
      if (getLocalTime(&ti)) {
        char buf[20]; strftime(buf, sizeof(buf), "%Y%m%d_%H%M%S", &ti);
        recordingId = String(buf);
      } else {
        recordingId = String(millis());
      }
      Serial.printf("Recording started — id: %s\n", recordingId.c_str());
    } else if (!playbackActive && !recording) {
      Serial.println("Refusing to record: memory not safe, chunk buffers not all free, or in flight");
    }
  }

  if (!isPressed && prevPressed) {
    unsigned long dur = millis() - pressStart;
    if (recording) { recording = false; stopRequested = true; Serial.println("Recording stopped"); }
    if (!playbackActive && dur >= SHORT_PRESS_MIN_MS && dur < SHORT_PRESS_MAX_MS)
      playbackPending = true;
  }
  prevPressed = isPressed;

  // Kick playback task
  if (playbackPending && !recording && !playbackActive) {
    playbackPending = false;
    playbackActive  = true;
    pollAnsweringMachine();
    delay(300);
    if (playbackTask) xTaskNotifyGive(playbackTask);
    else { Serial.println("playback task missing"); playbackActive = false; }
  }

  // --- LED ---
  if (recording) {
    digitalWrite(LED_PIN, HIGH);
    doubleBlinkPhase  = 0;
    nextDoubleBlinkMs = 0;
  } else if (playbackActive) {
    digitalWrite(LED_PIN, LOW);
  } else if (hasUnlistenedMessages()) {
    if (nextDoubleBlinkMs == 0) nextDoubleBlinkMs = now;
    if (now >= nextDoubleBlinkMs) {
      switch (doubleBlinkPhase) {
        case 0: digitalWrite(LED_PIN, HIGH); nextDoubleBlinkMs = now + 80;                  doubleBlinkPhase = 1; break;
        case 1: digitalWrite(LED_PIN, LOW);  nextDoubleBlinkMs = now + 120;                 doubleBlinkPhase = 2; break;
        case 2: digitalWrite(LED_PIN, HIGH); nextDoubleBlinkMs = now + 80;                  doubleBlinkPhase = 3; break;
        case 3: digitalWrite(LED_PIN, LOW);  nextDoubleBlinkMs = now + DOUBLE_BLINK_PERIOD_MS; doubleBlinkPhase = 0; break;
      }
    }
  } else {
    digitalWrite(LED_PIN, LOW);
    doubleBlinkPhase  = 0;
    nextDoubleBlinkMs = 0;
  }

  delay(5);
}
