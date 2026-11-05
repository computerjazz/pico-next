#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <WebSocketsClient.h>
#include "esp_timer.h"
#include "env.h"

// env.h must define: SERVER_HOST, WS_TOKEN, DEVICE_ID
// Optional overrides in env.h:
//   PULSE_PIN           GPIO the bike sensor tip is wired to (sleeve to GND)
//   PULSE_EDGE          FALLING (reed switch to GND with pull-up) or RISING
//   PULSE_DEBOUNCE_US   ignore pulses closer together than this

#ifndef PULSE_PIN
#define PULSE_PIN 4
#endif
#ifndef PULSE_EDGE
#define PULSE_EDGE FALLING
#endif
#ifndef PULSE_DEBOUNCE_US
#define PULSE_DEBOUNCE_US 50000
#endif

const char* serverHost = SERVER_HOST;
const char* wsToken = WS_TOKEN;
const char* portalSsid = "bike-setup";

static DNSServer dnsServer;
static WebServer portalServer(80);
static Preferences wifiPrefs;
static Preferences devicePrefs;
static WebSocketsClient wsClient;

static bool portalWantsConnect = false;
static String portalNewSsid;
static String portalNewPassword;

static volatile bool wsReady = false;
static String deviceId = "";

// Pulse timestamps (microseconds since boot) pushed by the ISR, drained by wsTask
static QueueHandle_t pulseQueue = nullptr;
static volatile int64_t lastPulseUs = 0;
static volatile uint32_t pulseCount = 0;

static unsigned long lastWifiCheck = 0;
static const unsigned long WIFI_CHECK_INTERVAL = 30000; // 30s
static int wifiFailCount = 0;

TaskHandle_t pulseTaskHandle = nullptr;

// ---------------------------------------------------------------------------
// Pulse handling
// ---------------------------------------------------------------------------

// Runs in interrupt context: timestamp, debounce, enqueue. Nothing else.
struct PulseEvent {
  int64_t timestamp;   // µs since boot (monotonic, good for RPM math)
  int64_t epochMs;     // ms since Unix epoch (like Date.now())
  int level;
};

static void syncTime() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC; epoch ms doesn't need a timezone
  unsigned long start = millis();
  while (time(nullptr) < 1700000000 && millis() - start < 10000) {
    delay(200);
  }
  Serial.printf("time synced: %s\n", time(nullptr) >= 1700000000 ? "yes" : "NO");
}

static inline int64_t epochMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return (int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

void IRAM_ATTR onPulse() {
  BaseType_t higherPriorityTaskWoken = pdFALSE;

  vTaskNotifyGiveFromISR(
    pulseTaskHandle,
    &higherPriorityTaskWoken
  );

  if (higherPriorityTaskWoken) {
    portYIELD_FROM_ISR();
  }
}

void pulseTask(void *parameter) {
  for (;;) {
    // Sleep until the ISR notifies us.
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);

    // Wait for a possible glitch to disappear.
    vTaskDelay(pdMS_TO_TICKS(5));

    // Accept only if the pin is still LOW.
    if (digitalRead(PULSE_PIN) == LOW) {
      Serial.println("Valid LOW pulse");
        pulseCount++;

        PulseEvent event;
        event.timestamp = esp_timer_get_time();
        event.epochMs   = epochMs();
        event.level     = LOW;

        xQueueSend(pulseQueue, &event, 0);
    }
  }
}

