/** Reproducible authoring recipe. Invoked inside ego-browser with its owned Page. */
export async function recordLEDLesson(page) {
  const key = "physical-p5.circuit-project.v1:lesson-from-scratch-recording";
  const initial = {
    version: 2,
    diagram: { version: 1, parts: [], connections: [] },
    arduino: "",
    api: "webserial",
    p5: { webserial: "" },
    workbench: {
      name: "Getting started · LED from scratch",
      files: {
        "index.html":
          '<!doctype html><html><head><script src="p5.js"></script><script src="p5.webserial.js"></script></head><body><script src="sketch.js"></script></body></html>',
      },
      settings: { p5Major: 1 },
      layout: "horizontal",
    },
  };
  await page.evaluate(
    ({ key, initial }) => localStorage.setItem(key, JSON.stringify(initial)),
    { key, initial },
  );
  await page.reload();
  await page.waitForFunction(() => !!window.physicalP5);
  await page.evaluate(() => {
    physicalP5.setArduino("");
    physicalP5.setP5("");
  });
  await page.click('loc=css:button[aria-label="Lesson timeline"]');
  await page.fill(
    'loc=css:input[aria-label="Take title"]',
    "Getting started · build an LED from scratch",
  );
  await page.click('loc=css:button[aria-label="Record lesson"]');
  await page.waitForSelector(
    'loc=css:button[aria-label="Stop and save take"]',
    { timeout: 30000 },
  );
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const caption = async (text, hold = 2600) => {
    await page.click('loc=css:button[aria-label="Lesson timeline"]');
    await page.fill('loc=css:input[aria-label="Lesson caption"]', text);
    await page.press('loc=css:input[aria-label="Lesson caption"]', "Enter");
    await wait(hold);
  };
  const diagram = { version: 1, parts: [], connections: [] };
  const update = async () => {
    await page.evaluate((d) => physicalP5.setDiagram(d), diagram);
    await page.evaluate(() => physicalP5.canvas.fit());
  };
  await caption(
    "Start with an empty circuit and two blank code files. No hardware is needed.",
  );
  diagram.parts.push({
    id: "uno",
    type: "wokwi-arduino-uno",
    left: 50,
    top: 180,
    label: "Arduino Uno",
    attrs: {},
  });
  await update();
  await caption("Add an Arduino Uno. Digital pin 13 will control our LED.");
  diagram.parts.push({
    id: "r1",
    type: "wokwi-resistor",
    left: 350,
    top: 120,
    label: "330 Ω · current limit",
    attrs: { value: "330" },
  });
  await update();
  await caption("Add a 330 ohm resistor to limit the current through the LED.");
  diagram.parts.push({
    id: "led",
    type: "wokwi-led",
    left: 540,
    top: 120,
    label: "Red LED",
    attrs: { color: "red" },
  });
  await update();
  await caption("Add a red LED. A is its anode; C is its cathode.");
  diagram.connections.push(["uno:13", "r1:1", "green", []]);
  await update();
  await caption("Wire digital pin 13 to the first leg of the resistor.");
  diagram.connections.push(["r1:2", "led:A", "red", []]);
  await update();
  await caption("Wire the other resistor leg to the LED anode, A.");
  diagram.connections.push(["led:C", "uno:GND.1", "black", []]);
  await update();
  await caption("Complete the circuit: LED cathode C goes to Arduino GND.");
  const arduino = [
    [
      "const int LED_PIN = 13;\n",
      "Name pin 13 so the code explains which output we use.",
    ],
    [
      "\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n",
      "setup runs once. Set our LED pin to OUTPUT.",
    ],
    [
      "  Serial.begin(9600);\n}\n",
      "Start serial at 9600 baud so p5 can receive messages.",
    ],
    [
      "\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  Serial.println(1);\n  delay(500);\n",
      "Turn the LED on, send a 1, and wait half a second.",
    ],
    [
      "  digitalWrite(LED_PIN, LOW);\n  Serial.println(0);\n  delay(500);\n}\n",
      "Turn it off and send a 0. loop repeats these two states.",
    ],
  ];
  let source = "";
  for (const [chunk, text] of arduino) {
    source += chunk;
    await page.evaluate((code) => physicalP5.setArduino(code), source);
    await caption(text, 3000);
  }
  const p5 = [
    [
      "// @receive led\nlet port;\nlet led = 0;\n",
      "Now write p5 from scratch. Keep the serial port and latest LED value.",
    ],
    [
      "\nfunction setup() {\n  createCanvas(440, 320);\n  port = createSerial();\n",
      "Create a canvas and a serial reader using the included p5.webserial library.",
    ],
    [
      "  port.selectPort(9600)\n    .then(() => port.start());\n}\n",
      "Open the simulator serial stream at the same 9600 baud.",
    ],
    [
      '\nfunction draw() {\n  const line = port.readUntil("\\n");\n  if (line.trim()) led = Number(line);\n',
      "Read one newline-delimited message. Convert the received text to a number.",
    ],
    [
      '  background(245);\n  noStroke();\n  fill(led ? "#ef6c68" : "#c9c9ce");\n  circle(220, 140, 120);\n',
      "Use the received value to choose the circle color. This is not a separate blink timer.",
    ],
    [
      '  fill(45);\n  textAlign(CENTER);\n  textSize(22);\n  text(led ? "LED ON" : "LED OFF", 220, 250);\n}\n',
      "Label the current LED state so we can compare the circuit and the drawing.",
    ],
  ];
  source = "";
  for (const [chunk, text] of p5) {
    source += chunk;
    await page.evaluate((code) => physicalP5.setP5(code), source);
    await caption(text, 3000);
  }
  await caption(
    "Run Arduino and p5. The browser compiles the Arduino sketch for the simulator.",
  );
  await page.evaluate(() => {
    window.__ledLessonFrameCount = 0;
    addEventListener("message", (e) => {
      if (
        e.data?.type === "mirrorFrame" &&
        e.source ===
          document.querySelector(".preview-panel iframe")?.contentWindow
      )
        window.__ledLessonFrameCount++;
    });
  });
  await page.click('loc=css:button[aria-label="Run Arduino + p5"]');
  await page.waitForFunction(() => physicalP5.getState().running, undefined, {
    timeout: 60000,
  });
  await page.waitForFunction(
    () => ["0", "1"].includes(physicalP5.getState().packet),
    undefined,
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => window.__ledLessonFrameCount > 2,
    undefined,
    { timeout: 40000 },
  );
  await caption(
    "Watch the LED and circle blink together. Serial carries 1, then 0.",
    6500,
  );
  await caption(
    "Trace the signal: Arduino output → serial message → p5 variable → circle color.",
    4000,
  );
  await caption(
    "Try changing both delays from 500 to 250. Predict the result before running again.",
    4000,
  );
  await page.click('loc=css:button[aria-label="Stop and save take"]');
  const result = await page.evaluate((key) => {
    const project = JSON.parse(localStorage.getItem(key));
    return {
      project,
      take: Object.values(project.workbench.takes).at(-1),
      state: physicalP5.getState(),
      console: physicalP5.readConsole().slice(-8),
    };
  }, key);
  return result;
}
