#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <Update.h>
#include "env.h"

#ifndef FORCE_ID_RESET
#define FORCE_ID_RESET false
#endif

const char* serverHost = SERVER_HOST;
const char* authToken = AUTH_TOKEN;
const char* wsToken = WS_TOKEN;
const char* portalSsid = "toggle-setup";
const char* firmwareVersion = "toggle-2026-04-28-1";

#define OTA_CHECK_INTERVAL_MS 600000UL

static DNSServer dnsServer;
static WebServer portalServer(80);
static Preferences wifiPrefs;
static Preferences devicePrefs;
static WebSocketsClient wsClient;

static bool portalWantsConnect = false;
static String portalNewSsid;
static String portalNewPassword;

static unsigned long lastPollMs = 0;
static unsigned long lastWsMessageMs = 0;
static unsigned long lastOtaCheckMs = 0;
static unsigned long lastSwitchDebounceMs = 0;
static bool lastSwitchReading = false;
static bool switchState = false;
static bool wsReady = false;
static String deviceId = "";
static String groupId = "";


// Store and load groupId in/from Preferences like deviceId
static void loadIdsFromPrefs() {
  devicePrefs.begin("device", false);
#if FORCE_ID_RESET
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

  // Group ID storage
  groupId = devicePrefs.getString("groupId", "");
  if (groupId.length() == 0) {
    groupId = String(GROUP_ID);
    if (groupId.length() > 0) {
      devicePrefs.putString("groupId", groupId);
    }
  }

  devicePrefs.end();
  Serial.printf("device id: %s\n", deviceId.c_str());
  Serial.printf("group id: %s\n", groupId.c_str());
}

// For common anode: LED is ON when pin is LOW, OFF when pin is HIGH.
// For common cathode: LED is ON when pin is HIGH, OFF when pin is LOW.
// We want `setRgb(true, false, false)` to always mean "red on" regardless of LED type.

static void setRgb(bool red, bool green, bool blue) {
  writeRgbPin(LED_R_PIN, red);
  writeRgbPin(LED_G_PIN, green);
  writeRgbPin(LED_B_PIN, blue);
}

static void writeRgbPin(uint8_t pin, bool on) {
  // For common anode, driving pin LOW turns on the LED (active LOW).
  // For common cathode, driving pin HIGH turns on the LED (active HIGH).
  // So invert for common anode.
  digitalWrite(pin, IS_RGB_LED_COMMON_ANODE ? !on : on);
}

static void showGreen() { setRgb(false, true, false); }
static void showBlue() { setRgb(false, false, true); }
static void showRed() { setRgb(true, false, false); }

static void flashRainbowConnected() {
  setRgb(true, false, false);
  delay(120);
  setRgb(false, true, false);
  delay(120);
  setRgb(false, false, true);
  delay(120);
  setRgb(true, true, false);
  delay(120);
  setRgb(false, true, true);
  delay(120);
  setRgb(true, false, true);
  delay(120);
  showGreen();
}

static bool readSwitch() {
  return digitalRead(SWITCH_PIN) == SWITCH_ACTIVE_STATE;
}

static bool connectToWifi(const char* ssid, const char* password, unsigned long timeoutMs = 15000UL) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startMs < timeoutMs) {
    delay(500);
  }
  if (WiFi.status() == WL_CONNECTED) return true;
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
      "<title>toggle setup</title>"
      "</head><body style='font-family:sans-serif;max-width:420px;margin:2rem auto;'>"
      "<h3>Toggle setup</h3>"
      "<p><b>Device ID:</b> " + deviceId + "</p>"
      "<p><b>Group ID:</b> " + groupId + "</p>"
      "<form action='/save' method='POST'>"
      "<label>SSID<br><input name='ssid' type='text'></label><br><br>"
      "<label>Password<br><input name='password' type='password'></label><br><br>"
      "<button type='submit'>Connect</button>"
      "</form>"
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
    portalServer.send(200, "text/html", "<html><body>Trying to connect...</body></html>");
  });

  portalServer.onNotFound([]() {
    portalServer.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
    portalServer.send(302, "text/plain", "");
  });

  portalServer.begin();
}

static void connectWifiWithPortal() {
  wifiPrefs.begin("wifi", false);
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
    }
    delay(10);
  }

  wifiPrefs.end();
}

