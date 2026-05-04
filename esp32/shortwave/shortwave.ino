// shortwave.ino — Answering-machine recorder/player for ESP32-S3
//
// Added: Test tone playback if button is held 2+ sec on boot (diagnostics)
// Added: Logs for playback output pin activity

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebSocketsClient.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <time.h>
#include <Update.h>
#include <ESP32I2SAudio.h>
#include <BackgroundAudioMP3.h>
#include "driver/i2s_std.h"
#include "esp_rom_gpio.h"
#include "soc/gpio_sig_map.h"
#include "env.h"
#include <math.h> // for sin()

#ifndef DEVICE_ID_RESET
#define DEVICE_ID_RESET false
#endif

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

#define ANSWERING_MACHINE_POLL_INTERVAL_MS       60000UL
#define DEVICE_INFO_POLL_INTERVAL_MS  60000UL

#define OTA_CHECK_INTERVAL_MS  600000UL
#define RECORD_HOLD_MS         300UL   // hold longer than this to record; tap shorter for playback
#define SHORT_PRESS_MIN_MS     40      // debounce: ignore taps shorter than this
#define DOUBLE_BLINK_PERIOD_MS 2000UL
#define BUTTON_ACTIVE_STATE    HIGH

// ============================================================
// Credentials
// ============================================================

const char* serverHost = ENV_SERVER_HOST;
const int   serverPort = 443;
const char* authToken  = ENV_AUTH_TOKEN;
const char* wsToken = WS_TOKEN;

const char* portalSsid = "sh0rtwave-setup";
const char* firmwareVersion = "shortwave-2026-05-03.2";

static DNSServer dnsServer;
static WebServer portalServer(80);
static Preferences wifiPrefs;
static Preferences msgPrefs;
static Preferences devicePrefs;
static WebSocketsClient wsClient;

static bool portalWantsConnect = false;
static String portalNewSsid;
static String portalNewPassword;
static String deviceId = "";
static float g_gain = 0.1f;  
static unsigned long lastWsMessageMs    = 0;
static bool wsReady = false;

static void loadDeviceIdFromPrefs() {
  devicePrefs.begin("device", false);
#if DEVICE_ID_RESET
  deviceId = String(DEVICE_ID);
  if (deviceId.length() > 0) {
    devicePrefs.putString("id", deviceId);
  }
#else
  deviceId = devicePrefs.getString("id", "");
  if (deviceId.length() == 0) {
    deviceId = String(DEVICE_ID);
    if (deviceId.length() > 0) {
      devicePrefs.putString("id", deviceId);
    }
  }
#endif
  devicePrefs.end();
  Serial.printf("device id: %s\n", deviceId.c_str());
}

static void loadGainFromPrefs() {
  devicePrefs.begin("device", false);
  g_gain = devicePrefs.getFloat("gain", 0.1f);
  Serial.printf("gain is: %f\n", g_gain);
}

static bool connectToWifi(const char* ssid, const char* password, unsigned long timeoutMs = 15000UL) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.printf("Connecting to Wi-Fi SSID: %s\n", ssid);
  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startMs < timeoutMs) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }
  Serial.println("\nConnection timed out.");
  WiFi.disconnect(true, true);
  delay(250);
  return false;
}

