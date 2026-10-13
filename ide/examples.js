export const examples = {
  input: {
    arduino: `int switchPin = 4;
int photoPin = A4;
int potPin = A0;

void setup() {
  pinMode(switchPin, INPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.print("D4: ");
  Serial.print(digitalRead(switchPin));
  Serial.print(" A4: ");
  Serial.print(analogRead(photoPin));
  Serial.print(" A0: ");
  Serial.println(analogRead(potPin));
  delay(20);
}`,
    p5: `function setup() {
  createCanvas(600, 600);
}

function draw() {
  background(signals.D4 ? 24 : 248);
  const x = map(signals.A0 ?? 512, 0, 1023, 0, width);
  const y = map(signals.A4 ?? 512, 0, 1023, 0, height);
  fill(signals.D4 ? 198 : 107, 222, 82);
  noStroke();
  circle(x, y, 32 + (signals.A4 ?? 0) / 12);
}`
  },
  lissajous: {
    arduino: `void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.print("A4: ");
  Serial.print(analogRead(A4));
  Serial.print(" A0: ");
  Serial.println(analogRead(A0));
  delay(20);
}`,
    p5: `let phase = 0;

function setup() {
  createCanvas(600, 600);
  background(248);
}

function draw() {
  background(248, 248, 244, 24);
  noFill();
  stroke(63, 101, 42);
  strokeWeight(1.5);
  const fx = (signals.A4 ?? 500) / 100;
  const fy = (signals.A0 ?? 400) / 100;
  beginShape();
  for (let i = 0; i <= 500; i++) {
    const t = map(i, 0, 500, 0, TWO_PI * 4);
    vertex(width / 2 + width * 0.43 * sin(fx * t + phase),
           height / 2 + height * 0.43 * sin(fy * t));
  }
  endShape();
  phase += 0.01;
}`
  },
  drawing: {
    arduino: `const int switchPin = 4;

void setup() {
  pinMode(switchPin, INPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.print("D4: ");
  Serial.print(digitalRead(switchPin));
  Serial.print(" A0: ");
  Serial.println(analogRead(A0));
  delay(20);
}`,
    p5: `function setup() {
  createCanvas(600, 600);
  background(248);
}

function draw() {
  if (signals.D4) {
    const diameter = map(signals.A0 ?? 0, 0, 1023, 4, 60);
    noStroke();
    fill(101, 153, 56, 145);
    circle(mouseX, mouseY, diameter);
  }
}

function mousePressed() {
  background(248);
}`
  },
  browser: {
    arduino: `const int ledPin = 11;
const int switchPin = 4;

void setup() {
  pinMode(ledPin, OUTPUT);
  pinMode(switchPin, INPUT);
  Serial.begin(9600);
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\\n');
    line.trim();
    if (line.startsWith("brightness:")) {
      int value = line.substring(11).toInt();
      analogWrite(ledPin, constrain(value, 0, 255));
    }
    if (line == "LED: 1") digitalWrite(13, HIGH);
    if (line == "LED: 0") digitalWrite(13, LOW);
  }
  Serial.print("D4: ");
  Serial.println(digitalRead(switchPin));
  delay(20);
}`,
    p5: `function setup() {
  createCanvas(600, 600);
}

let lastBrightness = -1;
let lastSentAt = 0;

function draw() {
  background(248);
  const brightness = Math.round(map(mouseX, 0, width, 0, 255));
  fill(60, 90 + brightness / 2, 45);
  noStroke();
  circle(mouseX, mouseY, 35 + brightness / 5);
  if (serialConnected && brightness !== lastBrightness && millis() - lastSentAt >= 40) {
    send("brightness", brightness);
    lastBrightness = brightness;
    lastSentAt = millis();
  }
}

function mousePressed() {
  send("LED", 1);
}

function mouseReleased() {
  send("LED", 0);
}`
  }
};
