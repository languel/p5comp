// Field / feedback: two-way Arduino + p5, 9600 baud.
// Arduino -> p5: MS:123 POT0:512 DIST0:42.3 SW1:0 R:128 G:64 B:32 ACK:7
// p5 -> Arduino: SEQ:8 R:255 G:80 B:20 (newline terminated)
// p5 chooses RGB; the physical pot scales its brightness on Arduino.
const long BAUD_RATE = 9600;
const byte POT = A0, SWITCH = 7, TRIG = 4, ECHO = 3;
const byte RED_PIN = 10, GREEN_PIN = 9, BLUE_PIN = 11;
const unsigned long SAMPLE_MS = 100;  // approximately 10 named sensor packets/second at 9600 baud

char command[48];
byte commandLength = 0;
bool overflow = false;
unsigned int desired[3] = {0, 0, 0};
unsigned int applied[3] = {0, 0, 0};
int acknowledged = -1;
unsigned long lastCommand = 0, lastSample = 0;
int potValue = 0;
bool holdState = false, previousSwitch = false;
unsigned long switchChanged = 0;

// Token order is free. All four command fields must be present exactly once.
void applyCommand() {
  unsigned int values[4] = {0, 0, 0, 0};
  byte seen = 0;
  char *context;
  for (char *token = strtok_r(command, " \t", &context); token;
       token = strtok_r(NULL, " \t", &context)) {
    char *colon = strchr(token, ':');
    if (!colon || colon == token || !colon[1]) return;
    *colon = '\0';
    char *end;
    long value = strtol(colon + 1, &end, 10);
    if (*end || value < 0) return;
    int field = -1;
    if (strcmp(token, "SEQ") == 0) field = 0;
    else if (strcmp(token, "R") == 0) field = 1;
    else if (strcmp(token, "G") == 0) field = 2;
    else if (strcmp(token, "B") == 0) field = 3;
    else return;
    if (seen & (1 << field)) return;
    if (value > (field == 0 ? 32767 : 255)) return;
    values[field] = value;
    seen |= 1 << field;
  }
  if (seen != 15) return;
  acknowledged = values[0];
  for (byte channel = 0; channel < 3; channel++) desired[channel] = values[channel + 1];
  lastCommand = millis();
}

void receiveCommands() {
  while (Serial.available()) {
    char next = Serial.read();
    if (next == '\r') continue;
    if (next == '\n') {
      command[commandLength] = '\0';
      if (!overflow) applyCommand();
      commandLength = 0;
      overflow = false;
    } else if (commandLength < sizeof(command) - 1 && !overflow) {
      command[commandLength++] = next;
    } else {
      overflow = true;  // discard the whole oversized message, not a partial command
    }
  }
}

void setup() {
  pinMode(SWITCH, INPUT_PULLUP);  // closed to GND means hold
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(BAUD_RATE);
}

void loop() {
  receiveCommands();
  potValue = analogRead(POT);
  bool closed = digitalRead(SWITCH) == LOW;
  if (closed != previousSwitch) switchChanged = millis();
  previousSwitch = closed;
  if (millis() - switchChanged >= 25) holdState = closed;

  // This multiplication happens on Arduino, not in the p5 drawing.
  for (byte channel = 0; channel < 3; channel++) {
    applied[channel] = (desired[channel] * (unsigned long)potValue + 511) / 1023;
  }
  analogWrite(RED_PIN, applied[0]);
  analogWrite(GREEN_PIN, applied[1]);
  analogWrite(BLUE_PIN, applied[2]);
  digitalWrite(LED_BUILTIN, acknowledged >= 0 && millis() - lastCommand < 1200);

  if (millis() - lastSample < SAMPLE_MS) return;
  lastSample = millis();
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long duration = pulseIn(ECHO, HIGH, 25000);
  float distanceCm = duration ? duration * 0.0343 / 2.0 : -1;

  char packet[112];
  char distanceText[12];
  dtostrf(distanceCm, 0, 1, distanceText);  // AVR snprintf does not format floats
  snprintf(packet, sizeof(packet), "MS:%lu POT0:%d DIST0:%s SW1:%d R:%u G:%u B:%u ACK:%d",
    millis(), potValue, distanceText, holdState ? 1 : 0,
    applied[0], applied[1], applied[2], acknowledged);
  Serial.println(packet);  // one complete, readable sensor snapshot per line
}
