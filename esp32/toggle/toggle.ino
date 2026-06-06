#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include <Update.h>
#include "env.h"
#include <ArduinoJson.h>
#include <stdarg.h>

#ifndef FORCE_ID_RESET
#define FORCE_ID_RESET false
#endif

const char* serverHost = SERVER_HOST;
const char* authToken = AUTH_TOKEN;
const char* wsToken = WS_TOKEN;
const char* portalSsid = "toggle-setup";
const char* firmwareVersion = "toggle-2026-06-06.2";

#define OTA_CHECK_INTERVAL_MS 60000UL
#define LOG_FLUSH_INTERVAL_MS 30000UL

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
static unsigned long lastWsResumeMs = 0;
static unsigned long lastOtaCheckMs = 0;
static unsigned long lastFlushMs = 0;
static unsigned long lastSwitchDebounceMs = 0;
static bool lastSwitchReading = false;
static bool switchState = false;
static bool wsReady = false;
static bool g_wsRunning = false;
static bool pendingSwitchPost = false;
static String deviceId = "";

unsigned long lastWifiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000; // 30s
int wifiFailCount = 0;

String pendingLogs = "";

void appendLog(const char* fmt, ...) {
  char buf[128];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);
  Serial.println(buf);
  pendingLogs += String(millis()) + " " + buf + "\n";
  if (pendingLogs.length() > 4096) {
    pendingLogs = pendingLogs.substring(pendingLogs.length() - 4096);
  }
}

void flushLogs() {
  if (pendingLogs.length() == 0 || deviceId.length() == 0) return;
  if (WiFi.status() != WL_CONNECTED) return;

  String logsToSend = pendingLogs;
  pendingLogs = "";

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String("https://") + serverHost + "/api/device/" + deviceId + "/logs";
  if (!http.begin(client, url)) {
    pendingLogs = logsToSend + pendingLogs;
    return;
  }
  http.setTimeout(8000);
  http.setConnectTimeout(5000);
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("Content-Type", "text/plain");
  http.addHeader("ngrok-skip-browser-warning", "true");

  int code = http.POST(logsToSend);
  http.end();

  if (code < 200 || code >= 300) {
    pendingLogs = logsToSend + pendingLogs;
  }
}


void checkWifi() {
  if (millis() - lastWifiCheck < WIFI_CHECK_INTERVAL) return;
  lastWifiCheck = millis();

  if (WiFi.status() == WL_CONNECTED) {
    wifiFailCount = 0;
    return;
  }

  wifiFailCount++;
  appendLog("WiFi down (fail #%d)", wifiFailCount);

  if (wifiFailCount >= 3) {
    appendLog("WiFi stack wedged, rebooting...");
    delay(100);
    ESP.restart();
  }

  // Full tear-down + reconnect (WiFi.reconnect() alone is unreliable)
  wifiPrefs.begin("wifi", true);
  String ssid = wifiPrefs.getString("ssid", "");
  String pass = wifiPrefs.getString("password", "");
  wifiPrefs.end();

  WiFi.disconnect(true);
  delay(500);
  WiFi.begin(ssid.c_str(), pass.c_str());
}

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
  devicePrefs.end();
  appendLog("device id: %s", deviceId.c_str());
}

// For common anode: LED is ON when pin is LOW, OFF when pin is HIGH.
// For common cathode: LED is ON when pin is HIGH, OFF when pin is LOW.
// We want `setRgb(true, false, false)` to always mean "red on" regardless of LED type.

static void setRgb(int red, int green, int blue) {
  writeRgbPin(LED_R_PIN, red);
  writeRgbPin(LED_G_PIN, green);
  writeRgbPin(LED_B_PIN, blue);
}

static void writeRgbPin(uint8_t pin, int val) {
  static float brightness = 0.1f;
  int scaledVal = floor(val * brightness);
  // For common anode, driving pin LOW turns on the LED (active LOW).
  // For common cathode, driving pin HIGH turns on the LED (active HIGH).
  // So invert for common anode.
  int _val = IS_RGB_LED_COMMON_ANODE ? 255 - scaledVal : scaledVal;
  analogWrite(pin, _val);
}

