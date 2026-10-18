// No communications framework or extra library: just p5 and Web Serial.
const BAUD_RATE = 9600;
let reader, writer;
// @param desiredLed = false (boolean)
// @send desiredLed
// @receive led
let desiredLed = false;
let lastSent;
let led = 0;
let pending = '';
const decoder = new TextDecoder();

function setup() {
  createCanvas(320, 240);
  createButton('Connect Arduino').position(12, 12).mousePressed(connectArduino);
  createButton('Toggle LED').position(180, 12).mousePressed(() => {
    desiredLed = !led;
    sendLed();
  });
  // p5comp already selected a simulated or physical port. Outside it, click Connect.
  if (window.p5compHostSerial && window.serialConnected) connectArduino();
}

function draw() {
  if (writer && desiredLed !== lastSent) sendLed();
  background('#f4f4f4');
  noStroke();
  fill(led ? '#ef6c68' : '#c9c9ce');
  circle(160, 110, 100);
  fill('#343436');
  textAlign(CENTER);
  text('Arduino LED: ' + led, 160, 195);
}

function sendLed() {
  if (!writer) return;
  writer.write(new TextEncoder().encode(String(Number(desiredLed))));
  lastSent = desiredLed;
}

async function connectArduino() {
  if (reader) return;
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: BAUD_RATE });
  reader = port.readable.getReader();
  writer = port.writable.getWriter();
  readSerial().catch(console.error);
}

async function readSerial() {
  const { value, done } = await reader.read();
  if (done) return;
  pending += decoder.decode(value, { stream: true });
  const messages = pending.split('\n');
  pending = messages.pop();
  messages.forEach(serialLine => { led = Number(serialLine.trim()); });
  // Await the next chunk through another callback, rather than a lifetime while loop.
  readSerial().catch(console.error);
}