static void startWifiPortal() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(portalSsid);
  delay(100);
  const IPAddress apIp = WiFi.softAPIP();
  dnsServer.start(53, "*", apIp);

  portalServer.on("/", HTTP_GET, []() {
    String page =
      "<!DOCTYPE html><html><head>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>sh0rtwave setup</title>"
      "<style>"
        "body{font-family:sans-serif;max-width:440px;margin:2.5rem auto;padding:2rem 1.4rem 1rem;background:#f4f6fa;color:#222;box-shadow:0 4px 16px #0001;border-radius:18px;}"
        "h2{margin-top:0;font-size:2rem;font-weight:700;letter-spacing:-1px;}"
        "form{margin:2.2rem 0 .5rem 0;}"
        "label{display:block;margin-bottom:.85rem;font-weight:600;font-size:1rem;}"
        "input[type='text'],input[type='password']{width:100%;padding:.65rem .8rem;border:1.5px solid #ccd2e3;border-radius:10px;font-size:1.05rem;box-sizing:border-box;margin-top:.2em;margin-bottom:.4em;}"
        "button{padding:.8rem 1.7rem;border:none;border-radius:10px;background:#3367d6;color:white;font-weight:600;font-size:1.05rem;letter-spacing:.03em;box-shadow:0 2px 6px #0002;cursor:pointer;margin-top:.8rem;transition:.1s background;}"
        "button:hover{background:#254b9c;}"
        ".device-id{margin-top:2.3rem;padding:1rem .9rem;background:#eef0f5;border-radius:10px;color:#444;font-size:.97rem;word-break:break-all;}"
      "</style></head>"
      "<body>"
      "<h2>Connect sh0rtwave</h2>"
      "<div class='device-id'><b>Device ID:</b><br>" + deviceId + "</div>"
      "<p style='margin-top:2.1rem;'>"
      "Enter your Wi-Fi credentials to connect your device:"
      "</p>"
      "<form action='/save' method='POST'>"
      "<label>SSID<br><input name='ssid' type='text' autocomplete='username wifi-ssid'></label>"
      "<label>Password<br><input name='password' type='password' autocomplete='current-password wifi-password'></label>"
      "<button type='submit'>Connect</button>"
      "</form>"
      "<p style='color:#7e869a;margin-top:2.2rem;font-size:.97rem;'>"
      "If your Wi-Fi is hidden or does not show up, type its name (SSID) and password manually."
      "</p>"
      "</body></html>";
 
    portalServer.send(200, "text/html", page);
  });

  portalServer.on("/save", HTTP_POST, []() {
    if (!portalServer.hasArg("ssid")) {
      portalServer.send(400, "text/plain", "Missing ssid.");
      return;
    }
    portalNewSsid = portalServer.arg("ssid");
    portalNewPassword = portalServer.arg("password");
    portalWantsConnect = true;
    portalServer.send(200, "text/html",
      "<html><body style='font-family:sans-serif;max-width:420px;margin:2rem auto;'>"
      "<h3>Trying to connect...</h3><p>You can close this page in a few seconds.</p>"
      "</body></html>");
  });

  portalServer.onNotFound([]() {
    portalServer.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
    portalServer.send(302, "text/plain", "");
  });

  portalServer.begin();
  Serial.println("Wi-Fi setup portal started.");
  Serial.print("Connect to AP: ");
  Serial.println(portalSsid);
  Serial.print("Open: http://");
  Serial.println(apIp);
}

static void connectWifiWithPortal() {
  wifiPrefs.begin("wifi", false);
  if (FORCE_WIFI_ONBOARDING) {
    wifiPrefs.clear();
  }
  String savedSsid = wifiPrefs.getString("ssid", "");
  String savedPassword = wifiPrefs.getString("password", "");

  if (savedSsid.length() > 0 && connectToWifi(savedSsid.c_str(), savedPassword.c_str())) {
    wifiPrefs.end();
    return;
  }

  startWifiPortal();
  while (WiFi.status() != WL_CONNECTED) {
    dnsServer.processNextRequest();
    portalServer.handleClient();
    if (portalWantsConnect) {
      portalWantsConnect = false;
      if (portalNewSsid.length() > 0 && connectToWifi(portalNewSsid.c_str(), portalNewPassword.c_str(), 20000UL)) {
        wifiPrefs.putString("ssid", portalNewSsid);
        wifiPrefs.putString("password", portalNewPassword);
        portalServer.stop();
        dnsServer.stop();
        WiFi.softAPdisconnect(true);
        wifiPrefs.end();
        return;
      }
      Serial.println("Portal connect attempt failed. Re-opening portal...");
      portalServer.stop();
      dnsServer.stop();
      WiFi.softAPdisconnect(true);
      // Recursively call connectWifiWithPortal to restart the portal
      wifiPrefs.end();
      connectWifiWithPortal();
      return;
    }
    delay(10);
  }

  wifiPrefs.end();
}