// Crossfades from the current RGB color to the target RGB color
static void crossfadeTo(int targetR, int targetG, int targetB, int durationMs = 240, int steps = 12) {
  int currR = 0, currG = 0, currB = 0;
  
  // Read current levels via analogWrite cache or shadow (since ESP32 analogWrite is write-only)
  // We'll maintain a shadow copy for this session, or you can use global variables to store last set values.
  // For simplicity, let's use static vars here:
  static int lastR = 0, lastG = 0, lastB = 0;
  currR = lastR;
  currG = lastG;
  currB = lastB;

  for (int i = 1; i <= steps; ++i) {
    int r = currR + ((targetR - currR) * i) / steps;
    int g = currG + ((targetG - currG) * i) / steps;
    int b = currB + ((targetB - currB) * i) / steps;
    setRgb(r, g, b);
    delay(durationMs / steps);
  }
  // Store the new color
  lastR = targetR;
  lastG = targetG;
  lastB = targetB;
}

static void showGreen() { crossfadeTo(0, 255, 0); }
static void showBlue()  { crossfadeTo(0, 0, 255); }
static void showRed()   { crossfadeTo(255, 0, 0); }

static void flashRainbowConnected() {
  // Sweep smoothly through the color spectrum using HSV->RGB conversion
  const int steps = 36; // Number of steps in the sweep (10° per step over 360°)
  const int sat = 255;  // Full saturation
  const int val = 140;  // Reduced value for visual comfort

  for (int i = 0; i <= steps; ++i) {
    float hue = (float(i) / steps) * 360.0f;
    float h = hue / 60.0f;
    int hi = int(h) % 6;
    float f = h - hi;
    int v = val;
    int p = int(v * (1.0f - float(sat) / 255.0f));
    int q = int(v * (1.0f - f * float(sat) / 255.0f));
    int t = int(v * (1.0f - (1.0f - f) * float(sat) / 255.0f));
    int r, g, b;
    switch (hi) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
      default: r = g = b = 0; break;
    }
    setRgb(r, g, b);
    delay(33); // Small delay for smoothness, total sweep ~1.2s
  }
}

static bool readSwitch() {
  return digitalRead(SWITCH_PIN) == SWITCH_ACTIVE_STATE;
}

