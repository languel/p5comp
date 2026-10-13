/*
  Minimal serial command protocol for p5.js + Web Serial

  Commands:
    /digitalWrite <pin> <0|1>
    /digitalRead <pin>
    /analogWrite <pin> <0-255>
    /analogRead <pin>          // e.g. A0
    /report digital <pin> <ms>
    /report analog <pin> <ms>
    /stopReport

  Responses:
    OK ...
    RESULT ...
    REPORT ...
    ERR ...
*/

String inputLine = "";

bool reporting = false;
String reportMode = "";   // "digital" or "analog"
int reportPin = -1;
unsigned long reportInterval = 200;
unsigned long lastReport = 0;

int parsePin(String token) {
  token.trim();
  token.toUpperCase();

  if (token.startsWith("A")) {
    int n = token.substring(1).toInt();
#if defined(A0)
    return A0 + n;
#else
    return n;
#endif
  }

  return token.toInt();
}

void sendError(const String &msg) {
  Serial.print("ERR ");
  Serial.println(msg);
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (line.startsWith("/")) {
    line.remove(0, 1);
  }

  int s1 = line.indexOf(' ');
  String cmd = (s1 == -1) ? line : line.substring(0, s1);
  String rest = (s1 == -1) ? "" : line.substring(s1 + 1);
  cmd.trim();

  if (cmd == "digitalWrite") {
    int s = rest.indexOf(' ');
    if (s == -1) {
      sendError("usage digitalWrite <pin> <0|1>");
      return;
    }
    String pinTok = rest.substring(0, s);
    String valTok = rest.substring(s + 1);
    int pin = parsePin(pinTok);
    int val = valTok.toInt();

    pinMode(pin, OUTPUT);
    digitalWrite(pin, val ? HIGH : LOW);

    Serial.print("OK digitalWrite ");
    Serial.print(pinTok);
    Serial.print(" ");
    Serial.println(val ? 1 : 0);
    return;
  }

  if (cmd == "digitalRead") {
    int pin = parsePin(rest);
    pinMode(pin, INPUT);
    int v = digitalRead(pin);

    Serial.print("RESULT digitalRead ");
    Serial.print(rest);
    Serial.print(" ");
    Serial.println(v);
    return;
  }

  if (cmd == "analogWrite") {
    int s = rest.indexOf(' ');
    if (s == -1) {
      sendError("usage analogWrite <pin> <0-255>");
      return;
    }
    String pinTok = rest.substring(0, s);
    String valTok = rest.substring(s + 1);
    int pin = parsePin(pinTok);
    int val = constrain(valTok.toInt(), 0, 255);

    pinMode(pin, OUTPUT);
    analogWrite(pin, val);

    Serial.print("OK analogWrite ");
    Serial.print(pinTok);
    Serial.print(" ");
    Serial.println(val);
    return;
  }

  if (cmd == "analogRead") {
    int pin = parsePin(rest);
    int v = analogRead(pin);

    Serial.print("RESULT analogRead ");
    Serial.print(rest);
    Serial.print(" ");
    Serial.println(v);
    return;
  }

  if (cmd == "report") {
    // report digital 2 200
    // report analog A0 100
    int s1r = rest.indexOf(' ');
    if (s1r == -1) {
      sendError("usage report <digital|analog> <pin> <ms>");
      return;
    }
    String mode = rest.substring(0, s1r);
    String rest2 = rest.substring(s1r + 1);

    int s2r = rest2.indexOf(' ');
    if (s2r == -1) {
      sendError("usage report <digital|analog> <pin> <ms>");
      return;
    }

    String pinTok = rest2.substring(0, s2r);
    String msTok = rest2.substring(s2r + 1);

    if (mode != "digital" && mode != "analog") {
      sendError("report mode must be digital or analog");
      return;
    }

    reportMode = mode;
    reportPin = parsePin(pinTok);
    reportInterval = max(1, (int)msTok.toInt());
    reporting = true;
    lastReport = 0;

    if (reportMode == "digital") {
      pinMode(reportPin, INPUT);
    }

    Serial.print("OK report ");
    Serial.print(reportMode);
    Serial.print(" ");
    Serial.print(pinTok);
    Serial.print(" ");
    Serial.println(reportInterval);
    return;
  }

  if (cmd == "stopReport") {
    reporting = false;
    reportMode = "";
    reportPin = -1;
    Serial.println("OK stopReport");
    return;
  }

  sendError("unknown_command");
}

void setup() {
  Serial.begin(9600);
  while (!Serial) { ; }
  Serial.println("READY");
}

void loop() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      handleCommand(inputLine);
      inputLine = "";
    } else if (c != '\r') {
      inputLine += c;
    }
  }

  if (reporting && millis() - lastReport >= reportInterval) {
    lastReport = millis();

    if (reportMode == "digital") {
      int v = digitalRead(reportPin);
      Serial.print("REPORT digital ");
      Serial.print(reportPin);
      Serial.print(" ");
      Serial.println(v);
    } else if (reportMode == "analog") {
      int v = analogRead(reportPin);
      Serial.print("REPORT analog ");
      Serial.print(reportPin);
      Serial.print(" ");
      Serial.println(v);
    }
  }
}