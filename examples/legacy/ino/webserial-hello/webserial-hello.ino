/// ARDUINO CODE //////////////
///////////////////////////////
///upload to arduino via IDE///
///////////////////////////////

int lines = 0;
int lines_prev = 0;
unsigned long lastSent = 0;
int led = 13;

void setup() {
  Serial.begin(57600);
  pinMode(13, OUTPUT);
}

void loop() {
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    if (input.length() > 0) {

      // this would be the place to parse,
      // and act upon the message from the
      // computer

      lines++;
    }
  }

  unsigned long now = millis();
  if (now - lastSent > 2000) {
    if (lines != lines_prev) {
      lines_prev=lines;
   
      Serial.print("Hello! I heard you ");
      Serial.print(lines);
      Serial.println(" times");
      for (int i = 0; i < lines; i++) {
        digitalWrite(led, HIGH);
        delay(300);
        digitalWrite(led, LOW);
        delay(300);
      }
      lastSent = now;
    }
  }
}