static String extractJsonField(const String& json, const char* key) {
  String pat = String("\"") + key + "\":\"";
  int i = json.indexOf(pat);
  if (i < 0) return "";
  i += pat.length();
  int j = json.indexOf('"', i);
  if (j < 0) return "";
  return json.substring(i, j);
}

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
  if (!http.begin(client, String("https://") + serverHost + "/api/ota/toggle")) {
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

  String otaVersion = extractJsonField(body, "otaVersion");
  String firmwareUrl = resolveOtaUrl(extractJsonField(body, "firmwareUrl"));
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

static void applyPayloadColor(const String& payload) {
  int phaseStart = payload.indexOf("\"phase\":\"");
  if (phaseStart < 0) return;
  phaseStart += 9;
  int phaseEnd = payload.indexOf('"', phaseStart);
  if (phaseEnd < 0) return;
  String phase = payload.substring(phaseStart, phaseEnd);

  if (phase == "aligned") {
    Serial.printf("%s: aligned\n", deviceId);
    showGreen();
    return;
  }

  const String activeLookup = String("\"activeDeviceId\":\"") + deviceId + "\"";
  if (payload.indexOf(activeLookup) >= 0) {
    Serial.printf("%s: active\n", deviceId);

    showBlue();
  } else {
    Serial.printf("%s: challenger\n", deviceId);

    showRed();
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
      wsReady = true;
      String msg = String("{\"type\":\"register\",\"id\":\"") + deviceId + "\",\"token\":\"" + wsToken + "\"}";
      wsClient.sendTXT(msg);
      break;
    }
    case WStype_DISCONNECTED:
      wsReady = false;
      break;
    case WStype_TEXT: {
      String message;
      if (payload && length > 0) {
        message.reserve(length + 1);
        for (size_t i = 0; i < length; ++i) message += (char)payload[i];
      }
      Serial.printf("received TEXT message %s\n", message);
      lastWsMessageMs = millis();
      applyPayloadColor(message);
      break;
    }
    default:
      break;
  }
}

static bool postToggleState(bool isOn) {
  Serial.printf("Posting toggle state... %d\n", isOn);
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String("https://") + serverHost + "/api/toggle/device/" + deviceId;
  if (!http.begin(client, url)) return false;
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("ngrok-skip-browser-warning", "true");
  String body = String("{\"state\":\"") + (isOn ? "on" : "off") + "\",\"groupId\":\"" + groupId + "\"}";
  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

static void pollGroupState() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String("https://") + serverHost + "/api/toggle/group/" + groupId;
  if (!http.begin(client, url)) return;
  http.addHeader("ngrok-skip-browser-warning", "true");
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    applyPayloadColor(body);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(SWITCH_PIN, INPUT_PULLUP);
  pinMode(LED_R_PIN, OUTPUT);
  pinMode(LED_G_PIN, OUTPUT);
  pinMode(LED_B_PIN, OUTPUT);
  setRgb(false, false, false);

  loadIdsFromPrefs();
  connectWifiWithPortal();
  checkForOtaUpdate();
  flashRainbowConnected();

  switchState = readSwitch();
  lastSwitchReading = switchState;

  wsClient.beginSSL(serverHost, 443, "/api/ws");
  wsClient.onEvent(wsEvent);
  wsClient.setReconnectInterval(2000);
}

void loop() {
  wsClient.loop();

  const unsigned long now = millis();
  bool reading = readSwitch();
  if (reading != lastSwitchReading) {
    lastSwitchDebounceMs = now;
  }

  if (now - lastSwitchDebounceMs > 35 && reading != switchState) {
    switchState = reading;
    postToggleState(switchState);
  }
  lastSwitchReading = reading;

  // Poll fallback when websocket is disconnected or stale.
  if (lastPollMs == 0 || now - lastPollMs >= 3000UL) {
    lastPollMs = now;
    if (!wsReady || (lastWsMessageMs > 0 && now - lastWsMessageMs > 10000UL)) {
      pollGroupState();
    }
  }

  if (lastOtaCheckMs == 0 || now - lastOtaCheckMs >= OTA_CHECK_INTERVAL_MS) {
    lastOtaCheckMs = now;
    checkForOtaUpdate();
  }

  delay(5);
}
