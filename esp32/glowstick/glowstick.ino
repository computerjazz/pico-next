#include <RCSwitch.h>

RCSwitch rc = RCSwitch();

#define PIN_UP    5
#define PIN_DOWN  3
#define PIN_LEFT  2
#define PIN_RIGHT 4
#define TX_PIN    10

#define UP_CODE    "FFFFFFFFFFFF"
#define DOWN_CODE  "0FFFFFFFFFFF"
#define LEFT_CODE  "F0FFFFFFFFFF"
#define RIGHT_CODE "FF0FFFFFFFFF"
#define UP_LEFT_CODE "FFF0FFFFFFFF"
#define UP_RIGHT_CODE "00FFFFFFFFFF"
#define DOWN_LEFT_CODE "F00FFFFFFFFF"
#define DOWN_RIGHT_CODE "FF00FFFFFFFF"

// Returns the TriState code for the given button pin combo.
// Only returns one of the defined codes, or nullptr if no match.
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




void setup() {
  rc.enableTransmit(TX_PIN);
  
  // Set to 1 repeat for inside the custom hold handler
  rc.setRepeatTransmit(1); 
  
  // Standard pulse window for a 750k resistor on 5V logic
  rc.setPulseLength(275); 
  
  Serial.begin(115200); 
  Serial.println("Ready. Instant-on continuous mode.");

  pinMode(PIN_UP, INPUT_PULLUP);
  pinMode(PIN_DOWN, INPUT_PULLUP);
  pinMode(PIN_LEFT, INPUT_PULLUP);
  pinMode(PIN_RIGHT, INPUT_PULLUP);
}

void loop() {

  const char* code = getTriStateCodeForPins();
  if (code != nullptr) {
    rc.sendTriState(code);
    delayMicroseconds(500);
  }
}
