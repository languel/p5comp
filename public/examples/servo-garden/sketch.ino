// Twelve servos on one Uno: the full standard Servo.h capacity.
// D2–D13 are signal pins (ordinary GPIO is fine). A0 controls speed;
// the A1 slide switch selects traveling wave / alternating petals.
// The simulator's VCC symbols are ideal 5V. REAL HARDWARE: use a separate
// regulated servo supply sized for all 12 stall currents, with common GND.
// Do not power a bank of servos from USB or the Uno 5V regulator.
#include <Servo.h>
const byte count = 12;
Servo petals[count];
const byte speedPin = A0, modePin = A1;
float phase = 0;
unsigned long previous = 0;
void setup() {
  for (byte i = 0; i < count; i++) petals[i].attach(i + 2);
  pinMode(modePin, INPUT);
  previous = millis();
}
void loop() {
  const unsigned long now = millis();
  const float dt = (now - previous) / 1000.0;
  previous = now;
  const float speed = 0.12 + analogRead(speedPin) / 1023.0 * 0.6;
  phase += dt * speed * TWO_PI;
  if (phase >= TWO_PI) phase -= TWO_PI;
  const bool alternating = digitalRead(modePin);
  for (byte i = 0; i < count; i++) {
    const float offset = alternating ? (i % 2) * PI : i * TWO_PI / count;
    petals[i].write(90 + 65 * sin(phase + offset));
  }
  delay(20);
}
