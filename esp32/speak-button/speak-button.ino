#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <driver/i2s.h>
#include "secrets.h"
#include <time.h>


const char* ssid = SECRET_SSID;
const char* password = SECRET_PASSWORD;

const char* serverHost = SECRET_SERVER_HOST;
const int serverPort = 443;
const char* uploadPath = "/api/upload-audio-stream";
String baseUrl = String("https://") + serverHost;

const char* authToken = SECRET_AUTH_TOKEN;

QueueHandle_t audioQueue;

#define BUTTON_PIN 34
#define BUTTON_ACTIVE_STATE HIGH
#define DEBOUNCE_MS 50
#define REQUIRED_STABLE 5

#define USE_MIC false

#define I2S_WS 15
#define I2S_SD 32
#define I2S_SCK 14
#define SAMPLE_RATE 16000
#define I2S_NUM I2S_NUM_0
#define BUFFER_SAMPLES 4000

struct AudioChunk {
  size_t size;
  bool isFinal;
  uint8_t data[BUFFER_SAMPLES * 2];
};

String recordingId = "";
volatile bool recording = false;
volatile int chunkIndex = 0;
volatile bool stopRequested = false;

// --- Chunked streaming over one persistent TLS connection ---
// Opens a single HTTPS connection, streams all audio chunks using
// HTTP/1.1 chunked transfer encoding, closes when isFinal is received.

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

  // Send HTTP headers — no Content-Length, use chunked encoding
  streamClient->printf(
    "POST /api/upload-audio-stream HTTP/1.1\r\n"
    "Host: %s\r\n"
    "Authorization: Bearer %s\r\n"
    "Content-Type: application/octet-stream\r\n"
    "Transfer-Encoding: chunked\r\n"
    "Connection: close\r\n"
    "ngrok-skip-browser-warning: true\r\n"
    "x-recording-id: %s\r\n"
    "\r\n",
    serverHost, authToken, recordingId.c_str()
  );

  Serial.println("Stream opened");
  return true;
}

void sendChunk(uint8_t* data, size_t len) {
  // Chunked encoding: hex size, CRLF, data, CRLF
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

// ---

void audioTask(void *param) {
  while (true) {
    if (!recording) {
      if (stopRequested) {
        AudioChunk* chunk = (AudioChunk*)malloc(sizeof(AudioChunk));
        chunk->size = 0;
        chunk->isFinal = true;
        xQueueSend(audioQueue, &chunk, portMAX_DELAY);
        stopRequested = false;
      }
      vTaskDelay(10);
      continue;
    }

    AudioChunk* chunk = (AudioChunk*)malloc(sizeof(AudioChunk));
    if (!chunk) {
      Serial.println("audioTask malloc failed!");
      vTaskDelay(50);
      continue;
    }

#if USE_MIC
    size_t bytesRead;
    i2s_read(I2S_NUM_0, chunk->data, sizeof(chunk->data), &bytesRead, portMAX_DELAY);
    chunk->size = bytesRead;
#else
     static float phase = 0.0f;
    const float freq = 440.0f;
    const float increment = 2.0f * M_PI * freq / SAMPLE_RATE;
    int16_t* samples = (int16_t*)chunk->data;
    for (int i = 0; i < BUFFER_SAMPLES; i++) {
      samples[i] = (int16_t)(sinf(phase) * 16000.0f);
      phase += increment;
      if (phase > 2.0f * M_PI) phase -= 2.0f * M_PI;
    }
    chunk->size = BUFFER_SAMPLES * 2;
    // pace to real audio rate: BUFFER_SAMPLES / SAMPLE_RATE seconds per chunk
    vTaskDelay(pdMS_TO_TICKS((BUFFER_SAMPLES * 1000) / SAMPLE_RATE)); // 250ms
#endif

    chunk->isFinal = false;
    xQueueSend(audioQueue, &chunk, portMAX_DELAY);
  }
}

void networkTask(void *param) {
  Serial.println("network task!!!");
  Serial.printf("Free heap: %d, largest block: %d\n",
    esp_get_free_heap_size(),
    heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));

  AudioChunk* chunk;
  bool streaming = false;

  while (true) {
    if (xQueueReceive(audioQueue, &chunk, portMAX_DELAY)) {
      if (!chunk) continue;

      if (chunk->isFinal) {
        if (streaming) {
          closeStream();
          streaming = false;
        }
        free(chunk);
      } else {
        if (!streaming) {
          if (openStream()) {
            streaming = true;
          } else {
            Serial.println("Connect failed, draining queue");
            free(chunk);
            AudioChunk* drain;
            while (xQueueReceive(audioQueue, &drain, 0) == pdTRUE) {
              if (drain) free(drain);
            }
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
          }
        }
        sendChunk(chunk->data, chunk->size);
        Serial.printf("Sent chunk %d, free heap: %d\n",
          chunkIndex++,
          esp_get_free_heap_size());
        free(chunk);
      }
    }
  }
}

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

  configTime(0, 0, "pool.ntp.org"); // UTC
  struct tm timeinfo;
  while (!getLocalTime(&timeinfo)) {
    delay(500);
    Serial.println("Waiting for NTP...");
  }
  Serial.println("Time synced");

  audioQueue = xQueueCreate(10, sizeof(AudioChunk*));

  xTaskCreatePinnedToCore(audioTask, "audio", 12288, NULL, 2, NULL, 0);

  Serial.printf("Free heap before net task: %d\n", esp_get_free_heap_size());
  Serial.printf("Largest free block: %d\n", heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));

  xTaskCreatePinnedToCore(networkTask, "net", 16384, NULL, 1, NULL, 1);

#if USE_MIC
  i2s_driver_install(I2S_NUM, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM, &pin_config);
#endif

  i2s_config_t i2s_config = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
      .sample_rate = SAMPLE_RATE,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
      .communication_format = I2S_COMM_FORMAT_I2S_MSB,
      .intr_alloc_flags = 0,
      .dma_buf_count = 4,
      .dma_buf_len = 1024,
      .use_apll = false,
      .tx_desc_auto_clear = false,
      .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
      .bck_io_num = I2S_SCK,
      .ws_io_num = I2S_WS,
      .data_out_num = I2S_PIN_NO_CHANGE,
      .data_in_num = I2S_SD
  };

  i2s_driver_install(I2S_NUM, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM, &pin_config);
}

bool lastButtonState = !BUTTON_ACTIVE_STATE;
unsigned long lastDebounceTime = 0;

bool getIsButtonPressed() {
  static bool stableState = BUTTON_ACTIVE_STATE == HIGH ? LOW : HIGH;
  static bool lastReading = BUTTON_ACTIVE_STATE == HIGH ? LOW : HIGH;
  static int stableCount = 0;

  bool reading = digitalRead(BUTTON_PIN);

  if (reading == lastReading) stableCount++;
  else stableCount = 0;

  if (stableCount >= REQUIRED_STABLE) stableState = reading;

  lastReading = reading;
  return stableState == BUTTON_ACTIVE_STATE;
}

void loop() {
  bool isPressed = getIsButtonPressed();

  if (isPressed && !recording) {
    recording = true;
    struct tm timeinfo;
    if (getLocalTime(&timeinfo)) {
      char buf[20];
      strftime(buf, sizeof(buf), "%Y%m%d_%H%M%S", &timeinfo);
      recordingId = String(buf);
    } else {
      recordingId = String(millis()); // fallback
    }    
    chunkIndex = 0;
    Serial.println("Recording started");
  }

  if (!isPressed && recording) {
    recording = false;
    stopRequested = true;
    Serial.println("Recording stopped");
  }

  delay(5);
}