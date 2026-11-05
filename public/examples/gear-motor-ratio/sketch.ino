// Both motors receive the same PWM and direction.
// The gear motor's 100:1 ratio reduces modeled output-shaft RPM.
// No mechanical load, torque, stall current or gearbox efficiency model.
// PWM controls speed; IN1/IN2 control direction through an H-bridge.
// Never connect a physical motor directly to Arduino GPIO.
// This ideal driver uses 5V VMOT; real motors need a rated driver/supply,
// common ground and the driver's recommended protection/decoupling.
const int enablePin = 5, in1 = 7, in2 = 8;
void setup() {
  pinMode(enablePin, OUTPUT); pinMode(in1, OUTPUT); pinMode(in2, OUTPUT);
}
void loop() {
  for (int direction = 0; direction < 2; direction++) {
    digitalWrite(in1, direction == 0); digitalWrite(in2, direction != 0);
    analogWrite(enablePin, 64); delay(600);
    analogWrite(enablePin, 192); delay(600);
    analogWrite(enablePin, 0); delay(300); // stop before reversing
  }
}
