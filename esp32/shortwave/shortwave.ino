#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include "secrets.h"
#include <time.h>

// MP3 decode: bundled minimp3 (legacy I2S TX only — avoids ESP8266Audio, which uses the *new* I2S
// driver on ESP32 and triggers: "CONFLICT! The new i2s driver can't work along with the legacy driver")
#define MINIMP3_IMPLEMENTATION
#include "minimp3.h"

// ============================================================
// Configuration — tweak these without touching anything below
// ============================================================

#define SAMPLE_RATE       32000   // Hz — 32000 is broadcast quality; try 22050 for lighter load
#define BUFFER_SAMPLES    1024    // Samples per chunk — 1024 = ~32ms at 32kHz
#define QUEUE_DEPTH       4       // Number of pre-allocated chunk slots in the pool

#define USE_MIC           true

#define BUTTON_PIN        34
#define I2S_WS            27
#define I2S_SD            32
#define I2S_SCK           14
#define LED_PIN           33

// I2S data out to amplifier (e.g. MAX98357 DIN) — must not be the mic SD pin (I2S_SD)
#define I2S_PLAYBACK_DOUT 25

#define BUTTON_ACTIVE_STATE HIGH
#define REQUIRED_STABLE     5     // Consecutive stable reads required for debounce

// ============================================================
// Derived constants — do not edit
// ============================================================

#define BYTES_PER_SAMPLE      2                           // 16-bit = 2 bytes
#define CHUNK_BYTES           (BUFFER_SAMPLES * BYTES_PER_SAMPLE)
#define CHUNK_MS              ((BUFFER_SAMPLES * 1000) / SAMPLE_RATE)

// ============================================================
// Credentials / server
// ============================================================

const char* ssid        = SECRET_SSID;
const char* password    = SECRET_PASSWORD;
const char* serverHost  = SECRET_SERVER_HOST;
const int   serverPort  = 443;
const char* authToken   = SECRET_AUTH_TOKEN;

#define POLL_INTERVAL_MS       60000UL
#define SHORT_PRESS_MAX_MS     1000UL
#define SHORT_PRESS_MIN_MS     40
#define DOUBLE_BLINK_PERIOD_MS 5000UL
#define I2S_MUTEX_WAIT_MS      800
#define I2S_READ_TIMEOUT_MS    250

// Dedicated task stack: mbedTLS read() is deep; keep HTTP clients/buffers off the stack (static below).
#define PLAYBACK_TASK_STACK_BYTES (24 * 1024)
#define PLAYBACK_TASK_STACK_WORDS (PLAYBACK_TASK_STACK_BYTES / sizeof(StackType_t))
#define MAX_ANSWERING_MACHINE_STREAM_BYTES (2 * 1024 * 1024)

// Latest message key from GET /api/answering-machine (fileName + mtime); empty = none / 404
String latestMsgKey           = "";
String lastListenedMsgKey     = "";
bool   firstAnsweringPollDone = false;
bool   playbackPending        = false;
bool   playbackActive         = false;
unsigned long lastPollMs      = 0;  // 0 = run first poll immediately
unsigned long nextDoubleBlinkMs = 0;
int      doubleBlinkPhase     = 0;

// ============================================================
// Audio chunk — allocated once into a static pool at startup
// ============================================================

struct AudioChunk {
  size_t size;
  bool   isFinal;
  uint8_t data[CHUNK_BYTES];
};

static AudioChunk chunkPool[QUEUE_DEPTH];

QueueHandle_t freeChunks;   // pool of available (empty) chunks
QueueHandle_t audioQueue;   // filled chunks waiting to be sent

// Serialize mic i2s_read (core 0) vs uninstall/install (loop on core 1) — fast tap used to race them.
SemaphoreHandle_t i2sMicMutex = nullptr;
TaskHandle_t playbackTaskHandle = nullptr;
static StaticTask_t playbackTaskTCB;
static StackType_t playbackTaskStack[PLAYBACK_TASK_STACK_WORDS];
bool i2sMicInstalled = false;
bool i2sPlaybackInstalled = false;
volatile bool uploadStreamActive = false;

