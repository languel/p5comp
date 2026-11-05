// Turn the potentiometer to position the servo.
#include <Servo.h>
Servo arm;
void setup() { arm.attach(9); }
void loop() {
  arm.write(map(analogRead(A0), 0, 1023, 0, 180));
  delay(20);
}