static void setGainFromConfigJson(const String& json) {
    String volumeStr = extractJsonStringValue(json, "volume");
    if (volumeStr.length() > 0) {
      Serial.printf("Extracted volume: %s\n", volumeStr);
      float gain = volumeStr.toFloat() / 100.0f;
      Serial.printf("Setting gain: %f\n", gain);
      setGain(gain);
    }
}

static void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  // Print wsEvent safely with explicit length (guard for null/non-string payload)
  if (payload && length > 0) {
    Serial.print("wsEvent ");
    for (size_t i = 0; i < length; ++i) Serial.print((char)payload[i]);
    Serial.printf(" %d\n", (int)length);
  } else {
    Serial.printf("wsEvent <null> %d\n", (int)length);
  }

  switch (type) {
    case WStype_CONNECTED: {
      Serial.print("received CONNECTED message\n");

      wsReady = true;
      String msg = String("{\"type\":\"register\",\"id\":\"") + deviceId + "\",\"token\":\"" + wsToken + "\"}";
      wsClient.sendTXT(msg);
      break;
    }
    case WStype_DISCONNECTED:
      Serial.print("received DISCONNECTED message");

      wsReady = false;
      break;
    case WStype_TEXT: {
      String message;
      if (payload && length > 0) {
        message.reserve(length + 1);
        for (size_t i = 0; i < length; ++i) message += (char)payload[i];
      }
      Serial.printf("received TEXT message %s\n", message);
      setGainFromConfigJson(message);
      lastWsMessageMs = millis();
      break;
    }
    default:
      break;
  }
}

// ============================================================
// BackgroundAudio (speaker output, I2S_NUM_0 via library)
// ============================================================

static ESP32I2SAudio           g_i2sOut(I2S_PLAY_SCK, I2S_PLAY_WS, I2S_PLAY_DOUT);
static BackgroundAudioMP3Class<RawDataBuffer<8 * 1024>> g_mp3(g_i2sOut);
static bool g_mp3Started = false;


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

static bool          playbackPending    = false;
static bool          playbackActive     = false;
static unsigned long lastPollMs         = 0;
static unsigned long lastOtaCheckMs     = 0;
static unsigned long lastDeviceInfoCheckMs = 0;
static unsigned long nextDoubleBlinkMs  = 0;
static int           doubleBlinkPhase   = 0;

static TaskHandle_t playbackTask = nullptr;


static float getGain() {
  return devicePrefs.getFloat("gain", 0.1f);
}

static void setGain(const float& val) {
  devicePrefs.putFloat("gain", val);
  g_mp3.setGain(val);
}

static String getLatestMsgKey() {
  return msgPrefs.getString("latestKey", "");
}

static void setLatestMsgKey(const String& key) {
  msgPrefs.putString("latestKey", key);
}

static String getLastListenedMsgKey() {
  return msgPrefs.getString("listenedKey", "");
}

static void setLastListenedMsgKey(const String& key) {
  msgPrefs.putString("listenedKey", key);
}

static void loadMessageStateFromPrefs() {
  msgPrefs.begin("msgstate", false);
  Serial.printf("msg state: latest=%s listened=%s\n",
                getLatestMsgKey().c_str(),
                getLastListenedMsgKey().c_str());
}

// ============================================================
// HTTPS stream helpers (upload)
// ============================================================

static WiFiClientSecure* streamClient = nullptr;

// This implementation only works to extract string values in the form: "key":"value"
// (i.e., the value must be a quoted string immediately after the colon).
// It will not extract numbers, booleans, or null.
// For example: {"foo":"bar"} works, {"foo":123} or {"foo":true} will not.
static String extractJsonStringValue(const String& json, const char* key) {
  String pat = String("\"") + key + "\":\"";
  int i = json.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  int j = json.indexOf('"', i);
  if (j < 0) return "";
  return json.substring(i, j);
}

