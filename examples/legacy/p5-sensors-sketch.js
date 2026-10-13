// Arduino sends: distance_cm,pot_0_to_1023,button1,button2
// Buttons: 1 = pressed. Distance -1 = no echo. Baud: 9600.
let port, connectButton, modeButton;
let distance = 100, pot = 512, b1 = 0, b2 = 0;
let demo = true, lastPacket = 0;
let distanceHistory = [], potHistory = [];

function setup() {
  createCanvas(480, 560);
  textFont('sans-serif');
  port = createSerial();
  connectButton = createButton('Connect Arduino');
  connectButton.mousePressed(() => {
    if (port.opened()) port.close();
    else if (navigator.serial) { demo = false; port.open(9600); }
    else alert('Use Chrome or Edge for Web Serial.');
  });
  modeButton = createButton('Use simulation');
  modeButton.mousePressed(() => {
    if (port.opened()) port.close();
    demo = true;
  });
}

function readSensors(line) {
  const fields = line.trim().split(',');
  if (fields.length !== 4 || fields.some(v => v.trim() === '')) return;
  const v = fields.map(Number);
  if (!v.every(Number.isFinite)) return;
  if (v[0] < -1 || v[0] > 500 || v[1] < 0 || v[1] > 1023) return;
  if (![0, 1].includes(v[2]) || ![0, 1].includes(v[3])) return;
  [distance, pot, b1, b2] = v;
  lastPacket = millis();
}

function draw() {
  if (port.opened()) {
    demo = false;
    // Read complete lines only; unfinished data stays in the library buffer.
    for (let i = 0; i < 50; i++) {
      const line = port.readUntil('\n');
      if (!line) break;
      readSensors(line);
    }
  }
  if (demo) {
    b1 = keyIsDown(65) ? 1 : 0;
    b2 = keyIsDown(66) ? 1 : 0;
  }
  connectButton.html(port.opened() ? 'Disconnect Arduino' : 'Connect Arduino');
  background('#101923');
  noStroke(); fill('#f2f5fa'); textAlign(LEFT); textSize(25);
  text('Physical computing', 24, 36);
  textSize(12); fill('#aebdce');
  const status = demo ? 'SIMULATION — mouse + A / B keys' :
    port.opened() ? (millis() - lastPacket < 1500 ? 'LIVE — Arduino / 9600 baud' : 'CONNECTED — waiting for CSV data') : 'DISCONNECTED — connect an Arduino';
  text(status, 24, 60);

  fill('#1d2a38'); rect(20, 82, 440, 155, 14);
  fill('#aebdce'); textSize(14); text('DISTANCE · D9 trigger / D8 echo', 36, 108);
  fill('#64d9ef'); textSize(36);
  text(distance < 0 ? 'No echo' : distance.toFixed(1) + ' cm', 36, 153);
  fill('#314455'); rect(36, 177, 408, 12, 6);
  fill(distance >= 0 && distance < 20 ? '#ffb76b' : '#64d9ef');
  rect(36, 177, map(constrain(distance, 0, 400), 0, 400, 0, 408), 12, 6);
  textSize(12); text(distance >= 0 && distance < 20 ? 'NEAR · built-in LED on' : 'Range shown: 0–400 cm', 36, 216);

  fill('#1d2a38'); rect(20, 250, 440, 116, 14);
  fill('#aebdce'); textSize(14); text('POTENTIOMETER · A0', 36, 279);
  fill('#bdadff'); textSize(28); text(round(pot) + ' / 1023', 36, 315);
  fill('#314455'); rect(36, 334, 408, 12, 6);
  fill('#bdadff'); rect(36, 334, map(pot, 0, 1023, 0, 408), 12, 6);

  drawButton(20, 'BUTTON 1 · D2', b1, '#ffb76b', 'A');
  drawButton(245, 'BUTTON 2 · D3', b2, '#9deaaf', 'B');
  fill('#aebdce'); textSize(12);
  text('Simulation: drag horizontally in each sensor card.', 24, 518);
  text('Hold A / B for buttons. Tinkercad tests the circuit separately.', 24, 540);
}

function drawButton(x, label, pressed, color, keyLabel) {
  fill(pressed ? color : '#1d2a38'); rect(x, 380, 215, 109, 14);
  fill(pressed ? '#101923' : '#aebdce'); textSize(13); text(label, x + 16, 408);
  textSize(23); text(pressed ? 'PRESSED' : 'Released', x + 16, 446);
  textSize(12); text('Simulation key: ' + keyLabel, x + 16, 474);
}

function mousePressed() { updateSimulation(); }
function mouseDragged() { updateSimulation(); }
function updateSimulation() {
  if (!demo || mouseX < 20 || mouseX > 460) return;
  if (mouseY >= 82 && mouseY <= 237) distance = map(constrain(mouseX, 36, 444), 36, 444, 0, 400);
  if (mouseY >= 250 && mouseY <= 366) pot = round(map(constrain(mouseX, 36, 444), 36, 444, 0, 1023));
}
