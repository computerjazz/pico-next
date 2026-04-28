#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include "env.h"

const char* serverHost = SERVER_HOST;
const char* authToken = AUTH_TOKEN;
const char* wsToken = WS_TOKEN;
const char* groupId = GROUP_ID;
const char* portalSsid = "toggle-setup";

static DNSServer dnsServer;
static WebServer portalServer(80);
static Preferences wifiPrefs;
static WebSocketsClient wsClient;

static bool portalWantsConnect = false;
static String portalNewSsid;
static String portalNewPassword;

static unsigned long lastPollMs = 0;
static unsigned long lastWsMessageMs = 0;
static unsigned long lastSwitchDebounceMs = 0;
static bool lastSwitchReading = false;
static bool switchState = false;
static bool wsReady = false;

static void setRgb(bool red, bool green, bool blue) {
  digitalWrite(LED_R_PIN, red ? HIGH : LOW);
  digitalWrite(LED_G_PIN, green ? HIGH : LOW);
  digitalWrite(LED_B_PIN, blue ? HIGH : LOW);
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
      "<p><b>Device ID:</b> " + String(DEVICE_ID) + "</p>"
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

static void applyPayloadColor(const String& payload) {
  int phaseStart = payload.indexOf("\"phase\":\"");
  if (phaseStart < 0) return;
  phaseStart += 9;
  int phaseEnd = payload.indexOf('"', phaseStart);
  if (phaseEnd < 0) return;
  String phase = payload.substring(phaseStart, phaseEnd);

  if (phase == "aligned") {
    showGreen();
    return;
  }

  const String activeLookup = String("\"activeDeviceId\":\"") + DEVICE_ID + "\"";
  if (payload.indexOf(activeLookup) >= 0) {
    showBlue();
  } else {
    showRed();
  }
}

static void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      wsReady = true;
      String msg = String("{\"type\":\"register\",\"id\":\"") + DEVICE_ID + "\",\"token\":\"" + wsToken + "\"}";
      wsClient.sendTXT(msg);
      break;
    }
    case WStype_DISCONNECTED:
      wsReady = false;
      break;
    case WStype_TEXT: {
      String message = String((char*)payload).substring(0, length);
      lastWsMessageMs = millis();
      applyPayloadColor(message);
      break;
    }
    default:
      break;
  }
}

static bool postToggleState(bool isOn) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  String url = String("https://") + serverHost + "/api/toggle/device/" + DEVICE_ID;
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

  connectWifiWithPortal();
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

  delay(5);
}