// Helper to extract a number (int or float as string) from JSON in the form: "key":123
// Returns "" if not found or invalid
static String extractJsonNumberValue(const String& json, const char* key) {
  String pat = String("\"") + key + "\":";
  int i = json.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  // Skip whitespace
  while (i < (int)json.length() && isspace(json[i])) ++i;
  if (i >= (int)json.length()) return "";

  int j = i;
  // Accept optional leading minus
  if (json[j] == '-') ++j;
  // Parse number (int/float): [0-9.]+ (stop at non-digit/non-dot)
  bool foundDigit = false;
  while (j < (int)json.length() && 
         ((json[j] >= '0' && json[j] <= '9') || json[j] == '.')) {
    if (json[j] >= '0' && json[j] <= '9') foundDigit = true;
    ++j;
  }
  if (!foundDigit) return "";
  return json.substring(i, j);
}

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
    serverHost, authToken, recordingId.c_str(), ENV_SAMPLE_RATE, deviceId.c_str());
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

static String resolveOtaUrl(const String& maybeUrl) {
  if (maybeUrl.startsWith("https://") || maybeUrl.startsWith("http://")) {
    return maybeUrl;
  }
  if (maybeUrl.startsWith("/")) {
    return String("https://") + serverHost + maybeUrl;
  }
  return "";
}

static bool installOtaFromUrl(const String& url) {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, url)) {
    Serial.printf("ota: http begin failed for %s\n", url.c_str());
    return false;
  }

  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("x-device-id", deviceId);
  http.addHeader("x-firmware-version", String(firmwareVersion));
  http.addHeader("ngrok-skip-browser-warning", "true");

  int code = http.GET();
  if (code != 200) {
    Serial.printf("ota: download HTTP %d\n", code);
    http.end();
    return false;
  }

  int contentLength = http.getSize();
  if (contentLength <= 0) {
    Serial.printf("ota: invalid content length %d\n", contentLength);
    http.end();
    return false;
  }

  if (!Update.begin((size_t)contentLength)) {
    Serial.printf("ota: Update.begin failed (err=%u)\n", Update.getError());
    http.end();
    return false;
  }

  WiFiClient* stream = http.getStreamPtr();
  size_t written = Update.writeStream(*stream);
  if (written != (size_t)contentLength) {
    Serial.printf("ota: wrote %u of %d bytes\n", (unsigned)written, contentLength);
  }

  if (!Update.end()) {
    Serial.printf("ota: Update.end failed (err=%u)\n", Update.getError());
    http.end();
    return false;
  }

  if (!Update.isFinished()) {
    Serial.println("ota: update did not finish");
    http.end();
    return false;
  }

  http.end();
  Serial.println("ota: update installed, restarting");
  delay(200);
  ESP.restart();
  return true;
}

static bool checkForOtaUpdate() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, String("https://") + serverHost + "/api/device/" + deviceId + "/ota")) {
    Serial.println("ota: metadata begin failed");
    return false;
  }

  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("x-device-id", deviceId);
  http.addHeader("x-firmware-version", String(firmwareVersion));
  http.addHeader("ngrok-skip-browser-warning", "true");

  int code = http.GET();
  String body = http.getString();
  http.end();

  if (code != 200) {
    Serial.printf("ota: metadata HTTP %d\n", code);
    return false;
  }

  String otaVersion = extractJsonStringValue(body, "otaVersion");
  String firmwareUrl = resolveOtaUrl(extractJsonStringValue(body, "firmwareUrl"));
  if (otaVersion.length() == 0) {
    Serial.println("ota: metadata missing otaVersion");
    return false;
  }

  if (otaVersion == firmwareVersion) {
    Serial.printf("ota: up to date (%s)\n", firmwareVersion);
    return true;
  }

  if (firmwareUrl.length() == 0) {
    Serial.printf("ota: update %s available but no firmwareUrl\n", otaVersion.c_str());
    return false;
  }

  Serial.printf("ota: updating %s -> %s\n", firmwareVersion, otaVersion.c_str());
  return installOtaFromUrl(firmwareUrl);
}

