// shortwave.ino — Answering-machine recorder/player for ESP32-S3

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <ESP32I2SAudio.h>
#include <BackgroundAudioMP3.h>
#include "driver/i2s_std.h"
#include "env.h"

// ============================================================
// Audio / buffering  (generous sizing for ESP32-S3 N16R8 PSRAM)
// ============================================================

#define BUFFER_SAMPLES   1024
#define BYTES_PER_SAMPLE 2
#define CHUNK_BYTES      (BUFFER_SAMPLES * BYTES_PER_SAMPLE)
#define CHUNK_MS         ((BUFFER_SAMPLES * 1000) / ENV_SAMPLE_RATE)
#define QUEUE_DEPTH      8

// ============================================================
// Timing
// ============================================================

#define POLL_INTERVAL_MS       60000UL
#define RECORD_HOLD_MS         500UL   // hold longer than this to record; tap shorter for playback
#define SHORT_PRESS_MIN_MS     40      // debounce: ignore taps shorter than this
#define DOUBLE_BLINK_PERIOD_MS 5000UL
#define BUTTON_ACTIVE_STATE    HIGH

// ============================================================
// Credentials
// ============================================================

const char* ssid       = ENV_SSID;
const char* password   = ENV_PASSWORD;
const char* serverHost = ENV_SERVER_HOST;
const int   serverPort = 443;
const char* authToken  = ENV_AUTH_TOKEN;

// ============================================================
// BackgroundAudio (speaker output, I2S_NUM_0 via library)
// ============================================================

static ESP32I2SAudio           g_i2sOut(I2S_PLAY_SCK, I2S_PLAY_WS, I2S_PLAY_DOUT);
static BackgroundAudioMP3Class<RawDataBuffer<8 * 1024>> g_mp3(g_i2sOut);
static bool g_mp3Started = false;

// ============================================================
// Mic I2S (raw driver, I2S_NUM_1)
// Mic and speaker share BCLK/WS pins so they must alternate:
// micDisable() before playback, micEnable() after.
// ============================================================

static i2s_chan_handle_t g_micRxChan = nullptr;

static bool micEnable() {
  if (g_micRxChan) return true;

  i2s_chan_config_t chanCfg = {
    .id                  = I2S_NUM_1,
    .role                = I2S_ROLE_MASTER,
    .dma_desc_num        = 6,
    .dma_frame_num       = 1024,
    .auto_clear          = false,
    .auto_clear_before_cb = false,
    .intr_priority       = 0,
  };
  if (i2s_new_channel(&chanCfg, nullptr, &g_micRxChan) != ESP_OK) {
    Serial.println("mic: new_channel failed");
    return false;
  }

  i2s_std_config_t stdCfg = {
    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG((uint32_t)ENV_SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED,
      .bclk = (gpio_num_t)I2S_MIC_SCK,
      .ws   = (gpio_num_t)I2S_MIC_WS,
      .dout = I2S_GPIO_UNUSED,
      .din  = (gpio_num_t)I2S_MIC_SD,
      .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },
    },
  };
  stdCfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;

  if (i2s_channel_init_std_mode(g_micRxChan, &stdCfg) != ESP_OK) {
    Serial.println("mic: init failed");
    i2s_del_channel(g_micRxChan); g_micRxChan = nullptr;
    return false;
  }
  if (i2s_channel_enable(g_micRxChan) != ESP_OK) {
    Serial.println("mic: enable failed");
    i2s_del_channel(g_micRxChan); g_micRxChan = nullptr;
    return false;
  }
  return true;
}

static void micDisable() {
  if (!g_micRxChan) return;
  i2s_channel_disable(g_micRxChan);
  i2s_del_channel(g_micRxChan);
  g_micRxChan = nullptr;
}

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

static String        recordingId        = "";
static volatile bool recording          = false;
static volatile int  chunkIndex         = 0;
static volatile bool stopRequested      = false;
static volatile bool uploadStreamActive = false;
static volatile bool stopPlayback       = false;

static String        latestMsgKey       = "";
static String        lastListenedMsgKey = "";
static bool          firstPollDone      = false;
static bool          playbackPending    = false;
static bool          playbackActive     = false;
static unsigned long lastPollMs         = 0;
static unsigned long nextDoubleBlinkMs  = 0;
static int           doubleBlinkPhase   = 0;

