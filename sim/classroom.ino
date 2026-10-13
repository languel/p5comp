// Distance, potentiometer, two buttons. CSV at 9600 baud.
const int TRIG = 9, ECHO = 8, POT = A0;
const int BUTTON1 = 2, BUTTON2 = 3;
int stable[2] = {HIGH, HIGH}, previous[2] = {HIGH, HIGH};
unsigned long changedAt[2] = {0, 0}, lastSample = 0;
int manualLed = -1; // -1 = distance controls the LED
String command;

void setup() {
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT);
  pinMode(BUTTON1, INPUT_PULLUP); pinMode(BUTTON2, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT); Serial.begin(9600);
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      if (command.startsWith("LED:")) manualLed = command.substring(4).toInt();
      if (command == "PING") Serial.println("PONG");
      command = "";
    } else if (c != '\r' && command.length() < 40) command += c;
  }
  for (int i = 0; i < 2; i++) {
    int raw = digitalRead(i == 0 ? BUTTON1 : BUTTON2);
    if (raw != previous[i]) { previous[i] = raw; changedAt[i] = millis(); }
    if (millis() - changedAt[i] >= 20) stable[i] = raw;
  }
  if (millis() - lastSample < 60) return;
  lastSample = millis();
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 30000);
  float cm = us ? us * 0.0343 / 2.0 : -1;
  digitalWrite(LED_BUILTIN, manualLed < 0 ? (cm >= 0 && cm < 20) : manualLed != 0);
  Serial.print(cm, 1); Serial.print(',');
  Serial.print(analogRead(POT)); Serial.print(',');
  Serial.print(stable[0] == LOW ? 1 : 0); Serial.print(',');
  Serial.println(stable[1] == LOW ? 1 : 0);
}