static bool pollAnsweringMachine() {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, String("https://") + serverHost + "/api/device/" + deviceId + "/answering-machine")) return false;
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("x-device-id", deviceId);
  http.addHeader("ngrok-skip-browser-warning", "true");
  int code = http.GET();
  String body = http.getString(); http.end();
  if (code == 404) {
    setLatestMsgKey("");
    return true;
  }
  if (code != 200) { Serial.printf("poll: HTTP %d\n", code); return false; }
  String fn = extractJsonStringValue(body, "fileName");
  String mt = extractJsonStringValue(body, "mtime");
  String latestMsgKey = (fn.length() && mt.length()) ? fn + "|" + mt : "";
  setLatestMsgKey(latestMsgKey);
  return true;
}

static bool hasUnlistenedMessages() {
  String latestMsgKey = getLatestMsgKey();
  String lastListenedMsgKey = getLastListenedMsgKey();
  return latestMsgKey.length() > 0 && latestMsgKey != lastListenedMsgKey;
}

static bool phoneHome() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, String("https://") + serverHost + "/api/device/" + deviceId + "/phone-home")) {
    Serial.println("phoneHome: http begin failed");
    return false;
  }

  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("x-device-id", deviceId);
  http.addHeader("x-firmware-version", String(firmwareVersion));
  http.addHeader("x-device-type", "shortwave");
  http.addHeader("ngrok-skip-browser-warning", "true");

  int code = http.POST((uint8_t*)nullptr, 0);
  String body = http.getString();

  http.end();

  if (code >= 200 && code < 300) {
    Serial.printf("phoneHome: success (%d)\n", code);
    Serial.println("Returned JSON body:");
    Serial.println(body);
    return true;
  }

  Serial.printf("phoneHome: HTTP %d, body: %s\n", code, body.c_str());
  return false;
}

