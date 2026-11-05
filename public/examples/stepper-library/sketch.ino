// Standard Stepper library through a dual H-bridge, NEVER bare GPIO coils.
// IN1/IN2 drive coil A; IN3/IN4 drive coil B; ENA/ENB held HIGH.
// Ideal simulation uses 5V VMOT. Choose a real driver/supply for your motor.
#include <Stepper.h>
const int stepsPerTurn = 200;
Stepper motor(stepsPerTurn, 8, 9, 10, 11);
void setup() { motor.setSpeed(60); }
void loop() {
  motor.step(stepsPerTurn); delay(400);
  motor.step(-stepsPerTurn); delay(400);
}
