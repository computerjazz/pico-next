#include <RCSwitch.h>
#include "esp_sleep.h"
#include "driver/rtc_io.h"

RCSwitch rc = RCSwitch();

#define PIN_UP    1
#define PIN_DOWN  2
#define PIN_LEFT  5
#define PIN_RIGHT 4
#define TX_PIN    6

#define UP_CODE    "FFFFFFFFFFFF"
#define DOWN_CODE  "0FFFFFFFFFFF"
#define LEFT_CODE  "F0FFFFFFFFFF"
#define RIGHT_CODE "FF0FFFFFFFFF"
#define UP_LEFT_CODE "FFF0FFFFFFFF"
#define UP_RIGHT_CODE "00FFFFFFFFFF"
#define DOWN_LEFT_CODE "F00FFFFFFFFF"
#define DOWN_RIGHT_CODE "FF00FFFFFFFF"

#define IDLE_TIMEOUT_MS 30000UL 

uint32_t lastActivityMs = 0;

const char* getTriStateCodeForPins() {
  bool isUp = digitalRead(PIN_UP) == LOW;
  bool isDown = digitalRead(PIN_DOWN) == LOW;
  bool isLeft = digitalRead(PIN_LEFT) == LOW;
  bool isRight = digitalRead(PIN_RIGHT) == LOW;

  if (isUp && isLeft && !isDown && !isRight)        return UP_LEFT_CODE;
  if (isUp && isRight && !isDown && !isLeft)        return UP_RIGHT_CODE;
  if (isDown && isLeft && !isUp && !isRight)        return DOWN_LEFT_CODE;
  if (isDown && isRight && !isUp && !isLeft)        return DOWN_RIGHT_CODE;
  if (isUp && !isDown && !isLeft && !isRight)       return UP_CODE;
  if (isDown && !isUp && !isLeft && !isRight)       return DOWN_CODE;
  if (isLeft && !isUp && !isDown && !isRight)       return LEFT_CODE;
  if (isRight && !isUp && !isDown && !isLeft)       return RIGHT_CODE;

  return nullptr;
}

void configureWakeupPins() {
  // RTC pull-ups have to be set explicitly — pinMode()'s pullup does not
  // survive deep sleep since the pin is handed off to the RTC domain.
  const gpio_num_t pins[] = {
    (gpio_num_t)PIN_UP, (gpio_num_t)PIN_DOWN,
    (gpio_num_t)PIN_LEFT, (gpio_num_t)PIN_RIGHT
  };
  for (auto p : pins) {
    rtc_gpio_init(p);
    rtc_gpio_set_direction(p, RTC_GPIO_MODE_INPUT_ONLY);
    rtc_gpio_pullup_en(p);
    rtc_gpio_pulldown_dis(p);
  }
}

void goToDeepSleep() {
  Serial.println("Idle — entering deep sleep");
  Serial.flush();

  configureWakeupPins();

  uint64_t wakeMask = (1ULL << PIN_UP) | (1ULL << PIN_DOWN) |
                       (1ULL << PIN_LEFT) | (1ULL << PIN_RIGHT);

  esp_sleep_enable_ext1_wakeup_io(wakeMask, ESP_EXT1_WAKEUP_ANY_LOW);

  esp_deep_sleep_start();
  // execution never returns from here — reset on wake, back to setup()
}

void setup() {
  Serial.begin(115200);

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  if (cause == ESP_SLEEP_WAKEUP_EXT1) {
    Serial.println("Woke from deep sleep via joystick");
  } else {
    Serial.println("Cold boot");
  }

  rc.enableTransmit(TX_PIN);
  rc.setRepeatTransmit(1);
  rc.setPulseLength(290);

  pinMode(PIN_UP, INPUT_PULLUP);
  pinMode(PIN_DOWN, INPUT_PULLUP);
  pinMode(PIN_LEFT, INPUT_PULLUP);
  pinMode(PIN_RIGHT, INPUT_PULLUP);

  lastActivityMs = millis();
}

void loop() {
  const char* code = getTriStateCodeForPins();
  if (code != nullptr) {
    // Serial.println(code);
    rc.sendTriState(code);
    delayMicroseconds(500);
    lastActivityMs = millis();
  }

  if (millis() - lastActivityMs > IDLE_TIMEOUT_MS) {
    goToDeepSleep();
  }
}