// ============================================================
// State
// ============================================================

String          recordingId   = "";
volatile bool   recording     = false;
volatile int    chunkIndex    = 0;
volatile bool   stopRequested = false;

// ============================================================
// Chunked HTTPS streaming
// ============================================================

WiFiClientSecure* streamClient = nullptr;

bool openStream() {
  if (streamClient) {
    streamClient->stop();
    delete streamClient;
  }

  streamClient = new WiFiClientSecure();
  streamClient->setInsecure();

  if (!streamClient->connect(serverHost, serverPort)) {
    Serial.println("Stream connect failed");
    delete streamClient;
    streamClient = nullptr;
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
    serverHost, authToken, recordingId.c_str(), String(SAMPLE_RATE)
  );

  Serial.println("Stream opened");
  return true;
}

void sendChunk(uint8_t* data, size_t len) {
  streamClient->printf("%X\r\n", len);
  streamClient->write(data, len);
  streamClient->print("\r\n");
}

int closeStream() {
  streamClient->print("0\r\n\r\n");

  unsigned long timeout = millis();
  while (streamClient->available() == 0) {
    if (!streamClient->connected()) {
      Serial.println("Connection dropped waiting for response");
      break;
    }
    if (millis() - timeout > 10000) {
      Serial.println("Response timeout");
      break;
    }
    vTaskDelay(10);
  }

  int code = -1;
  if (streamClient->available()) {
    String statusLine = streamClient->readStringUntil('\n');
    code = statusLine.substring(9, 12).toInt();
  }

  Serial.printf("Stream closed, HTTP: %d\n", code);
  streamClient->stop();
  delete streamClient;
  streamClient = nullptr;
  return code;
}

// ============================================================
// Answering machine — poll + MP3 playback (HTTPS + Bearer)
// ============================================================

static String extractJsonStringField(const String& json, const char* key) {
  String pat = String("\"") + key + "\":\"";
  int i = json.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  int j = json.indexOf('"', i);
  if (j < 0) return "";
  return json.substring(i, j);
}

static void buildMsgKey(const String& fileName, const String& mtime, String* out) {
  if (fileName.length() == 0 || mtime.length() == 0) {
    *out = "";
    return;
  }
  *out = fileName + "|" + mtime;
}

static void idlePlaybackDataPin() {
  pinMode(I2S_PLAYBACK_DOUT, OUTPUT);
  digitalWrite(I2S_PLAYBACK_DOUT, LOW);
}

bool installMicI2S() {
  i2s_config_t i2s_config = {
    .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate          = SAMPLE_RATE,
    .bits_per_sample      = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S_MSB,
    .intr_alloc_flags     = 0,
    .dma_buf_count        = 8,
    .dma_buf_len          = 1024,
    .use_apll             = false,
    .tx_desc_auto_clear   = false,
    .fixed_mclk           = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num    = I2S_SCK,
    .ws_io_num     = I2S_WS,
    .data_out_num  = I2S_PIN_NO_CHANGE,
    .data_in_num   = I2S_SD
  };

#if USE_MIC
  // Ensure port is clean before re-installing RX mode.
  if (i2sPlaybackInstalled || i2sMicInstalled) {
    i2s_driver_uninstall(I2S_NUM_0);
    i2sPlaybackInstalled = false;
    i2sMicInstalled = false;
  }
  esp_err_t err = i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("mic: i2s_driver_install failed: %d\n", (int)err);
    return false;
  }
  err = i2s_set_pin(I2S_NUM_0, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("mic: i2s_set_pin failed: %d\n", (int)err);
    i2s_driver_uninstall(I2S_NUM_0);
    return false;
  }
  i2sMicInstalled = true;