static bool getDeviceInfo() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, String("https://") + serverHost + "/api/device/" + deviceId)) {
    Serial.println("getDeviceInfo: http begin failed");
    return false;
  }

  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("x-device-id", deviceId);
  http.addHeader("x-firmware-version", String(firmwareVersion));
  http.addHeader("x-device-type", "shortwave");
  http.addHeader("ngrok-skip-browser-warning", "true");

  int code = http.GET();
  String body = http.getString();

  http.end();

  if (code >= 200 && code < 300) {
    Serial.printf("getDeviceInfo: success (%d)\n", code);
    Serial.println("Returned JSON body:");
    Serial.println(body);
    setGainFromConfigJson(body);
    return true;
  }

  Serial.printf("getDeviceInfo: HTTP %d, body: %s\n", code, body.c_str());
  return false;
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

  snprintf(url, sizeof(url), "https://%s/api/device/%s/answering-machine/mp3", serverHost, deviceId.c_str());
  Serial.printf("Streaming from URL: %s\n", url);

  WiFiClientSecure* client = new WiFiClientSecure();
  HTTPClient*       http   = new HTTPClient();
  client->setInsecure();

  if (!http->begin(*client, url)) {
    Serial.println("play: http begin failed");
    delete http; delete client; return false;
  }
  http->addHeader("Authorization", String("Bearer ") + authToken);
  http->addHeader("x-device-id", deviceId);
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
  if (stopPlayback) return;  // canceled before worker began
  while (recording || stopRequested || uploadStreamActive) vTaskDelay(pdMS_TO_TICKS(20));
  if (stopPlayback) return;  // canceled while waiting for record/upload to drain

  // Disable mic during playback — both peripherals share the I2S DMA bus and
  // having the mic's DMA running in the background causes audible noise.
  micDisable();

  if (!g_mp3Started) {
    // First playback: mic already disabled above, so BackgroundAudio can claim
    // the BCLK/WS pins (GPIO 9/46) as I2S master without any conflict.
    g_mp3.begin();
    g_mp3Started = true;

  }

  float curGain = getGain();
  Serial.printf("Playing with gain %f\n", curGain);
  g_mp3.setGain(curGain);

  g_mp3.flush();

  bool ok = streamAnsweringMachineMp3();

  // Re-enable mic in slave mode now that playback is done.
  // BackgroundAudio's DMA keeps the I2S clock running continuously (it outputs
  // silence when idle), so the slave mic will have a valid clock for future
  // recordings — UNLESS we ever temporarily made the mic a master (see loop()),
  // in which case networkTask restores GPIO routing after upload finishes.
  micEnable();  // slave: g_mp3Started is now true

  if (ok) {
    setLastListenedMsgKey(getLatestMsgKey());
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

    i2s_chan_handle_t micChan = g_micRxChan;
    if (!micChan) { vTaskDelay(10); continue; }

    AudioChunk* chunk;
    if (xQueueReceive(freeChunks, &chunk, pdMS_TO_TICKS(100)) != pdTRUE) {
      vTaskDelay(pdMS_TO_TICKS(CHUNK_MS));
      continue;
    }

    size_t bytesRead = 0;
    esp_err_t err = i2s_channel_read(micChan, rawBuf,
                                     BUFFER_SAMPLES * sizeof(int32_t),
                                     &bytesRead, pdMS_TO_TICKS(250));
    if (err != ESP_OK) {
      chunk->size = 0;
      // Recover only if this task still owns the same live channel handle.
      if (micChan == g_micRxChan && micChan) {
        i2s_channel_disable(micChan);
        i2s_channel_enable(micChan);
      }
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
  analogWrite(LED_PIN, 0);

  // Drive speaker I2S pins low before BackgroundAudio claims them.
  // Floating pins on an idle amplifier produce audible noise on boot.
  pinMode(I2S_PLAY_SCK,  OUTPUT); digitalWrite(I2S_PLAY_SCK,  LOW);
  pinMode(I2S_PLAY_WS,   OUTPUT); digitalWrite(I2S_PLAY_WS,   LOW);
  pinMode(I2S_PLAY_DOUT, OUTPUT); digitalWrite(I2S_PLAY_DOUT, LOW);

  // Clear saved Wi-Fi credentials if button is held for >2 seconds on boot.
  unsigned long bootHoldStart = millis();
  bool clearWifiCreds = false;
  while (millis() - bootHoldStart < 2100 && digitalRead(BUTTON_PIN) == BUTTON_ACTIVE_STATE) {
    if (!clearWifiCreds) {
      Serial.println("Button held on boot: Wi-Fi credentials will be cleared.");
      clearWifiCreds = true;
    }
    delay(10);
  }
  if (clearWifiCreds) {
    wifiPrefs.begin("wifi", false);
    wifiPrefs.remove("ssid");
    wifiPrefs.remove("password");
    wifiPrefs.end();
    Serial.println("Saved Wi-Fi credentials cleared.");
  }

  loadDeviceIdFromPrefs();
  loadGainFromPrefs();
  connectWifiWithPortal();
  loadMessageStateFromPrefs();
  phoneHome();
  getDeviceInfo();
  checkForOtaUpdate();
  // Smoothly ramp LED brightness up and back down three times, adjusting for perceived (logarithmic) brightness
  // Uses a gamma correction curve for smoother "apparent" brightness
  const float gamma = 2.2; // Typical gamma for LEDs
  const int steps = 48;    // More steps = smoother

  for (int j = 0; j < 3; j++) {
    // Ramp up perceived brightness
    for (int step = 0; step <= steps; step++) {
      float normalized = (float)step / steps;
      int ledVal = (int)(pow(normalized, gamma) * 255.0f + 0.5f);
      analogWrite(LED_PIN, ledVal);
      delay(8);
    }
    // Ramp down perceived brightness
    for (int step = steps; step >= 0; step--) {
      float normalized = (float)step / steps;
      int ledVal = (int)(pow(normalized, gamma) * 255.0f + 0.5f);
      analogWrite(LED_PIN, ledVal);
      delay(8);
    }
    delay(50);
  }
  analogWrite(LED_PIN, 0); // Ensure LED is off at end


  
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
  wsClient.beginSSL(serverHost, 443, "/api/ws");
  wsClient.onEvent(wsEvent);
  wsClient.setReconnectInterval(2000);
  wsClient.enableHeartbeat(15000, 5000, 3); // ping every 15s, 5s timeout, 3 retries

}

// ============================================================
// loop
// ============================================================

void loop() {
  wsClient.loop();
  unsigned long now = millis();
  static unsigned long lastVolMs = 0;


  if (lastPollMs == 0 || now - lastPollMs >= ANSWERING_MACHINE_POLL_INTERVAL_MS) {
    lastPollMs = now;
    pollAnsweringMachine();
  }

  if (lastOtaCheckMs == 0 || now - lastOtaCheckMs >= OTA_CHECK_INTERVAL_MS) {
    lastOtaCheckMs = now;
    checkForOtaUpdate();
  }

  if (lastDeviceInfoCheckMs == 0 || now - lastDeviceInfoCheckMs >= DEVICE_INFO_POLL_INTERVAL_MS) {
    lastDeviceInfoCheckMs = now;
    getDeviceInfo();
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
    // A long-press to record should cancel any queued/active playback.
    playbackPending = false;
    stopPlayback    = true;
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
      while (playbackActive && millis() - t0 < 800) delay(10);
    }
    // Reconfigure mic first, then arm recording so audioTask never touches
    // a channel handle while it is being deleted/recreated.
    micDisable();
    micEnable(true);  // master for the duration of this recording
    recording  = true;
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
      // Quick double-blink LED to acknowledge short press
      analogWrite(LED_PIN, 255);
      delay(60);
      analogWrite(LED_PIN, 0);
      delay(60);
      analogWrite(LED_PIN, 255);
      delay(60);
      analogWrite(LED_PIN, 0);
      // Short tap: trigger playback (recording never started)
      Serial.println("[PLAYBACK] Button tap detected: will trigger playback.");

      playbackPending = true;
    }
    holdingToRecord = false;
  }
  prevPressed = isPressed;

  if (playbackPending && !recording && !playbackActive && !isPressed && !holdingToRecord) {
    playbackPending = false;
    playbackActive  = true;
    stopPlayback    = false;
    pollAnsweringMachine();
    if (playbackTask) {
      Serial.println("[PLAYBACK] Notifying playback task to start output.");
      xTaskNotifyGive(playbackTask);
    }
    else { Serial.println("playback task missing"); playbackActive = false; }
  }

  // LED
  if (recording) {
    analogWrite(LED_PIN, 255);
    doubleBlinkPhase = 0; nextDoubleBlinkMs = 0;
  } else if (playbackActive) {
    analogWrite(LED_PIN, 0);
  } else if (hasUnlistenedMessages()) {
    if (nextDoubleBlinkMs == 0) nextDoubleBlinkMs = now;
    if (now >= nextDoubleBlinkMs) {
      switch (doubleBlinkPhase) {
        case 0: analogWrite(LED_PIN, 255); nextDoubleBlinkMs = now + 80;                     doubleBlinkPhase = 1; break;
        case 1: analogWrite(LED_PIN, 0);  nextDoubleBlinkMs = now + 120;                    doubleBlinkPhase = 2; break;
        case 2: analogWrite(LED_PIN, 255); nextDoubleBlinkMs = now + 80;                     doubleBlinkPhase = 3; break;
        case 3: analogWrite(LED_PIN, 0);  nextDoubleBlinkMs = now + DOUBLE_BLINK_PERIOD_MS; doubleBlinkPhase = 0; break;
      }
    }
  } else {
    analogWrite(LED_PIN, 0);
    doubleBlinkPhase = 0; nextDoubleBlinkMs = 0;
  }

  delay(5);
}