static bool connectToWifi(const char* ssid, const char* password, unsigned long timeoutMs = 15000UL) {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);

  WiFi.begin(ssid, password);
  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startMs < timeoutMs) {
    delay(500);
  }
  if (WiFi.status() == WL_CONNECTED) {
    WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
       if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
          appendLog("WiFi lost, reconnecting...");
          WiFi.reconnect();
        }
}, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
    return true;
  }
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
      "<style>"
        "body{font-family:sans-serif;max-width:440px;margin:2.5rem auto;padding:2rem 1.4rem 1rem;background:#f4f6fa;color:#222;box-shadow:0 4px 16px #0001;border-radius:18px;}"
        "h2{margin-top:0;font-size:2rem;font-weight:700;letter-spacing:-1px;}"
        "form{margin:2.2rem 0 .5rem 0;}"
        "label{display:block;margin-bottom:.85rem;font-weight:600;font-size:1rem;}"
        "input[type='text'],input[type='password']{width:100%;padding:.65rem .8rem;border:1.5px solid #ccd2e3;border-radius:10px;font-size:1.05rem;box-sizing:border-box;margin-top:.2em;margin-bottom:.4em;}"
        "button{padding:.8rem 1.7rem;border:none;border-radius:10px;background:#3367d6;color:white;font-weight:600;font-size:1.05rem;letter-spacing:.03em;box-shadow:0 2px 6px #0002;cursor:pointer;margin-top:.8rem;transition:.1s background;}"
        "button:hover{background:#254b9c;}"
        ".device-id,.group-id{margin-top:2.3rem;padding:1rem .9rem;background:#eef0f5;border-radius:10px;color:#444;font-size:.97rem;word-break:break-all;}"
        ".group-id{margin-top:.9rem;}"
        ".pw-wrapper{position:relative;display:flex;align-items:center;}"
        ".pw-wrapper input{flex:1;}"
        ".pw-toggle{margin-left:.5em;padding:.34em .7em;font-size:.93em;background:#ccd2e3;border:none;border-radius:7px;color:#333;cursor:pointer;transition:.13s background;}"
        ".pw-toggle:hover{background:#aac1e4;}"
      "</style>"
      "<script>"
      "function togglePw(){"
        "var pw=document.getElementById('pw');"
        "var btn=document.getElementById('pwbtn');"
        "if(pw.type==='password'){pw.type='text';btn.textContent='Hide';}"
        "else{pw.type='password';btn.textContent='Show';}"
      "}"
      "function trimInputs(e){"
        "var ssid=document.getElementById('ssid');"
        "var pw=document.getElementById('pw');"
        "if(ssid) ssid.value=ssid.value.trim();"
        "if(pw) pw.value=pw.value.trim();"
      "}"
      "</script>"
      "</head>"
      "<body>"
      "<h2>Connect toggle</h2>"
      "<div class='device-id'><b>Device ID:</b><br>" + deviceId + "</div>"
      "<form action='/save' method='POST' onsubmit='trimInputs(event)'>"
      "<label>SSID<br><input id='ssid' name='ssid' type='text' autocomplete='username wifi-ssid'></label>"
      "<label>Password<br>"
        "<div class='pw-wrapper'>"
          "<input id='pw' name='password' type='password' autocomplete='current-password wifi-password'>"
          "<button type='button' id='pwbtn' class='pw-toggle' onclick='togglePw()'>Show</button>"
        "</div>"
      "</label>"
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
    appendLog("ota: http begin failed for %s", url.c_str());
    return false;
  }
  http.setTimeout(8000);          // 8s total
  http.setConnectTimeout(5000);   // 5s to connect
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("x-device-id", deviceId);
  http.addHeader("x-firmware-version", String(firmwareVersion));
  http.addHeader("ngrok-skip-browser-warning", "true");

  int code = http.GET();
  if (code != 200) {
    appendLog("ota: download HTTP %d", code);
    http.end();
    return false;
  }

  int contentLength = http.getSize();
  if (contentLength <= 0) {
    appendLog("ota: invalid content length %d", contentLength);
    http.end();
    return false;
  }

  if (!Update.begin((size_t)contentLength)) {
    appendLog("ota: Update.begin failed (err=%u)", Update.getError());
    http.end();
    return false;
  }

  WiFiClient* stream = http.getStreamPtr();
  size_t written = Update.writeStream(*stream);
  if (written != (size_t)contentLength) {
    appendLog("ota: wrote %u of %d bytes", (unsigned)written, contentLength);
  }

  if (!Update.end()) {
    appendLog("ota: Update.end failed (err=%u)", Update.getError());
    http.end();
    return false;
  }

  if (!Update.isFinished()) {
    appendLog("ota: update did not finish");
    http.end();
    return false;
  }

  http.end();
  appendLog("ota: update installed, restarting");
  delay(200);
  ESP.restart();
  return true;
}

