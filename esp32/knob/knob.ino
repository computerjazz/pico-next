#include <TM1637Display.h>

// Rotary Encoder Pins
const int encoderCLK = 2; 
const int encoderDT = 1; 
const int encoderSW = 5;   // Button pin

// TM1637 4-digit Display pins
const int DISPLAY_CLK = 4; 
const int DISPLAY_DIO = 3; 

TM1637Display display(DISPLAY_CLK, DISPLAY_DIO);

// State for rotary encoder
volatile int encoderPos = 0;
int lastEncoded = 0;

// Variables for debouncing
int lastClkState;
unsigned long lastDebounceTime = 0;
unsigned long debounceDelay = 2;

// For button debouncing
int lastButtonState = HIGH;
unsigned long lastButtonDebounceTime = 0;
unsigned long buttonDebounceDelay = 20;
bool buttonWasPressed = false;

// Function to read rotary encoder
void IRAM_ATTR handleEncoder() {
  int clkState = digitalRead(encoderCLK);
  int dtState = digitalRead(encoderDT);
  if (clkState != lastClkState) {
    if (dtState != clkState) {
      encoderPos++;
    } else {
      encoderPos--;
    }
    lastClkState = clkState;
  }
}

void setup() {
  pinMode(encoderCLK, INPUT_PULLUP);
  pinMode(encoderDT, INPUT_PULLUP);
  pinMode(encoderSW, INPUT_PULLUP);  // set knob button pin

  display.setBrightness(0x0f);  // Maximum brightness
  display.showNumberDec(0, true);

  lastClkState = digitalRead(encoderCLK);
  lastButtonState = digitalRead(encoderSW);

  // Use interrupt for high precision
  attachInterrupt(digitalPinToInterrupt(encoderCLK), handleEncoder, CHANGE);
}

void loop() {
  static int lastValue = 0;

  // --- BUTTON DEBOUNCE AND RESET ---
  int reading = digitalRead(encoderSW);
  if (reading != lastButtonState) {
    lastButtonDebounceTime = millis();
    lastButtonState = reading;
  }

  if ((millis() - lastButtonDebounceTime) > buttonDebounceDelay) {
    // Button is active LOW (pressed when LOW)
    if (lastButtonState == LOW && !buttonWasPressed) {
      encoderPos = 0;
      buttonWasPressed = true;
    } else if (lastButtonState == HIGH && buttonWasPressed) {
      buttonWasPressed = false;
    }
  }

  // Clamp value to displayable range
  int value = encoderPos;
  if (value < -999) value = -999;
  if (value > 9999) value = 9999;

  if (value != lastValue) {
    // True for leading zero suppression (except for negative)
    display.showNumberDec(value, true);
    lastValue = value;
  }

  delay(10); // Small delay for stability
}