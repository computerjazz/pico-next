// shortwave.ino — Answering-machine recorder/player for ESP32-S3
//
// Added: Test tone playback if button is held 2+ sec on boot (diagnostics)
// Added: Logs for playback output pin activity

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>
#include <ESP32I2SAudio.h>
#include <BackgroundAudioMP3.h>
#include "driver/i2s_std.h"
#include "esp_rom_gpio.h"
#include "soc/gpio_sig_map.h"
#include "env.h"
#include <math.h> // for sin()

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
static float g_gain = 0.1f;  // default: half volume


// ============================================================
// Test tone generation (basic diagnostics)
// ============================================================

void playTestTone(int ms = 15000, float freq = 440.0f) {
  i2s_chan_handle_t txChan = nullptr;

  i2s_chan_config_t chanCfg = {
    .id           = I2S_NUM_0,
    .role         = I2S_ROLE_MASTER,
    .dma_desc_num = 6,
    .dma_frame_num = 256,
  };
  i2s_new_channel(&chanCfg, &txChan, nullptr);

  i2s_std_config_t stdCfg = {
    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG((uint32_t)ENV_SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED,
      .bclk = (gpio_num_t)I2S_PLAY_SCK,
      .ws   = (gpio_num_t)I2S_PLAY_WS,
      .dout = (gpio_num_t)I2S_PLAY_DOUT,
      .din  = I2S_GPIO_UNUSED,
    },
  };
  i2s_channel_init_std_mode(txChan, &stdCfg);
  i2s_channel_enable(txChan);

  const int bufSamples = 256;
  int16_t buf[bufSamples * 2]; // stereo
  float phase = 0, phaseInc = TWO_PI * freq / ENV_SAMPLE_RATE;
  int totalFrames = (ENV_SAMPLE_RATE * ms) / 1000;

  while (totalFrames > 0) {
    int n = min(bufSamples, totalFrames);
    for (int i = 0; i < n; i++) {
      int16_t s = (int16_t)(sinf(phase) * 23000);
      buf[i*2]   = s;  // L
      buf[i*2+1] = s;  // R
      phase += phaseInc;
      if (phase > TWO_PI) phase -= TWO_PI;
    }
    size_t written = 0;
    i2s_channel_write(txChan, buf, n * 4, &written, pdMS_TO_TICKS(200));
    totalFrames -= n;
  }

  i2s_channel_disable(txChan);
  i2s_del_channel(txChan);
}

// ============================================================
// Mic I2S (raw driver, I2S_NUM_1)
// Mic and speaker share BCLK/WS pins so they must alternate:
// micDisable() before playback, micEnable() after.
// ============================================================

static i2s_chan_handle_t g_micRxChan = nullptr;