#endif
  idlePlaybackDataPin();
  return true;
}

void uninstallMicI2S() {
#if USE_MIC
  if (i2sMicInstalled) {
    i2s_driver_uninstall(I2S_NUM_0);
    i2sMicInstalled = false;
  }
#endif
  idlePlaybackDataPin();
}

static void uninstallPlaybackI2S() {
  if (i2sPlaybackInstalled) {
    i2s_driver_uninstall(I2S_NUM_0);
    i2sPlaybackInstalled = false;
  }
  idlePlaybackDataPin();
}

static bool installPlaybackI2S(int sampleRateHz, int channels) {
  i2s_config_t i2s_config = {
    .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
    .sample_rate          = (uint32_t)sampleRateHz,
    .bits_per_sample      = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format       = (channels == 2) ? I2S_CHANNEL_FMT_RIGHT_LEFT : I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S_MSB,
    .intr_alloc_flags     = 0,
    .dma_buf_count        = 8,
    .dma_buf_len          = 1024,
    .use_apll             = false,
    .tx_desc_auto_clear   = true,
    .fixed_mclk           = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num    = I2S_SCK,
    .ws_io_num     = I2S_WS,
    .data_out_num  = I2S_PLAYBACK_DOUT,
    .data_in_num   = I2S_PIN_NO_CHANGE
  };

  if (i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL) != ESP_OK) {
    Serial.println("playback: i2s_driver_install TX failed");
    return false;
  }
  esp_err_t err = i2s_set_pin(I2S_NUM_0, &pin_config);
  if (err != ESP_OK) {
    Serial.printf("playback: i2s_set_pin failed: %d\n", (int)err);
    i2s_driver_uninstall(I2S_NUM_0);
    return false;
  }
  err = i2s_zero_dma_buffer(I2S_NUM_0);
  if (err != ESP_OK) {
    Serial.printf("playback: i2s_zero_dma_buffer failed: %d\n", (int)err);
  }
  i2sPlaybackInstalled = true;
  return true;
}

bool pollAnsweringMachine() {
  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();
  String url = String("https://") + serverHost + "/api/answering-machine";
  if (!http.begin(client, url)) {
    Serial.println("poll: begin failed");
    return false;
  }
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("ngrok-skip-browser-warning", "true");
  int code = http.GET();
  String body = http.getString();
  http.end();

  if (code == 404) {
    latestMsgKey = "";
    if (!firstAnsweringPollDone) {
      lastListenedMsgKey     = "";
      firstAnsweringPollDone = true;
    }
    return true;
  }
  if (code != 200) {
    Serial.printf("poll: HTTP %d\n", code);
    return false;
  }

  String fileName = extractJsonStringField(body, "fileName");
  String mtime    = extractJsonStringField(body, "mtime");
  buildMsgKey(fileName, mtime, &latestMsgKey);

  if (!firstAnsweringPollDone) {
    lastListenedMsgKey = latestMsgKey;
    firstAnsweringPollDone = true;
  }
  return true;
}

bool hasUnlistenedMessages() {
  if (latestMsgKey.length() == 0) return false;
  return latestMsgKey != lastListenedMsgKey;
}

// Keep decode buffers static; networking clients are heap-allocated per playback attempt.
static uint8_t          g_ansMachMp3buf[4096];
static int16_t          g_ansMachPcm[MINIMP3_MAX_SAMPLES_PER_FRAME];
void playbackWorker(void* /*unused*/);

