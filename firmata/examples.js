export const firmataExamples = {
  light: `function setup() {
  createCanvas(600, 600);
}

function draw() {
  background(248);
  const x = map(pins.light?.value ?? 512, 0, 1023, 0, width);
  noStroke();
  fill(126, 190, 71);
  circle(x, height / 2, 52);
}`,
  pwm: `function setup() {
  createCanvas(600, 600);
}

function draw() {
  background(248);
  const value = Math.round(map(mouseX, 0, width, 0, 255));
  pins.led?.write(value);
  noStroke();
  fill(67, 103, 43);
  circle(mouseX, mouseY, 28 + value / 10);
}`,
  both: `function setup() {
  createCanvas(600, 600);
}

function draw() {
  background(pins.button?.value ? 38 : 248);
  const x = map(pins.light?.value ?? 0, 0, 1023, 0, width);
  const brightness = Math.round(map(mouseX, 0, width, 0, 255));
  pins.led?.write(brightness);
  noStroke();
  fill(pins.button?.value ? 215 : 114, 185, 72);
  circle(x, height / 2, 30 + brightness / 8);
}`
};
