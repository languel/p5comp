// p5 sends the blink interval in milliseconds, followed by a newline.
const long BAUD_RATE = 9600;
unsigned long interval = 500;
unsigned long lastBlink = 0;
int led = LOW;
String command;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(BAUD_RATE);
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      interval = constrain(command.toInt(), 50, 2000);
      command = "";
    } else if (c >= '0' && c <= '9' && command.length() < 5) {
      command += c;
    }
  }
  if (millis() - lastBlink >= interval) {
    lastBlink = millis();
    led = !led;
    digitalWrite(LED_BUILTIN, led);
    Serial.println(led);
  }
}
