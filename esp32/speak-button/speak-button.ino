#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include "secrets.h"
#include <time.h>

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
    size_t bytesRead = 0;
    i2s_read(I2S_NUM_0, chunk->data, CHUNK_BYTES, &bytesRead, portMAX_DELAY);
    chunk->size = bytesRead;
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
      }
      // Return sentinel slot back to pool
      xQueueSend(freeChunks, &chunk, portMAX_DELAY);

    } else {
      if (!streaming) {
        if (openStream()) {
          streaming = true;
        } else {
          Serial.println("Connect failed — draining queue");
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

  xTaskCreatePinnedToCore(audioTask,   "audio", 12288, NULL, 2, NULL, 0);
  xTaskCreatePinnedToCore(networkTask, "net",   16384, NULL, 1, NULL, 1);

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
  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
#endif
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

// ============================================================
// Main loop — button handling only
// ============================================================

void loop() {
  bool isPressed = getIsButtonPressed();

  if (isPressed && !recording) {
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

  if (!isPressed && recording) {
    recording     = false;
    stopRequested = true;
    Serial.println("Recording stopped");
  }

  delay(5);
}