// Stream HTTPS body in small chunks; decode + I2S in same loop. Returns true if playback completed without abort.
static bool streamAnsweringMachineMp3() {
  char urlBuf[192];
  snprintf(urlBuf, sizeof(urlBuf), "https://%s/api/answering-machine/audio", serverHost);

  WiFiClientSecure* client = new WiFiClientSecure();
  HTTPClient* http = new HTTPClient();
  if (!client || !http) {
    Serial.println("play: alloc client/http failed");
    if (http) delete http;
    if (client) delete client;
    return false;
  }
  client->setInsecure();

  if (!http->begin(*client, urlBuf)) {
    Serial.println("play: http begin failed");
    delete http;
    delete client;
    return false;
  }
  char authHdr[256];
  snprintf(authHdr, sizeof(authHdr), "Bearer %s", authToken);
  http->addHeader("Authorization", authHdr);
  http->addHeader("ngrok-skip-browser-warning", "true");
  int code = http->GET();
  if (code != 200) {
    Serial.printf("play: HTTP %d\n", code);
    http->end();
    delete http;
    delete client;
    return false;
  }

  WiFiClient* stream = http->getStreamPtr();
  if (!stream) {
    Serial.println("play: no stream");
    http->end();
    delete http;
    delete client;
    return false;
  }

  mp3dec_t dec;
  mp3dec_init(&dec);
  bool playbackI2sUp = false;
  bool decodeAborted = false;
  int  outRate       = 0;
  int  outCh         = 0;
  size_t filled      = 0;
  size_t totalRead   = 0;
  unsigned long lastDataMs = millis();

  while (stream->connected() || stream->available() || filled > 0) {
    while (filled < sizeof(g_ansMachMp3buf) && stream->available()) {
      size_t space = sizeof(g_ansMachMp3buf) - filled;
      int n = stream->read(g_ansMachMp3buf + filled, space);
      if (n > 0) {
        filled += (size_t)n;
        totalRead += (size_t)n;
        lastDataMs = millis();
        if (totalRead > MAX_ANSWERING_MACHINE_STREAM_BYTES) {
          Serial.println("play: stream size cap");
          decodeAborted = true;
          break;
        }
        continue;
      }
      if (n < 0) {
        break;
      }
      break;
    }
    if (decodeAborted) {
      break;
    }

    if (filled == 0 && !stream->connected()) {
      break;
    }
    if (filled == 0 && (millis() - lastDataMs) > 1500UL) {
      // Some servers keep TLS alive briefly at EOF; don't spin forever.
      break;
    }

    mp3dec_frame_info_t info;
    int samples = mp3dec_decode_frame(&dec, g_ansMachMp3buf, (int)filled, g_ansMachPcm, &info);

    if (info.frame_bytes > 0) {
      if ((size_t)info.frame_bytes > filled) {
        Serial.printf("play: bad frame size %d > %u\n", info.frame_bytes, (unsigned)filled);
        decodeAborted = true;
        break;
      }
      memmove(g_ansMachMp3buf, g_ansMachMp3buf + info.frame_bytes, filled - (size_t)info.frame_bytes);
      filled -= (size_t)info.frame_bytes;
    } else if (filled > 0 && samples == 0) {
      memmove(g_ansMachMp3buf, g_ansMachMp3buf + 1, filled - 1);
      filled--;
      continue;
    }

    if (samples > 0 && info.channels > 0 && info.hz > 0) {
      if (!playbackI2sUp || info.hz != outRate || info.channels != outCh) {
        if (playbackI2sUp) {
          uninstallPlaybackI2S();
          playbackI2sUp = false;
        }
        if (!installPlaybackI2S(info.hz, info.channels)) {
          decodeAborted = true;
          break;
        }
        playbackI2sUp = true;
        outRate         = info.hz;
        outCh           = info.channels;
      }

      size_t pcmBytes = (size_t)samples * (size_t)info.channels * sizeof(int16_t);
      size_t written  = 0;
      const uint8_t* p = (const uint8_t*)g_ansMachPcm;
      while (written < pcmBytes) {
        size_t w = 0;
        if (i2s_write(I2S_NUM_0, p + written, pcmBytes - written, &w, portMAX_DELAY) != ESP_OK) {
          decodeAborted = true;
          break;
        }
        written += w;
      }
      if (decodeAborted) {
        break;
      }
    }

    yield();
  }

  http->end();
  delete http;
  delete client;

  if (playbackI2sUp) {
    uninstallPlaybackI2S();
  }
  return !decodeAborted;
}