static TaskHandle_t playbackTask = nullptr;

// ============================================================
// HTTPS stream helpers (upload)
// ============================================================

static WiFiClientSecure* streamClient = nullptr;

static bool openStream() {
  if (streamClient) { streamClient->stop(); delete streamClient; }
  streamClient = new WiFiClientSecure();
  streamClient->setInsecure();
  if (!streamClient->connect(serverHost, serverPort)) {
    Serial.println("openStream: connect failed");
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
    "x-sample-rate: %d\r\n"
    "\r\n",
    serverHost, authToken, recordingId.c_str(), ENV_SAMPLE_RATE);
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
    if (!streamClient->connected() || millis() - t0 > 10000) break;
    vTaskDelay(10);
  }
  int code = -1;
  if (streamClient->available()) {
    String line = streamClient->readStringUntil('\n');
    code = line.substring(9, 12).toInt();
  }
  Serial.printf("Stream closed, HTTP %d\n", code);
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

static bool pollAnsweringMachine() {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, String("https://") + serverHost + "/api/answering-machine")) return false;
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("ngrok-skip-browser-warning", "true");
  int code = http.GET();
  String body = http.getString(); http.end();
  if (code == 404) {
    latestMsgKey = "";
    if (!firstPollDone) { lastListenedMsgKey = ""; firstPollDone = true; }
    return true;
  }
  if (code != 200) { Serial.printf("poll: HTTP %d\n", code); return false; }
  String fn = extractJsonField(body, "fileName");
  String mt = extractJsonField(body, "mtime");
  latestMsgKey = (fn.length() && mt.length()) ? fn + "|" + mt : "";
  if (!firstPollDone) { lastListenedMsgKey = latestMsgKey; firstPollDone = true; }
  return true;
}

static bool hasUnlistenedMessages() {
  return latestMsgKey.length() > 0 && latestMsgKey != lastListenedMsgKey;
}

// ============================================================
// Playback
// ============================================================

static bool streamAnsweringMachineMp3() {
  char url[192];
  snprintf(url, sizeof(url), "https://%s/api/answering-machine/mp3", serverHost);

  WiFiClientSecure* client = new WiFiClientSecure();
  HTTPClient*       http   = new HTTPClient();
  client->setInsecure();

  if (!http->begin(*client, url)) {
    Serial.println("play: http begin failed");
    delete http; delete client; return false;
  }
  http->addHeader("Authorization", String("Bearer ") + authToken);
  http->addHeader("ngrok-skip-browser-warning", "true");

  int code = http->GET();
  Serial.printf("play begin %d\n", code);
  if (code != 200) {
    Serial.printf("play: HTTP %d\n", code);
    http->end(); delete http; delete client; return false;
  }

  WiFiClient* stream = http->getStreamPtr();
  int contentLength  = http->getSize();  // -1 if server didn't send Content-Length
  g_mp3.flush();

  uint8_t buf[2048];
  size_t totalRead = 0;
  unsigned long lastDataMs = millis();
  bool aborted = false;

  while (!stopPlayback && !aborted && (stream->connected() || stream->available())) {
    // If we know the total size, stop as soon as we have it all —
    // the TCP connection may stay open (keep-alive) even after the body is done.
    if (contentLength > 0 && (int)totalRead >= contentLength) break;

    if (stream->available() > 0) {
      lastDataMs = millis();
      if (g_mp3.availableForWrite() >= (int)sizeof(buf)) {
        int n = stream->read(buf, sizeof(buf));
        if (n > 0) { g_mp3.write(buf, n); totalRead += n; }
        else if (n < 0) { aborted = true; }
      }
    } else if (!stream->connected()) {
      break;
    } else if (millis() - lastDataMs > 8000UL) {
      Serial.println("play: stall");
      aborted = true;
    }
    yield();
  }

  bool success = !aborted && !stopPlayback;
  if (success) {
    unsigned long t0 = millis();
    while (g_mp3.available() > 0 && millis() - t0 < 5000UL) yield();
  } else {
    g_mp3.flush();
  }

  http->end(); delete http; delete client;
  Serial.printf("play: done (%zu B%s)\n", totalRead,
                stopPlayback ? ", interrupted" : aborted ? ", stalled" : "");
  return success;
}