static bool micEnable(bool forceMaster = false) {
  if (g_micRxChan) return true;

  i2s_chan_config_t chanCfg = {
    .id                  = I2S_NUM_1,
    // Before first playback the mic is master (no speaker clock yet).
    // After g_mp3.begin() the speaker drives BCLK/WS, so mic becomes slave —
    // UNLESS forceMaster is set (i.e. during a recording, when BackgroundAudio
    // is idle and generates no clock for the slave to follow).
    .role                = (forceMaster || !g_mp3Started) ? I2S_ROLE_MASTER : I2S_ROLE_SLAVE,
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
    "x-device-id: %s\r\n"
    "\r\n",
    serverHost, authToken, recordingId.c_str(), ENV_SAMPLE_RATE, DEVICE_ID);
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

// Log the output pins when playback is triggered
static void logSpeakerPins() {
  Serial.printf("Speaker (I2S_OUT) pins: SCK=%d, WS/LRCK=%d, DOUT=%d\n", I2S_PLAY_SCK, I2S_PLAY_WS, I2S_PLAY_DOUT);
}

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

  Serial.println("[PLAYBACK] Output audio stream to speaker (I2S_OUT)...");
  logSpeakerPins();

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

  // Disable mic during playback — both peripherals share the I2S DMA bus and
  // having the mic's DMA running in the background causes audible noise.
  micDisable();

  if (!g_mp3Started) {
    // First playback: mic already disabled above, so BackgroundAudio can claim
    // the BCLK/WS pins (GPIO 9/46) as I2S master without any conflict.
    g_mp3.begin();
    g_mp3Started = true;
    g_mp3.setGain(g_gain);
  }

  g_mp3.flush();

  bool ok = streamAnsweringMachineMp3();

  // Re-enable mic in slave mode now that playback is done.
  // BackgroundAudio's DMA keeps the I2S clock running continuously (it outputs
  // silence when idle), so the slave mic will have a valid clock for future
  // recordings — UNLESS we ever temporarily made the mic a master (see loop()),
  // in which case networkTask restores GPIO routing after upload finishes.
  micEnable();  // slave: g_mp3Started is now true

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
    Serial.println("[PLAYBACK] worker: starting");
    playAnsweringMachineAudio();
    Serial.println("[PLAYBACK] worker: finished, clearing active");
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
      // Recording is done. The mic was running as I2S master (driving GPIO 9/46),
      // which overwrote BackgroundAudio's I2S_NUM_0 GPIO matrix output routing.
      // Restore that routing so the speaker can drive BCLK/WS again, then put
      // the mic back in slave mode so both can coexist.
      if (g_mp3Started) {
        micDisable();
        // Re-attach I2S_NUM_0's BCLK and WS output signals to the shared pins.
        // micEnable(true) (master mode during recording) called
        // i2s_channel_init_std_mode for I2S_NUM_1 which overwrote the GPIO
        // matrix entries for GPIO 9 and 46. BackgroundAudio never re-inits its
        // GPIO config, so we restore it manually here.
        esp_rom_gpio_connect_out_signal(I2S_PLAY_SCK, I2S0O_BCK_OUT_IDX, false, false);
        esp_rom_gpio_connect_out_signal(I2S_PLAY_WS,  I2S0O_WS_OUT_IDX,  false, false);
        micEnable();  // slave — g_mp3Started is true, forceMaster not set
      }
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

  // Drive speaker I2S pins low before BackgroundAudio claims them.
  // Floating pins on an idle amplifier produce audible noise on boot.
  pinMode(I2S_PLAY_SCK,  OUTPUT); digitalWrite(I2S_PLAY_SCK,  LOW);
  pinMode(I2S_PLAY_WS,   OUTPUT); digitalWrite(I2S_PLAY_WS,   LOW);
  pinMode(I2S_PLAY_DOUT, OUTPUT); digitalWrite(I2S_PLAY_DOUT, LOW);

  // Test tone on boot: hold button for >2 seconds on startup
  unsigned long bootTestToneStart = millis();
  bool testToneArmed = false;
  while (millis() - bootTestToneStart < 2100 && digitalRead(BUTTON_PIN) == BUTTON_ACTIVE_STATE) {
    if (!testToneArmed) {
      Serial.println("[TEST] Button held on boot! Will output test tone.");
      testToneArmed = true;
    }
    delay(10);
  }
  if (testToneArmed) {
    digitalWrite(LED_PIN, HIGH);
    playTestTone();
    digitalWrite(LED_PIN, LOW);
    Serial.println("[TEST] Setup continues...");
  }

  WiFi.begin(ssid, password);
  Serial.print("Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(70);
    digitalWrite(LED_PIN, LOW);
    delay(70);
  }
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

  // Log the I2S output pins at startup for reference
  Serial.println("[INFO] Speaker (I2S_OUT) output is mapped to the following pins:");
  logSpeakerPins();
}

// ============================================================
// loop
// ============================================================

void loop() {
  unsigned long now = millis();
  static unsigned long lastVolMs = 0;


  if (lastPollMs == 0 || now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollAnsweringMachine();
  }

  if (now - lastVolMs > 150) {
    lastVolMs = now;
    int raw = analogRead(VOLUME_PIN);          // 0–4095 on ESP32-S3
    g_gain = USE_VOLUME_PIN ? raw / 4095.0f * 2.0f : g_gain;         // 0.0–2.0 (pot center = unity gain)
    if (g_mp3Started) {
      g_mp3.setGain(g_gain);
    }
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

  // Arm recording once the button has been held past the threshold.
  // Allowed even if playback is active — stopPlayback was already set on the
  // press edge, so the playback task is winding down.
  if (isPressed && !holdingToRecord && !recording &&
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
    // Switch mic to master so it generates its own BCLK/WS clock.
    // BackgroundAudio's MSB slot format causes the slave mic to mis-frame
    // WS edges, so master mode is required for reliable i2s_channel_read.
    // If playback was just interrupted, give the playback task a moment to
    // release the I2S DMA before we reconfigure the GPIO routing.
    if (playbackActive) {
      unsigned long t0 = millis();
      while (playbackActive && millis() - t0 < 300) delay(10);
    }
    micDisable();
    micEnable(true);  // master for the duration of this recording
    Serial.printf("Recording started — id: %s\n", recordingId.c_str());
  }

  if (!isPressed && prevPressed) {
    unsigned long dur = millis() - pressStart;
    if (holdingToRecord) {
      // Long press: stop recording and upload
      recording = false; stopRequested = true;
      Serial.println("Recording stopped");
    } else if (dur >= SHORT_PRESS_MIN_MS) {
      Serial.printf("[DEBUG] pending=%d recording=%d active=%d\n", playbackPending, recording, playbackActive);

      // Short tap: trigger playback (recording never started)
      Serial.println("[PLAYBACK] Button tap detected: will trigger playback.");
      playbackPending = true;
    }
    holdingToRecord = false;
  }
  prevPressed = isPressed;

  if (playbackPending && !recording && !playbackActive) {
    playbackPending = false;
    playbackActive  = true;
    pollAnsweringMachine();
    if (playbackTask) {
      Serial.println("[PLAYBACK] Notifying playback task to start output.");
      xTaskNotifyGive(playbackTask);
    }
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
