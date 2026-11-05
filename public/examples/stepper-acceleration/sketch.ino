// Non-blocking acceleration with an A4988 STEP/DIR driver.
// Retain RESET/SLEEP HIGH, ENABLE LOW. Set real driver current limit.
#include <AccelStepper.h>
AccelStepper motor(AccelStepper::DRIVER, 2, 3);
void setup() {
  motor.setMaxSpeed(400);
  motor.setAcceleration(200);
  motor.moveTo(200);
}
void loop() {
  if (motor.distanceToGo() == 0) motor.moveTo(-motor.currentPosition());
  motor.run();
}