static bool checkForOtaUpdate() {
  String otaVersion;
  String firmwareUrl;

  // Scope the first TLS connection so it fully destructs before the download.
  {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    if (!http.begin(client, String("https://") + serverHost + "/api/device/" + deviceId + "/ota")) {
      appendLog("ota: metadata begin failed");
      return false;
    }
    http.setTimeout(8000);          // 8s total
    http.setConnectTimeout(5000);   // 5s to connect
    http.addHeader("Authorization", String("Bearer ") + authToken);
    http.addHeader("x-device-id", deviceId);
    http.addHeader("x-firmware-version", String(firmwareVersion));
    http.addHeader("ngrok-skip-browser-warning", "true");

    int code = http.GET();
    String body = http.getString();
    http.end();

    if (code != 200) {
      appendLog("ota: metadata HTTP %d", code);
      return false;
    }

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, body);

    if (error) {
      appendLog("Parse failed: %s", error.c_str());
      return false;
    }

    otaVersion  = doc["otaVersion"].as<String>();
    firmwareUrl = resolveOtaUrl(doc["firmwareUrl"].as<String>());
    
  }
  if (otaVersion.length() == 0) {
    appendLog("ota: metadata missing otaVersion");
    return false;
  }

  if (otaVersion == firmwareVersion) {
    appendLog("ota: up to date (%s)", firmwareVersion);
    return true;
  }

  if (firmwareUrl.length() == 0) {
    appendLog("ota: update %s available but no firmwareUrl", otaVersion.c_str());
    return false;
  }

  appendLog("ota: updating %s -> %s", firmwareVersion, otaVersion.c_str());
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
    appendLog("%s: aligned", deviceId.c_str());
    showGreen();
    return;
  }

  const String activeLookup = String("\"activeDeviceId\":\"") + deviceId + "\"";
  if (payload.indexOf(activeLookup) >= 0) {
    appendLog("%s: active", deviceId.c_str());

    showBlue();
  } else {
    appendLog("%s: challenger", deviceId.c_str());

    showRed();
  }
}

static void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  // Print wsEvent safely with explicit length (guard for null/non-string payload)
  appendLog("wsEvent: type %d, ready: %d", type, wsReady);
  if (payload && length > 0) {
    String payloadStr;
    payloadStr.reserve(length + 1);
    for (size_t i = 0; i < length; ++i) payloadStr += (char)payload[i];
    appendLog("wsEvent %s %d", payloadStr.c_str(), (int)length);
  } else {
    appendLog("wsEvent <null> %d", (int)length);
  }

  switch (type) {
    case WStype_CONNECTED: {
      appendLog("CONNECTED");
      wsReady = true;
      String msg = String("{\"type\":\"register\",\"id\":\"") + deviceId + "\",\"token\":\"" + wsToken + "\"}";
      wsClient.sendTXT(msg);
      break;
    }
    case WStype_DISCONNECTED:
      appendLog("DISCONNECTED");
      wsReady = false;
      // If WS drops, nudge the wifi check immediately
      lastWifiCheck = 0;
      break;
    case WStype_TEXT: {
      String message;
      if (payload && length > 0) {
        message.reserve(length + 1);
        for (size_t i = 0; i < length; ++i) message += (char)payload[i];
      }
      appendLog("received TEXT message %s", message.c_str());
      lastWsMessageMs = millis();
      applyPayloadColor(message);
      break;
    }
    default:
      break;
  }
}

// Hold only one TLS context at a time. The ESP32 heap can support a single
// long-lived SSL connection (the WS) plus brief HTTP polls, but two concurrent
// SSL contexts fragment the heap and cause subsequent handshakes to fail.
static void wsResume() {
  if (g_wsRunning) return;
  appendLog("wsResume()");
  wsClient.beginSSL(serverHost, 443, "/api/ws");
  g_wsRunning = true;
  lastWsResumeMs = millis();
}

static void wsPause() {
  if (!g_wsRunning) return;
  appendLog("wsPause()");
  wsClient.disconnect();
  g_wsRunning = false;
  wsReady = false;
  // Yield so lwIP can finalize socket close + free the mbedTLS context before
  // any subsequent SSL connect attempt.
  vTaskDelay(pdMS_TO_TICKS(50));
}

static bool postToggleState(bool isOn) {
  appendLog("Posting toggle state... %d", isOn);
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String("https://") + serverHost + "/api/device/" + deviceId;
  if (!http.begin(client, url)) return false;
  http.setTimeout(8000);          // 8s total
  http.setConnectTimeout(5000);   // 5s to connect
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("ngrok-skip-browser-warning", "true");
  String body = String("{\"state\":\"") + (isOn ? "on" : "off") + "\"}";
  int code = http.POST(body);
  http.end();
  return code >= 200 && code < 300;
}

static void pollGroupState() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String("https://") + serverHost + "/api/toggle/group";
  if (!http.begin(client, url)) return;
  http.setTimeout(8000);       
  http.setConnectTimeout(5000);
  http.addHeader("ngrok-skip-browser-warning", "true");
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("x-device-id", deviceId);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    applyPayloadColor(body);
  }
  appendLog("Polled group state at %s: %d", url.c_str(), code);
  http.end();
}

