// Send 0 or 1 to control the built-in LED. Report its state as a line of text.
const long BAUD_RATE = 9600;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(BAUD_RATE);
}

void loop() {
  if (Serial.available()) {
    char command = Serial.read();
    if (command == '0' || command == '1') {
      digitalWrite(LED_BUILTIN, command == '1' ? HIGH : LOW);
    }
  }
  Serial.println(digitalRead(LED_BUILTIN));
  delay(100);
}
