// Servo.h uses timer-generated pulses; no manual pulse loop needed.
// D9 -> servo PWM; servo V+ -> 5V; GND -> common GND.
// Physical servos need a supply sized for their current; share its ground.
#include <Servo.h>
Servo arm;
void setup() { arm.attach(9); }
void loop() {
  for (int angle = 10; angle <= 170; angle += 2) { arm.write(angle); delay(20); }
  for (int angle = 170; angle >= 10; angle -= 2) { arm.write(angle); delay(20); }
}
