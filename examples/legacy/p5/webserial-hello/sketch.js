// based on 
// https://editor.p5js.org/gohai/sketches/X0XD9xvIR

let port;
let connectBtn;

function setup() {
  createCanvas(400, 400);
  background(220);

  port = createSerial();

  // in setup, we can open ports we have used previously
  // without user interaction

  let usedPorts = usedSerialPorts();
  print(usedPorts);
  if (usedPorts.length > 0) {
    port.open(usedPorts[0], 57600);
  }

  // any other ports can be opened via a dialog after
  // user interaction (see connectBtnClick below)

  connectBtn = createButton('Connect to Arduino');
  connectBtn.position(80, 200);
  connectBtn.mousePressed(connectBtnClick);

  let sendBtn = createButton('Send hello');
  sendBtn.position(220, 200);
  sendBtn.mousePressed(sendBtnClick);
}

function draw() {
  // this makes received text scroll up
  copy(0, 0, width, height, 0, -1, width, height);

  // reads in complete lines and prints them at the
  // bottom of the canvas
  let str = port.readUntil("\n");
  if (str.length > 0) {
    text(str, 10, height-20);
  }

  // changes button label based on connection status
  if (!port.opened()) {
    connectBtn.html('Connect to Arduino');
  } else {
    connectBtn.html('Disconnect');
  }
}

function connectBtnClick() {
  if (!port.opened()) {
    port.open('Arduino', 57600);
  } else {
    port.close();
  }
}

function sendBtnClick() {
  port.write("Hello from p5.js\n");
}

///// ARDUINO CODE //////////////
/////////////////////////////////
/////upload to arduino via IDE///
/////////////////////////////////

// int lines = 0;
// int lines_prev = 0;
// unsigned long lastSent = 0;
// int led = 13;
//
// void setup() {
//   Serial.begin(57600);
//   pinMode(13, OUTPUT);
// }
//
// void loop() {
//   if (Serial.available() > 0) {
//     String input = Serial.readStringUntil('\n');
//     if (input.length() > 0) {
//
//       // this would be the place to parse,
//       // and act upon the message from the
//       // computer
//
//       lines++;
//     }
//   }
//
//   unsigned long now = millis();
//   if (now - lastSent > 2000) {
//     if (lines != lines_prev) {
//       lines_prev=lines;
//    
//       Serial.print("Hello! I heard you ");
//       Serial.print(lines);
//       Serial.println(" times");
//       for (int i = 0; i < lines; i++) {
//         digitalWrite(led, HIGH);
//         delay(300);
//         digitalWrite(led, LOW);
//         delay(300);
//       }
//       lastSent = now;
//     }
//   }
// }