static void playAnsweringMachineAudio() {
  while (recording || stopRequested || uploadStreamActive) vTaskDelay(pdMS_TO_TICKS(20));

  stopPlayback = false;
  micDisable();

  // g_mp3.begin() allocates ~40 KB of internal SRAM (I2S DMA + libmad workspace).
  // DMA cannot use PSRAM, so this must happen while the upload path is idle or
  // TLS handshakes will fail to find contiguous internal heap.
  if (!g_mp3Started) { g_mp3.begin(); g_mp3Started = true; }

  bool ok = streamAnsweringMachineMp3();
  if (!micEnable()) { delay(20); micEnable(); }

  if (ok) {
    lastListenedMsgKey = latestMsgKey;
    Serial.println("play: finished");
  }
}

// ============================================================
// Playback worker task (Core 1)
// ============================================================

static void playbackWorker(void*) {
  while (true) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    playAnsweringMachineAudio();
    playbackActive = false;
  }
}

// ============================================================
// Audio task (Core 0) — reads mic, fills queue
// ============================================================

static void audioTask(void*) {
  static int32_t rawBuf[BUFFER_SAMPLES];

  while (true) {
    if (!recording) {
      if (stopRequested) {
        AudioChunk* chunk;
        if (xQueueReceive(freeChunks, &chunk, pdMS_TO_TICKS(500)) == pdTRUE) {
          chunk->size    = 0;
          chunk->isFinal = true;
          xQueueSend(audioQueue, &chunk, portMAX_DELAY);
          stopRequested  = false;
        }
      }
      vTaskDelay(10);
      continue;
    }

    if (!g_micRxChan) { vTaskDelay(10); continue; }

    AudioChunk* chunk;
    if (xQueueReceive(freeChunks, &chunk, pdMS_TO_TICKS(100)) != pdTRUE) {
      vTaskDelay(pdMS_TO_TICKS(CHUNK_MS));
      continue;
    }

    size_t bytesRead = 0;
    esp_err_t err = i2s_channel_read(g_micRxChan, rawBuf,
                                     BUFFER_SAMPLES * sizeof(int32_t),
                                     &bytesRead, pdMS_TO_TICKS(250));
    if (err != ESP_OK) {
      chunk->size = 0;
      i2s_channel_disable(g_micRxChan);
      i2s_channel_enable(g_micRxChan);
    } else {
      size_t n = bytesRead / sizeof(int32_t);
      int16_t* dst = (int16_t*)chunk->data;
      for (size_t i = 0; i < n; i++) dst[i] = (int16_t)(rawBuf[i] >> 16);
      chunk->size = n * sizeof(int16_t);
    }

    chunk->isFinal = false;
    xQueueSend(audioQueue, &chunk, portMAX_DELAY);
  }
}

// ============================================================
// Network task (Core 1) — drains queue, streams over HTTPS
// ============================================================