static bool phoneHome() {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, String("https://") + serverHost + "/api/device/" + deviceId + "/phone-home")) {
    appendLog("phoneHome: http begin failed");
    return false;
  }
  http.setTimeout(8000);          // 8s total
  http.setConnectTimeout(5000);   // 5s to connect
  http.addHeader("Authorization", String("Bearer ") + authToken);
  http.addHeader("x-device-id", deviceId);
  http.addHeader("x-firmware-version", String(firmwareVersion));
  http.addHeader("x-device-type", "toggle");
  http.addHeader("ngrok-skip-browser-warning", "true");

  int code = http.POST((uint8_t*)nullptr, 0);
  String body = http.getString();

  http.end();

  if (code >= 200 && code < 300) {
    appendLog("phoneHome: success (%d)", code);
    appendLog("Returned JSON body: %s", body.c_str());
    return true;
  }

  appendLog("phoneHome: HTTP %d, body: %s", code, body.c_str());
  return false;
}

void setup() {
  Serial.begin(115200);
  pinMode(SWITCH_PIN, INPUT_PULLUP);
  pinMode(LED_R_PIN, OUTPUT);
  pinMode(LED_G_PIN, OUTPUT);
  pinMode(LED_B_PIN, OUTPUT);
  setRgb(0, 0, 0);

  loadIdsFromPrefs();
  connectWifiWithPortal();
  checkForOtaUpdate();
  phoneHome();
  flashRainbowConnected();

  switchState = readSwitch();
  lastSwitchReading = switchState;

  wsClient.onEvent(wsEvent);
  wsClient.setReconnectInterval(2000);
  wsClient.enableHeartbeat(15000, 5000, 3); // ping every 15s, 5s timeout, 3 retries
  wsResume();

}

void loop() {
  checkWifi();
  const unsigned long now = millis();

  bool reading = readSwitch();
  if (reading != lastSwitchReading) {
    lastSwitchDebounceMs = now;
  }
  if (now - lastSwitchDebounceMs > 35 && reading != switchState) {
    switchState = reading;
    appendLog("Switched");
    pendingSwitchPost = true;
  }
  lastSwitchReading = reading;

  bool wsStale = g_wsRunning && (
    (lastWsMessageMs > 0 && now - lastWsMessageMs > 10000UL) ||
    (!wsReady && now - lastWsResumeMs > 8000UL)
  );
  bool pollDue = (lastPollMs == 0 || now - lastPollMs >= 3000UL) && wsStale;
  bool otaDue = lastOtaCheckMs == 0 || now - lastOtaCheckMs >= OTA_CHECK_INTERVAL_MS;
  bool logFlushDue = pendingLogs.length() > 0 &&
    (lastFlushMs == 0 ||
      now - lastFlushMs >= LOG_FLUSH_INTERVAL_MS ||
      pendingLogs.length() > 2048);
  bool httpDue = pendingSwitchPost || pollDue || otaDue || logFlushDue;

  // WS management: pause when HTTP is due, resume otherwise.
  // If we just issued wsPause(), skip this iteration so lwIP can drain the
  // close handshake before any new SSL connect attempt.
  if (httpDue) {
    if (g_wsRunning) {
      wsPause();
      delay(5);
      return;
    }
  } else {
    wsResume();
  }

  if (g_wsRunning) wsClient.loop();

  // HTTP requests — only run when WS is confirmed down (!g_wsRunning).
  if (httpDue) {
    if (pendingSwitchPost) {
      pendingSwitchPost = false;
      postToggleState(switchState);
    }
    if (pollDue) {
      lastPollMs = now;
      pollGroupState();
    }
    if (otaDue) {
      lastOtaCheckMs = now;
      checkForOtaUpdate();
    }
    if (logFlushDue) {
      lastFlushMs = now;
      flushLogs();
    }
  }

  yield(); // feeds watchdog, yields to background tasks, zero artificial delay
}
