const drawing = `
let values = [-1, 0, 0, 0], history = [], received = false;
function acceptLine(line) {
  const n = line.trim().split(',').map(Number);
  if (n.length !== 4 || !n.every(Number.isFinite)) return;
  values = n; received = true;
  history.push(n.slice()); if (history.length > 180) history.shift();
}
function makeControls() {
  ['LED on', 'LED off', 'Auto LED'].forEach((label, i) => {
    const button = createButton(label);
    button.position(25 + i * 125, 315).size(110, 29);
    button.style('border', '0').style('border-radius', '4px');
    button.style('background', 'var(--ui-hover)').style('color', 'var(--ui-text)');
    button.style('font', '11px sans-serif').style('cursor', 'pointer');
    button.elt.addEventListener('click', () => sendSerial('LED:' + [1, 0, -1][i]));
  });
}
function draw() {
  readSerial();
  background(window.theme === 'dark' ? '#222623' : '#fafafa'); noStroke(); textFont('sans-serif'); textAlign(LEFT);
  fill(window.theme === 'dark' ? '#9da69f' : '#858e88'); textSize(11); text('ARDUINO → SERIAL → P5', 25, 26);
  fill(window.theme === 'dark' ? '#d7ded9' : '#464b49'); textSize(38);
  text(!received ? 'Waiting for serial…' : values[0] < 0 ? 'No echo' : values[0].toFixed(1) + ' cm', 25, 78);
  fill(window.theme === 'dark' ? '#9da69f' : '#858e88'); textSize(12); text('pot  ' + values[1] + ' / 1023', 27, 110);
  for (let j = 0; j < 2; j++) {
    const x = 290 + j * 90;
    fill(values[j + 2] ? '#46836f' : (window.theme === 'dark' ? '#3b4840' : '#e8eeea')); circle(x, 66, 32);
    fill(window.theme === 'dark' ? '#9da69f' : '#858e88'); text('button ' + (j + 1), x - 24, 104);
  }
  stroke(window.theme === 'dark' ? '#383e3a' : '#e4e7e5'); line(25, 140, 465, 140); line(25, 245, 465, 245);
  noFill(); strokeWeight(1.5);
  for (let j = 0; j < 2; j++) {
    stroke(j ? '#b0a078' : '#46836f'); beginShape();
    history.forEach((v,i) => vertex(25 + i / 179 * 440, 237 - constrain(v[j] / (j ? 1023 : 400),0,1) * 85));
    endShape();
  }
  noStroke(); fill(window.theme === 'dark' ? '#9da69f' : '#858e88'); textSize(11); text('distance', 25, 267); fill('#b0a078'); text('potentiometer', 95, 267);
  text('P5 → SERIAL → ARDUINO', 25, 302);
}
`;

export const webserialSketch = `// p5.webserial is bundled locally. The host selects simulated / USB transport.
let port;
function setup() {
  createCanvas(500, 360);
  makeControls();
  port = createSerial();
  port.open(9600);
}
function readSerial() {
  if (!port.opened()) return;
  for (let i = 0; i < 50; i++) {
    const line = port.readUntil('\\n');
    if (!line) break;
    acceptLine(line);
  }
}
function sendSerial(line) { if (port.opened()) port.println(line); }
${drawing}`;

export const nativeSketch = `// Native Web Serial API; no p5.webserial calls.
// In this sandbox the host routes the port to the simulated Uno or selected USB device.
let port, reader, writer;
function setup() { createCanvas(500, 360); makeControls(); connectSerial().catch(console.error); }
async function connectSerial() {
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600 });
  reader = port.readable.getReader();
  writer = port.writable.getWriter();
  const decoder = new TextDecoder(); let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\\n'); pending = lines.pop();
      for (const line of lines) acceptLine(line);
    }
  } finally { reader.releaseLock(); writer.releaseLock(); }
}
function readSerial() { /* the async read loop supplies complete lines */ }
function sendSerial(line) { if (writer) writer.write(new TextEncoder().encode(line + '\\n')).catch(console.error); }
${drawing}`;

// Upgrade the early bundled class demo without replacing student logic or serial code.
export function upgradeClassSketchTheme(source) {
  if (
    typeof source !== "string" ||
    !source.includes("function makeControls()") ||
    !source.includes("ARDUINO → SERIAL → P5") ||
    !source.includes("createCanvas(500, 360)") ||
    source.includes("background(window.theme")
  )
    return source;
  const colors = {
    "#fafafa": "#222623",
    "#464b49": "#d7ded9",
    "#858e88": "#9da69f",
    "#e4e7e5": "#383e3a",
    "#e8eeea": "#3b4840",
  };
  return source
    .replace(
      /\b(background|fill|stroke)\(\s*(['"])(#[0-9a-f]{6})\2\s*\)/gi,
      (original, fn, quote, light) =>
        colors[light.toLowerCase()]
          ? `${fn}(window.theme === 'dark' ? '${colors[light.toLowerCase()]}' : '${light}')`
          : original,
    )
    .replace(
      /:\s*(['"])#e8eeea\1/g,
      ": (window.theme === 'dark' ? '#3b4840' : '#e8eeea')",
    )
    .replace(
      /\.style\(\s*(['"])background\1\s*,\s*(['"])#e8eeea\2\s*\)/g,
      ".style('background', 'var(--ui-hover)')",
    )
    .replace(
      /\.style\(\s*(['"])color\1\s*,\s*(['"])#464b49\2\s*\)/g,
      ".style('color', 'var(--ui-text)')",
    );
}