void playAnsweringMachineAudio() {
  bool micMutexHeld = false;
  if (i2sMicMutex) {
    micMutexHeld = (xSemaphoreTake(i2sMicMutex, pdMS_TO_TICKS(I2S_MUTEX_WAIT_MS)) == pdTRUE);
    if (!micMutexHeld) {
      Serial.println("play: mic mutex timeout");
      return;
    }
  }

  Serial.println("Playing answering-machine audio…");

  unsigned long waitStart = millis();
  while (uploadStreamActive && (millis() - waitStart) < 2500UL) {
    vTaskDelay(pdMS_TO_TICKS(20));
  }

  uninstallMicI2S();

  bool playedThrough = streamAnsweringMachineMp3();

  if (!installMicI2S()) {
    Serial.println("mic: reinstall failed after playback; retrying once");
    delay(20);
    installMicI2S();
  }

  if (micMutexHeld && i2sMicMutex) {
    xSemaphoreGive(i2sMicMutex);
  }

  if (playedThrough) {
    lastListenedMsgKey = latestMsgKey;
    Serial.println("Playback finished");
  }
}

// ============================================================
// Audio task (Core 0) — reads I2S, pushes chunks to queue
// ============================================================

void audioTask(void* param) {
  while (true) {

    // --- Not recording ---
    if (!recording) {
      if (stopRequested) {
        // Grab a slot from the pool to send the "end of stream" sentinel
        AudioChunk* chunk;
        if (xQueueReceive(freeChunks, &chunk, pdMS_TO_TICKS(500)) == pdTRUE) {
          chunk->size    = 0;
          chunk->isFinal = true;
          xQueueSend(audioQueue, &chunk, portMAX_DELAY);
          stopRequested = false;
        }
        // If pool is dry, retry next iteration rather than crashing
      }
      vTaskDelay(10);
      continue;
    }

    // --- Recording: borrow a slot from the static pool ---
    AudioChunk* chunk;
    if (xQueueReceive(freeChunks, &chunk, pdMS_TO_TICKS(100)) != pdTRUE) {
      // Network task hasn't returned a slot yet — drop this window rather than OOM
      Serial.println("audioTask: no free chunks, dropping window");
      vTaskDelay(pdMS_TO_TICKS(CHUNK_MS));
      continue;
    }

#if USE_MIC
    bool micMutexHeld = false;
    if (i2sMicMutex) {
      micMutexHeld = (xSemaphoreTake(i2sMicMutex, pdMS_TO_TICKS(I2S_MUTEX_WAIT_MS)) == pdTRUE);
      if (!micMutexHeld) {
        Serial.println("audioTask: mic mutex timeout");
        xQueueSend(freeChunks, &chunk, portMAX_DELAY);
        vTaskDelay(pdMS_TO_TICKS(10));
        continue;
      }
    }
    if (!recording) {
      if (micMutexHeld && i2sMicMutex) {
        xSemaphoreGive(i2sMicMutex);
      }
      xQueueSend(freeChunks, &chunk, portMAX_DELAY);
      continue;
    }
    size_t bytesRead = 0;
    esp_err_t rerr = i2s_read(I2S_NUM_0, chunk->data, CHUNK_BYTES, &bytesRead, pdMS_TO_TICKS(I2S_READ_TIMEOUT_MS));
    if (rerr != ESP_OK) {
      Serial.printf("audioTask: i2s_read failed: %d\n", (int)rerr);
      chunk->size = 0;
      if (!installMicI2S()) {
        Serial.println("audioTask: mic reinstall failed");
      }
    } else {
      chunk->size = bytesRead;
    }
    if (micMutexHeld && i2sMicMutex) {
      xSemaphoreGive(i2sMicMutex);
    }
#else
    // Sine-wave test tone (440 Hz)
    static float phase = 0.0f;
    const float increment = 2.0f * M_PI * 440.0f / SAMPLE_RATE;
    int16_t* samples = (int16_t*)chunk->data;
    for (int i = 0; i < BUFFER_SAMPLES; i++) {
      samples[i] = (int16_t)(sinf(phase) * 16000.0f);
      phase += increment;
      if (phase > 2.0f * M_PI) phase -= 2.0f * M_PI;
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

void networkTask(void* param) {
  Serial.println("Network task started");
  Serial.printf("Free heap: %d, largest block: %d\n",
    esp_get_free_heap_size(),
    heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));

  AudioChunk* chunk;
  bool streaming = false;

  while (true) {
    if (xQueueReceive(audioQueue, &chunk, portMAX_DELAY) != pdTRUE) continue;
    if (!chunk) continue;

    if (chunk->isFinal) {
      if (streaming) {
        closeStream();
        streaming = false;
        uploadStreamActive = false;
      }
      // Return sentinel slot back to pool
      xQueueSend(freeChunks, &chunk, portMAX_DELAY);

    } else {
      if (!streaming) {
        if (openStream()) {
          streaming = true;
          uploadStreamActive = true;
        } else {
          Serial.println("Connect failed — draining queue");
          uploadStreamActive = false;
          xQueueSend(freeChunks, &chunk, portMAX_DELAY);
          // Drain any buffered chunks back to the pool
          AudioChunk* drain;
          while (xQueueReceive(audioQueue, &drain, 0) == pdTRUE) {
            if (drain) xQueueSend(freeChunks, &drain, portMAX_DELAY);
          }
          vTaskDelay(pdMS_TO_TICKS(1000));
          continue;
        }
      }

      sendChunk(chunk->data, chunk->size);
      Serial.printf("Sent chunk %d (%zu bytes), free heap: %d\n",
        chunkIndex++, chunk->size, esp_get_free_heap_size());

      // Return slot to the pool so audioTask can reuse it
      xQueueSend(freeChunks, &chunk, portMAX_DELAY);
    }
  }
}

// ============================================================
// Setup
// ============================================================

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  idlePlaybackDataPin();

  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected!");

  configTime(0, 0, "pool.ntp.org");
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo)) {
    delay(500);
    Serial.println("Waiting for NTP...");
  }
  Serial.println("Time synced");

  // Pre-populate the free pool with pointers into the static array
  freeChunks = xQueueCreate(QUEUE_DEPTH, sizeof(AudioChunk*));
  audioQueue = xQueueCreate(QUEUE_DEPTH, sizeof(AudioChunk*));
  for (int i = 0; i < QUEUE_DEPTH; i++) {
    AudioChunk* p = &chunkPool[i];
    xQueueSend(freeChunks, &p, 0);
  }

  Serial.printf("Free heap before tasks: %d, largest block: %d\n",
    esp_get_free_heap_size(),
    heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));

  i2sMicMutex = xSemaphoreCreateMutex();

  if (!installMicI2S()) {
    Serial.println("setup: initial mic I2S install failed");
  }

  xTaskCreatePinnedToCore(audioTask,   "audio", 12288, NULL, 2, NULL, 0);
  xTaskCreatePinnedToCore(networkTask, "net",   16384, NULL, 1, NULL, 1);
  playbackTaskHandle = xTaskCreateStaticPinnedToCore(
    playbackWorker,
    "playback",
    PLAYBACK_TASK_STACK_WORDS,
    nullptr,
    1,
    playbackTaskStack,
    &playbackTaskTCB,
    1);
  if (playbackTaskHandle == nullptr) {
    Serial.println("playback: failed to create static task");
  }
}

