// Simple ESP32 sketch: RGB LED controlled by 4-direction joystick

// Pin assignment for RGB LED (common cathode assumed)
const int RED_PIN = 1;
const int GREEN_PIN = 2;
const int BLUE_PIN = 3;

// Joystick pins (digital directions)
const int JOY_UP = 7;
const int JOY_LEFT = 8;
const int JOY_RIGHT = 9;
const int JOY_DOWN = 44;

void setup() {
    Serial.begin(115200);

  // Set RGB pins as output
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);

  // Set joystick pins as input (with internal pull-up)
  pinMode(JOY_UP, INPUT_PULLUP);
  pinMode(JOY_DOWN, INPUT_PULLUP);
  pinMode(JOY_LEFT, INPUT_PULLUP);
  pinMode(JOY_RIGHT, INPUT_PULLUP);

  // Initialize LED off
  setColor(0,0,0);
}

// Helper to set RGB LED using PWM (analogWrite), supports color mixing with values 0-255
void setColor(float r, float g, float b) {
  // Clamp values and scale if input is normalized (0.0-1.0)
  int red = (r > 1.0) ? int(r) : int(r * 255.0);
  int green = (g > 1.0) ? int(g) : int(g * 255.0);
  int blue = (b > 1.0) ? int(b) : int(b * 255.0);

  red = constrain(red, 0, 255);
  green = constrain(green, 0, 255);
  blue = constrain(blue, 0, 255);

  analogWrite(RED_PIN,   255 - red);    // invert for common cathode
  analogWrite(GREEN_PIN, 255 - green);
  analogWrite(BLUE_PIN,  255 - blue);
}

void loop() {
  // Joystick directions are LOW when pressed (active low)
  bool up = digitalRead(JOY_UP) == LOW;
  bool down = digitalRead(JOY_DOWN) == LOW;
  bool left = digitalRead(JOY_LEFT) == LOW;
  bool right = digitalRead(JOY_RIGHT) == LOW;

  // Diagonal color logic & clockwise rainbow:
  // Map: UP -> Red, UP+RIGHT -> Orange, RIGHT -> Yellow, DOWN+RIGHT -> Green, DOWN -> Cyan, DOWN+LEFT -> Blue, LEFT -> Indigo, UP+LEFT -> Violet

  // Detect diagonals (two pressed at once)
  if (up && right) {
    Serial.print("up+right (orange)\n");
    setColor(1, 0.5, 0); // Orange
  } else if (right && down) {
    Serial.print("down+right (green)\n");
    setColor(0, 1, 0.5); // Green (slightly cyan for distinction)
  } else if (down && left) {
    Serial.print("down+left (blue)\n");
    setColor(0, 0, 1);   // Blue
  } else if (left && up) {
    Serial.print("up+left (violet)\n");
    setColor(0.5, 0, 1); // Violet
  } else if (up) {
    Serial.print("up (red)\n");
    setColor(1, 0, 0);   // Red
  } else if (right) {
    Serial.print("right (yellow)\n");
    setColor(1, 1, 0);   // Yellow
  } else if (down) {
    Serial.print("down (cyan)\n");
    setColor(0, 1, 1);   // Cyan
  } else if (left) {
    Serial.print("left (indigo)\n");
    setColor(0, 0.5, 1); // Indigo
  } else {
    Serial.print("off\n");
    setColor(0, 0, 0);   // Off
  }

  delay(30); // debounce / poll rate
}