// Pulses queued while the websocket is down are discarded (live display only).
static void drainPulses() {
  PulseEvent event;

  while (xQueueReceive(pulseQueue, &event, 0) == pdTRUE) {
    Serial.printf("Interrupt: level=%d, t=%lld us\n",
                  event.level, (long long)event.timestamp);

    if (!wsReady) continue;

    char buf[384];
    int n = snprintf(buf, sizeof(buf),
      "{\"groupId\":\"bike-status\",\"type\":\"bike-status\",\"deviceId\":\"%s\",\"t\":%lld,\"token\":\"%s\"}",
      deviceId.c_str(),
      (long long)event.epochMs,
      wsToken);

    if (n < 0 || n >= (int)sizeof(buf)) continue;

    Serial.println(buf);
    wsClient.sendTXT(buf);
  }
}
// The websocket is only ever touched from this task once it is running.
static void wsTask(void*) {
  while (true) {
    wsClient.loop();
    drainPulses();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

static void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      Serial.println("ws: connected");
      wsReady = true;
      String msg = String("{\"type\":\"register\",\"groupId\":\"bike-status\",\"id\":\"") + deviceId + "\",\"token\":\"" + wsToken + "\"}";
      Serial.println(msg);
      wsClient.sendTXT(msg);
      break;
    }
    case WStype_DISCONNECTED:
      Serial.println("ws: disconnected");
      wsReady = false;
      lastWifiCheck = 0; // nudge the wifi check
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// WiFi
// ---------------------------------------------------------------------------

static void checkWifi() {
  if (millis() - lastWifiCheck < WIFI_CHECK_INTERVAL) return;
  lastWifiCheck = millis();

  if (WiFi.status() == WL_CONNECTED) {
    wifiFailCount = 0;
    return;
  }

  wifiFailCount++;
  Serial.printf("WiFi down (fail #%d)\n", wifiFailCount);

  if (wifiFailCount >= 3) {
    Serial.println("WiFi stack wedged, rebooting...");
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
  deviceId = devicePrefs.getString("id", "");
  if (deviceId.length() == 0) {
    deviceId = String(DEVICE_ID);
    if (deviceId.length() > 0) {
      devicePrefs.putString("id", deviceId);
    }
  }
  devicePrefs.end();
  Serial.printf("device id: %s\n", deviceId.c_str());
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
        Serial.println("WiFi lost, reconnecting...");
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
  Serial.printf("no wifi: portal up, join '%s' and open %s\n", portalSsid, WiFi.softAPIP().toString().c_str());
  const IPAddress apIp = WiFi.softAPIP();
  dnsServer.start(53, "*", apIp);

  portalServer.on("/", HTTP_GET, []() {
    String page =
      "<!DOCTYPE html><html><head>"
      "<meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>bike setup</title>"
      "<style>"
        "body{font-family:sans-serif;max-width:440px;margin:2.5rem auto;padding:2rem 1.4rem 1rem;background:#f4f6fa;color:#222;box-shadow:0 4px 16px #0001;border-radius:18px;}"
        "h2{margin-top:0;font-size:2rem;font-weight:700;letter-spacing:-1px;}"
        "form{margin:2.2rem 0 .5rem 0;}"
        "label{display:block;margin-bottom:.85rem;font-weight:600;font-size:1rem;}"
        "input[type='text'],input[type='password']{width:100%;padding:.65rem .8rem;border:1.5px solid #ccd2e3;border-radius:10px;font-size:1.05rem;box-sizing:border-box;margin-top:.2em;margin-bottom:.4em;}"
        "button{padding:.8rem 1.7rem;border:none;border-radius:10px;background:#3367d6;color:white;font-weight:600;font-size:1.05rem;letter-spacing:.03em;box-shadow:0 2px 6px #0002;cursor:pointer;margin-top:.8rem;transition:.1s background;}"
        "button:hover{background:#254b9c;}"
        ".device-id{margin-top:2.3rem;padding:1rem .9rem;background:#eef0f5;border-radius:10px;color:#444;font-size:.97rem;word-break:break-all;}"
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
      "<h2>Connect bike sensor</h2>"
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

// ---------------------------------------------------------------------------
// Arduino entry points
// ---------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  // Native-USB boards (S3/C3) drop prints until the monitor attaches, so wait briefly
  unsigned long serialWaitStart = millis();
  while (!Serial && millis() - serialWaitStart < 3000) delay(10);
  Serial.println("\nbike boot");
  pulseQueue = xQueueCreate(64, sizeof(PulseEvent));  
  pinMode(PULSE_PIN, INPUT_PULLUP);

  loadIdsFromPrefs();
  connectWifiWithPortal();
  syncTime();
  Serial.printf("wifi connected, ip %s\n", WiFi.localIP().toString().c_str());

  wsClient.onEvent(wsEvent);
  wsClient.setReconnectInterval(2000);
  wsClient.enableHeartbeat(15000, 5000, 3); // ping every 15s, 5s timeout, 3 retries
  wsClient.beginSSL(serverHost, 443, "/api/ws");
  xTaskCreatePinnedToCore(wsTask, "ws", 8192, nullptr, 1, nullptr, 0);


Serial.printf("Configured pulse edge: FALLING, pin: %d\n", PULSE_PIN);


xTaskCreate(
  pulseTask,
  "pulseTask",
  2048,
  nullptr,
  2,
  &pulseTaskHandle
);

  // Start listening for pulses only once everything else is up
  attachInterrupt(digitalPinToInterrupt(PULSE_PIN), onPulse, PULSE_EDGE);
  Serial.println("bike sensor ready");
}

void loop() {
  checkWifi();

  static unsigned long lastStatusMs = 0;
  if (millis() - lastStatusMs >= 5000) {
    lastStatusMs = millis();
    Serial.printf("status: wifi=%d ws=%d pulses=%u\n",
      WiFi.status() == WL_CONNECTED, (int)wsReady, (unsigned)pulseCount);
  }

  delay(100);
}