// ============================================================
// Button debounce
// ============================================================

bool getIsButtonPressed() {
  static bool stableState  = (BUTTON_ACTIVE_STATE == HIGH) ? LOW : HIGH;
  static bool lastReading  = (BUTTON_ACTIVE_STATE == HIGH) ? LOW : HIGH;
  static int  stableCount  = 0;

  bool reading = digitalRead(BUTTON_PIN);

  if (reading == lastReading) stableCount++;
  else stableCount = 0;

  if (stableCount >= REQUIRED_STABLE) stableState = reading;

  lastReading = reading;
  return stableState == BUTTON_ACTIVE_STATE;
}

// Runs on a dedicated stack — not loopTask (TLS/HTTPClient blow past the ~8KB loop stack).
void playbackWorker(void* /*unused*/) {
  while (true) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    playAnsweringMachineAudio();
    playbackActive = false;
  }
}

// ============================================================
// Main loop — button, poll, LED, playback
// ============================================================

void loop() {
  unsigned long now = millis();

  if (lastPollMs == 0 || now - lastPollMs >= POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollAnsweringMachine();
  }

  static bool prevPressed = false;
  static unsigned long pressStartMs = 0;

  bool isPressed = getIsButtonPressed();

  if (isPressed && !prevPressed) {
    pressStartMs = millis();
    if (!playbackActive && !recording) {
      recording = true;
      chunkIndex = 0;
      struct tm timeinfo;
      if (getLocalTime(&timeinfo)) {
        char buf[20];
        strftime(buf, sizeof(buf), "%Y%m%d_%H%M%S", &timeinfo);
        recordingId = String(buf);
      } else {
        recordingId = String(millis());
      }
      Serial.printf("Recording started — id: %s, %dHz, %d samples/chunk (%dms)\n",
        recordingId.c_str(), SAMPLE_RATE, BUFFER_SAMPLES, CHUNK_MS);
    }
  }

  if (!isPressed && prevPressed) {
    unsigned long dur = millis() - pressStartMs;
    if (recording) {
      recording     = false;
      stopRequested = true;
      Serial.println("Recording stopped");
    }
    if (!playbackActive && dur >= SHORT_PRESS_MIN_MS && dur < SHORT_PRESS_MAX_MS) {
      playbackPending = true;
    }
  }

  prevPressed = isPressed;

  if (playbackPending && !recording && !playbackActive) {
    playbackPending = false;
    playbackActive  = true;
    pollAnsweringMachine();
    delay(300);
    if (playbackTaskHandle != nullptr) {
      xTaskNotifyGive(playbackTaskHandle);
    } else {
      Serial.println("playback: task missing");
      playbackActive = false;
    }
  }

  if (recording) {
    digitalWrite(LED_PIN, HIGH);
    doubleBlinkPhase   = 0;
    nextDoubleBlinkMs  = 0;
  } else if (playbackActive) {
    digitalWrite(LED_PIN, LOW);
  } else if (hasUnlistenedMessages()) {
    if (nextDoubleBlinkMs == 0) nextDoubleBlinkMs = now;
    if (now >= nextDoubleBlinkMs) {
      switch (doubleBlinkPhase) {
        case 0:
          digitalWrite(LED_PIN, HIGH);
          nextDoubleBlinkMs = now + 80;
          doubleBlinkPhase  = 1;
          break;
        case 1:
          digitalWrite(LED_PIN, LOW);
          nextDoubleBlinkMs = now + 120;
          doubleBlinkPhase  = 2;
          break;
        case 2:
          digitalWrite(LED_PIN, HIGH);
          nextDoubleBlinkMs = now + 80;
          doubleBlinkPhase  = 3;
          break;
        case 3:
          digitalWrite(LED_PIN, LOW);
          nextDoubleBlinkMs = now + DOUBLE_BLINK_PERIOD_MS;
          doubleBlinkPhase  = 0;
          break;
      }
    }
  } else {
    digitalWrite(LED_PIN, LOW);
    doubleBlinkPhase   = 0;
    nextDoubleBlinkMs  = 0;
  }

  delay(5);
}