static void networkTask(void*) {
  AudioChunk* chunk;
  bool streaming = false;

  while (true) {
    if (xQueueReceive(audioQueue, &chunk, portMAX_DELAY) != pdTRUE || !chunk) continue;

    if (chunk->isFinal) {
      if (streaming) { closeStream(); streaming = false; uploadStreamActive = false; }
      xQueueSend(freeChunks, &chunk, portMAX_DELAY);
    } else {
      if (!streaming) {
        if (openStream()) {
          streaming = true; uploadStreamActive = true;
        } else {
          uploadStreamActive = false;
          xQueueSend(freeChunks, &chunk, portMAX_DELAY);
          AudioChunk* d;
          while (xQueueReceive(audioQueue, &d, 0) == pdTRUE && d)
            xQueueSend(freeChunks, &d, portMAX_DELAY);
          vTaskDelay(pdMS_TO_TICKS(1000));
          continue;
        }
      }
      if (chunk->size > 0) {
        sendChunk(chunk->data, chunk->size);
        Serial.printf("Sent chunk %d (%zu B)\n", chunkIndex++, chunk->size);
      }
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
  if (stableCount >= 5) stableState = reading;
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

  WiFi.begin(ssid, password);
  Serial.print("Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nConnected!");

  configTime(0, 0, "pool.ntp.org");
  struct tm ti;
  while (!getLocalTime(&ti)) { delay(500); Serial.println("Waiting NTP..."); }
  Serial.println("Time synced");

  freeChunks = xQueueCreate(QUEUE_DEPTH, sizeof(AudioChunk*));
  audioQueue = xQueueCreate(QUEUE_DEPTH, sizeof(AudioChunk*));
  for (int i = 0; i < QUEUE_DEPTH; i++) {
    chunkPool[i].data = (uint8_t*)ps_malloc(CHUNK_BYTES);
    if (!chunkPool[i].data) Serial.printf("chunk[%d] alloc failed\n", i);
    AudioChunk* p = &chunkPool[i];
    xQueueSend(freeChunks, &p, 0);
  }

  if (!micEnable()) Serial.println("setup: mic enable failed");

  xTaskCreatePinnedToCore(audioTask,      "audio", 8192,  nullptr, 2, nullptr,       0);
  xTaskCreatePinnedToCore(networkTask,    "net",   16384, nullptr, 1, nullptr,       1);
  xTaskCreatePinnedToCore(playbackWorker, "play",  16384, nullptr, 1, &playbackTask, 1);
}

// ============================================================
// loop
// ============================================================

void loop() {
  unsigned long now = millis();

  if (lastPollMs == 0 || now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollAnsweringMachine();
  }

  static bool          prevPressed     = false;
  static unsigned long pressStart      = 0;
  static bool          holdingToRecord = false;
  bool isPressed = getIsButtonPressed();

  if (isPressed && !prevPressed) {
    pressStart      = millis();
    holdingToRecord = false;
    if (playbackActive) stopPlayback = true;  // any press cancels playback
  }

  // Arm recording once the button has been held past the threshold
  if (isPressed && !holdingToRecord && !recording && !playbackActive &&
      !uploadStreamActive && !stopRequested &&
      millis() - pressStart >= RECORD_HOLD_MS) {
    holdingToRecord = true;
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
  }

  if (!isPressed && prevPressed) {
    unsigned long dur = millis() - pressStart;
    if (holdingToRecord) {
      // Long press: stop recording and upload
      recording = false; stopRequested = true;
      Serial.println("Recording stopped");
    } else if (dur >= SHORT_PRESS_MIN_MS) {
      // Short tap: trigger playback (recording never started)
      playbackPending = true;
    }
    holdingToRecord = false;
  }
  prevPressed = isPressed;

  if (playbackPending && !recording && !playbackActive) {
    playbackPending = false;
    playbackActive  = true;
    pollAnsweringMachine();
    delay(300);
    if (playbackTask) xTaskNotifyGive(playbackTask);
    else { Serial.println("playback task missing"); playbackActive = false; }
  }

  // LED
  if (recording) {
    digitalWrite(LED_PIN, HIGH);
    doubleBlinkPhase = 0; nextDoubleBlinkMs = 0;
  } else if (playbackActive) {
    digitalWrite(LED_PIN, LOW);
  } else if (hasUnlistenedMessages()) {
    if (nextDoubleBlinkMs == 0) nextDoubleBlinkMs = now;
    if (now >= nextDoubleBlinkMs) {
      switch (doubleBlinkPhase) {
        case 0: digitalWrite(LED_PIN, HIGH); nextDoubleBlinkMs = now + 80;                     doubleBlinkPhase = 1; break;
        case 1: digitalWrite(LED_PIN, LOW);  nextDoubleBlinkMs = now + 120;                    doubleBlinkPhase = 2; break;
        case 2: digitalWrite(LED_PIN, HIGH); nextDoubleBlinkMs = now + 80;                     doubleBlinkPhase = 3; break;
        case 3: digitalWrite(LED_PIN, LOW);  nextDoubleBlinkMs = now + DOUBLE_BLINK_PERIOD_MS; doubleBlinkPhase = 0; break;
      }
    }
  } else {
    digitalWrite(LED_PIN, LOW);
    doubleBlinkPhase = 0; nextDoubleBlinkMs = 0;
  }

  delay(5);
}
