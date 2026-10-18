// No communications framework or extra library: just p5 and Web Serial.
const BAUD_RATE = 9600;
let reader, writer;
// @param interval = 500 (50..2000 step:10)
// @send interval
// @receive led
let interval = 500;
let led = 0;
let intervalSlider;
let pending = '';
const decoder = new TextDecoder();

function setup() {
  createCanvas(320, 240);
  createButton('Connect Arduino').position(12, 12).mousePressed(connectArduino);
  intervalSlider = createSlider(50, 2000, 500, 10);
  intervalSlider.position(20, 200);
  intervalSlider.style('width', '280px');
  intervalSlider.input(sendInterval);
  // p5comp already selected a simulated or physical port. Outside it, click Connect.
  if (window.p5compHostSerial && window.serialConnected) connectArduino();
}

function draw() {
  if (intervalSlider.value() !== interval) {
    intervalSlider.value(interval);
    sendInterval();
  }
  background('#f4f4f4');
  noStroke();
  fill(led ? '#ef6c68' : '#c9c9ce');
  circle(160, 110, 100);
  fill('#343436');
  textAlign(CENTER);
  text('Blink interval: ' + intervalSlider.value() + ' ms', 160, 180);
}

function sendInterval() {
  interval = Number(intervalSlider.value());
  writer?.write(new TextEncoder().encode(intervalSlider.value() + '\n'));
}

async function connectArduino() {
  if (reader) return;
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: BAUD_RATE });
  reader = port.readable.getReader();
  writer = port.writable.getWriter();
  sendInterval();
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
