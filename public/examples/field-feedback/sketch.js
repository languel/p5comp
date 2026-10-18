// FIELD / FEEDBACK
// Original rule-based study, inspired by Casey Reas's Software Structures.
// Agents tug on breathing springs while moving eddies keep energy circulating.
// Pot -> spring tension + physical LED brightness. Sonar -> preferred spacing.
// Switch -> reverse circulation. p5 -> RGB commands. Arduino -> sensor + applied RGB data.
// P: plots on/off. O: side/overlay. R: restart the field.

// @param hue = 190 (0..360 step:1)
let hue = 190;
// @param motionGain = 1 (0..3 step:0.05)
let motionGain = 1;
// @param spacingScale = 1 (0.5..2 step:0.05)
let spacingScale = 1;
// @param colorSpeed = 1 (0..4 step:0.1)
let colorSpeed = 1;
// Live readouts and the real signal paths used below.
// @watch in sensor.pot
// @watch in sensor.cm
// @watch in sensor.hold
// @watch out strength
// @watch out reach
// @watch out energy
// @watch out hueValue
// @watch out requestedRGB
// @link A0 -> sensor.pot
// @link sonar -> sensor.cm
// @link D7 -> sensor.hold
// @link sensor.pot -> strength
// @link sensor.cm -> reach
// @link spacingScale -> reach
// @link motionGain -> energy
// @link energy -> hueValue
// @link colorSpeed -> hueValue
// @link hueValue -> requestedRGB
// @link requestedRGB -> rgbled
let strength = 0,
  reach = 0,
  hueValue = 0;

const WINDOW_SECONDS = 8;
const MAX_AGENTS = 64;
let sensor = { tick: 0, pot: 0, cm: -1, hold: 0, rgb: [0, 0, 0], ack: -1 };
let history = [],
  agents = [],
  ink;
let lastPacket = -Infinity,
  lastSend = 0,
  sequence = 0,
  roundTrip = null;
let pending = new Map(),
  writing = false,
  errorText = "";
let requestedRGB = [0, 0, 0],
  dataVisible = true,
  dataLayout = "side";
let plotButton, layoutButton, hueSlider, art, controls;
let fieldTime = 0,
  energy = 0;

function setup() {
  // A stable teaching canvas avoids a resize feedback loop in the host preview.
  createCanvas(
    window.p5compHostSerial ? 960 : windowWidth,
    window.p5compHostSerial ? 600 : windowHeight,
  );
  pixelDensity(1);
  textFont("monospace");
  controls = createDiv();
  controls
    .style("position", "fixed")
    .style("right", "18px")
    .style("top", "16px");
  controls
    .style("display", "flex")
    .style("gap", "8px")
    .style("align-items", "center");
  controls.style("font", "12px monospace").style("color", "#bfbfbf");
  createSpan("Hue").parent(controls);
  hueSlider = createSlider(0, 360, hue, 1).parent(controls);
  hueSlider.style("width", "76px").attribute("aria-label", "p5 color hue");
  hueSlider.input(() => { hue = Number(hueSlider.value()); });
  plotButton = createButton("Plots · P").parent(controls);
  plotButton.mousePressed(() => (dataVisible = !dataVisible));
  layoutButton = createButton("Side / overlay · O").parent(controls);
  layoutButton.mousePressed(toggleLayout);
  for (const button of [plotButton, layoutButton]) {
    button.style("background", "#292929").style("color", "#dedede");
    button.style("border", "1px solid #494949").style("border-radius", "5px");
    button.style("padding", "7px 9px").style("font", "11px monospace");
  }
  resetField();
}

function resetField() {
  randomSeed(42);
  noiseSeed(42);
  agents = Array.from({ length: MAX_AGENTS }, () => ({
    x: random(),
    y: random(),
    phase: random(TWO_PI),
    vx: random(-30, 30),
    vy: random(-30, 30),
  }));
  fieldTime = 0;
  if (ink) ink.clear();
}

// A complete line may have arrived in several USB chunks. The adapter below
// assembles lines; reject malformed packets before changing any visual state.
function acceptLine(serialLine) {
  // Named fields can arrive in any order; unknown IDs can be added later.
  const fields = Object.create(null);
  for (const token of serialLine.trim().split(/\s+/)) {
    const match = /^([A-Z][A-Z0-9]*):(-?\d+(?:\.\d+)?)$/.exec(token);
    if (!match || Object.hasOwn(fields, match[1])) return;
    fields[match[1]] = Number(match[2]);
  }
  const required = ["MS", "POT0", "DIST0", "SW1", "R", "G", "B", "ACK"];
  if (!required.every((id) => Number.isFinite(fields[id]))) return;
  const {
    MS: tick,
    POT0: pot,
    DIST0: cm,
    SW1: hold,
    R: redValue,
    G: greenValue,
    B: blueValue,
    ACK: ack,
  } = fields;
  if (
    pot < 0 ||
    pot > 1023 ||
    ![0, 1].includes(hold) ||
    [redValue, greenValue, blueValue].some((value) => value < 0 || value > 255)
  )
    return;
  sensor = { tick, pot, cm, hold, rgb: [redValue, greenValue, blueValue], ack };
  lastPacket = millis();
  if (pending.has(ack)) {
    roundTrip = millis() - pending.get(ack);
    pending.delete(ack);
  }
  history.push({ time: millis() / 1000, ...sensor, rgb: [...sensor.rgb] });
  if (history.length > 256) history.shift();
}

function draw() {
  if (Number(hueSlider.value()) !== hue) hueSlider.value(hue);
  background("#181818");
  const live = millis() - lastPacket < 1500;
  const wide = width >= 780;
  const side = dataVisible && dataLayout === "side" && wide;
  const panelWidth = side ? min(340, width * 0.36) : 0;
  controls
    .style("top", wide ? "16px" : "44px")
    .style("left", wide ? "auto" : "18px");
  const top = wide ? 82 : 112;
  const nextArt = {
    x: 16,
    y: top,
    w: max(80, width - 32 - panelWidth),
    h: max(90, height - top - 46),
  };
  if (!ink || art.w !== nextArt.w || art.h !== nextArt.h) {
    if (ink) ink.remove();
    ink = createGraphics(floor(nextArt.w), floor(nextArt.h));
    ink.pixelDensity(1);
  }
  art = nextArt;
  strength = live ? sensor.pot / 1023 : 0;
  const count = MAX_AGENTS;
  reach =
    map(constrain(sensor.cm < 0 ? 100 : sensor.cm, 2, 400), 2, 400, 22, 110) *
    spacingScale;
  hueValue =
    (hue + fieldTime * 5 * colorSpeed + energy * 60) %
    360;
  requestedRGB = hsv(hueValue, 0.72, 1);
  if (live) fieldTime += min(deltaTime, 50) / 1000;
  drawField(count, reach, strength, live);
  image(ink, art.x, art.y);
  noFill();
  stroke("#363636");
  rect(art.x, art.y, art.w, art.h, 8);
  drawHeading(live, count, reach);
  if (dataVisible) {
    const panel = side
      ? { x: art.x + art.w + 14, y: art.y, w: panelWidth - 14, h: art.h }
      : {
          x: art.x + 10,
          y: art.y + 10,
          w: min(320, art.w - 20),
          h: min(370, art.h - 20),
        };
    drawPlots(panel, live);
  }
  sendColor(live);
  plotButton.attribute("aria-pressed", String(dataVisible));
  fill("#a0a0a0");
  noStroke();
  textSize(10);
  text(
    "POT: energy + tension + light   SONAR: spacing   SWITCH: direction",
    18,
    height - 23,
  );
}

// Three forces: elastic neighbours, short-range repulsion, and two moving eddies.
// The eddies continually inject energy; damping and a speed limit keep it bounded.
function stepSprings(dt, tension, rest, w, h, time) {
  const forces = agents.map((a) => {
    const x = a.x * w,
      y = a.y * h;
    let fx = (w / 2 - x) * 0.08,
      fy = (h / 2 - y) * 0.08;
    for (let v = 0; v < 2; v++) {
      const phase = time * 0.35 + v * Math.PI;
      const dx = x - w * (0.5 + 0.28 * Math.sin(phase));
      const dy = y - h * (0.5 + 0.28 * Math.cos(phase * 0.83));
      const direction = sensor.hold ? -1 : 1;
      const swirl =
        (direction * (v ? -1 : 1) * (25 + tension * 160) * motionGain) /
        (1 + (dx * dx + dy * dy) / 18000);
      const distance = Math.max(10, Math.hypot(dx, dy));
      fx += (-dy / distance) * swirl;
      fy += (dx / distance) * swirl;
    }
    return { x: fx, y: fy };
  });
  for (let i = 0; i < agents.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = agents[i],
        b = agents[j];
      const dx = (b.x - a.x) * w,
        dy = (b.y - a.y) * h;
      const distance = Math.max(0.1, Math.hypot(dx, dy));
      if (distance > rest * 2.4) continue;
      const breathing = 1 + 0.2 * Math.sin(time * 1.3 + a.phase + b.phase);
      let pull = (distance - rest * breathing) * (0.8 + tension * 8);
      if (distance < rest * 0.55) pull += (distance - rest * 0.55) * 18;
      pull *= 1 - distance / (rest * 2.4);
      const fx = (dx / distance) * pull,
        fy = (dy / distance) * pull;
      forces[i].x += fx;
      forces[i].y += fy;
      forces[j].x -= fx;
      forces[j].y -= fy;
    }
  }
  let speedSum = 0;
  agents.forEach((a, i) => {
    const damping = Math.exp(-0.65 * dt);
    a.vx = (a.vx + forces[i].x * dt) * damping;
    a.vy = (a.vy + forces[i].y * dt) * damping;
    const speed = Math.hypot(a.vx, a.vy),
      limit = 150;
    if (speed > limit) {
      a.vx *= limit / speed;
      a.vy *= limit / speed;
    }
    a.x += (a.vx * dt) / w;
    a.y += (a.vy * dt) / h;
    // Reflect at the edges rather than wrapping springs across the whole screen.
    if (a.x < 0.02 || a.x > 0.98) {
      a.x = Math.max(0.02, Math.min(0.98, a.x));
      a.vx *= -0.8;
    }
    if (a.y < 0.02 || a.y > 0.98) {
      a.y = Math.max(0.02, Math.min(0.98, a.y));
      a.vy *= -0.8;
    }
    speedSum += Math.hypot(a.vx, a.vy);
  });
  energy = speedSum / agents.length / 150;
}

function drawField(count, rest, tension, live) {
  const dt = min(deltaTime, 50) / 1000;
  if (live) {
    // Two small steps keep stiff springs stable, even with a slow display frame.
    stepSprings(dt / 2, tension, rest, art.w, art.h, fieldTime);
    stepSprings(dt / 2, tension, rest, art.w, art.h, fieldTime);
  }
  ink.noStroke();
  ink.fill(24, 24, 24, 32);
  ink.rect(0, 0, ink.width, ink.height);
  for (let i = 0; i < count; i++) {
    const a = agents[i],
      ax = a.x * art.w,
      ay = a.y * art.h;
    for (let j = 0; j < i; j++) {
      const b = agents[j],
        bx = b.x * art.w,
        by = b.y * art.h;
      const distance = dist(ax, ay, bx, by);
      if (distance > rest * 2.4) continue;
      const strain = (distance - rest) / rest;
      const tint = strain > 0.25 ? [255, 158, 108] : requestedRGB;
      ink.stroke(...tint, 30 + min(1, abs(strain)) * 65);
      ink.strokeWeight(0.55 + min(1, abs(strain)) * 0.8);
      ink.line(ax, ay, bx, by);
    }
    ink.noStroke();
    ink.fill(222, 241, 244, 220);
    ink.circle(ax, ay, 2.6 + min(2, Math.hypot(a.vx, a.vy) / 60));
  }
}

function drawHeading(live, count, reach) {
  noStroke();
  fill("#e9e9e9");
  textSize(width < 600 ? 15 : 20);
  text("FIELD / FEEDBACK", 18, 31);
  fill(live ? "#d4d4d4" : "#999999");
  textSize(10);
  text(
    live
      ? sensor.hold
        ? "LIVE · reverse circulation"
        : "LIVE · Arduino → p5 → Arduino"
      : "WAITING FOR ARDUINO · run / connect",
    18,
    width >= 780 ? 57 : 94,
  );
  fill("#969696");
  text(
    `${count} agents · ${round(reach)}px spacing · energy ${energy.toFixed(2)}`,
    art.x + 12,
    art.y + art.h - 12,
  );
}

function sendColor(live) {
  if (!live || !arduinoComms.connected || writing || millis() - lastSend < 100)
    return;
  lastSend = millis();
  const id = sequence++ % 32768;
  pending.set(id, millis());
  if (pending.size > 64) pending.delete(pending.keys().next().value);
  writing = true;
  // Values are unscaled: Arduino independently applies its physical pot.
  Promise.resolve(
    arduinoComms.sendLine(
      `SEQ:${id} R:${requestedRGB[0]} G:${requestedRGB[1]} B:${requestedRGB[2]}`,
    ),
  )
    .then(() => (errorText = ""))
    .catch((error) => (errorText = error.message))
    .finally(() => (writing = false));
}

function drawPlots(panel, live) {
  push();
  fill(30, 30, 30, 235);
  stroke("#484848");
  rect(panel.x, panel.y, panel.w, panel.h, 8);
  noStroke();
  fill("#dedede");
  textSize(11);
  text("RAW SIGNALS / LAST 8s", panel.x + 12, panel.y + 21);
  textSize(9);
  fill("#a5a5a5");
  text("Arduino → p5 · actual received samples", panel.x + 12, panel.y + 38);
  const rows = [
    {
      title: `POT A0 · ${live ? sensor.pot : "—"} / 1023`,
      max: 1023,
      colors: [[111, 213, 193]],
      get: (s) => [s.pot],
    },
    {
      title: `SONAR · ${live && sensor.cm >= 0 ? sensor.cm.toFixed(1) + " cm" : "no echo / no data"}`,
      max: 400,
      colors: [[234, 188, 110]],
      get: (s) => [s.cm],
    },
    {
      title: `SWITCH D7 · ${sensor.hold ? "reverse" : "forward"}`,
      max: 1,
      colors: [[184, 156, 235]],
      get: (s) => [s.hold],
    },
    {
      title: "RGB · applied by Arduino after pot",
      max: 255,
      colors: [
        [245, 117, 120],
        [130, 213, 158],
        [124, 180, 247],
      ],
      get: (s) => s.rgb,
    },
  ];
  const rowHeight = max(25, (panel.h - 128) / 4);
  const now = millis() / 1000,
    left = panel.x + 12,
    chartWidth = panel.w - 24;
  rows.forEach((row, index) => {
    const top = panel.y + 56 + index * rowHeight;
    fill("#cccccc");
    noStroke();
    text(row.title, left, top);
    stroke("#3b3b3b");
    line(left, top + 8, left + chartWidth, top + 8);
    line(left, top + rowHeight - 7, left + chartWidth, top + rowHeight - 7);
    row.colors.forEach((tint, channel) => {
      stroke(...tint);
      strokeWeight(1.2);
      let previous = null;
      for (const sample of history) {
        const value = row.get(sample)[channel];
        if (sample.time < now - WINDOW_SECONDS || value < 0) {
          previous = null;
          continue;
        }
        const x =
          left +
          ((sample.time - now + WINDOW_SECONDS) / WINDOW_SECONDS) * chartWidth;
        const y = map(
          constrain(value, 0, row.max),
          0,
          row.max,
          top + rowHeight - 7,
          top + 8,
        );
        if (previous && sample.time - previous.time < 0.5)
          line(previous.x, previous.y, x, y);
        previous = { x, y, time: sample.time };
      }
    });
  });
  noStroke();
  textSize(9);
  fill("#d0d0d0");
  const footer = panel.y + panel.h - 55;
  text(`p5 target:  ${requestedRGB.join(" / ")}`, left, footer);
  text(`Arduino:    ${sensor.rgb.join(" / ")}`, left, footer + 14);
  fill(live ? "#d4d4d4" : "#999999");
  text(
    errorText
      ? "Serial: " + errorText.slice(0, 32)
      : `ACK ${sensor.ack} · round trip ${roundTrip === null ? "—" : round(roundTrip) + " ms"}`,
    left,
    footer + 29,
  );
  pop();
}

function hsv(h, s, v) {
  const sector = h / 60,
    part = sector % 1,
    lo = v * (1 - s);
  const falling = v * (1 - part * s),
    rising = v * (1 - (1 - part) * s);
  const channels = [
    [v, rising, lo],
    [falling, v, lo],
    [lo, v, rising],
    [lo, falling, v],
    [rising, lo, v],
    [v, lo, falling],
  ];
  return channels[floor(sector) % 6].map((value) => round(value * 255));
}

function toggleLayout() {
  dataLayout = dataLayout === "side" ? "overlay" : "side";
  dataVisible = true;
}
function keyPressed(event) {
  if (event.target?.closest?.("input,textarea,select,[contenteditable]"))
    return;
  if (key.toLowerCase() === "p") dataVisible = !dataVisible;
  if (key.toLowerCase() === "o") toggleLayout();
  if (key.toLowerCase() === "r") resetField();
}
function windowResized() {
  if (!window.p5compHostSerial) resizeCanvas(windowWidth, windowHeight);
}

// p5comp communications: begin
// p5comp communications: version 2
////////////////////////////////////////////////////////////////////////
// Arduino ↔ p5: webserial. This code is part of your sketch.
// Match Serial.begin() in your Arduino sketch.
const SERIAL_BAUD_RATE = 9600;
const SERIAL_AUTO_CONNECT = false; // Only a previously permitted, unambiguous device.
const SERIAL_CONTROLS = "always"; // 'always', 'hover', or 'hidden' once connected.
const SERIAL_SHORTCUT = "s"; // Alt+Shift+S reveals/hides controls.

// Load a local p5.webserial.js first, then jsDelivr. No index.html edit needed.
const P5_WEBSERIAL_LOCAL = "./p5.webserial.js";
const P5_WEBSERIAL_CDN =
  "https://cdn.jsdelivr.net/npm/@gohai/p5.webserial@1.1.2/libraries/p5.webserial.js";
function loadArduinoSerialLibrary(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      script.remove();
      reject(new Error("Timed out loading " + url));
    }, 8000);
    script.src = url;
    script.onload = () => {
      clearTimeout(timeout);
      if (typeof p5.prototype.WebSerial === "function") resolve();
      else {
        script.remove();
        reject(new Error("Invalid p5.webserial library: " + url));
      }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error("Could not load " + url));
    };
    document.head.append(script);
  });
}
const ArduinoSerialPort = p5.prototype.WebSerial;
const arduinoComms = (window.arduinoComms = {
  lastLine: "",
  connected: false,
  requireSerial() {
    if (!navigator.serial)
      throw new Error(
        "USB serial is unavailable in this browser. Use Chrome or Edge; Safari is not supported.",
      );
  },
  onLine(serialLine) {
    this.lastLine = serialLine;
    if (typeof acceptLine === "function") acceptLine(serialLine);
  },
  async connect(onLine, options = {}) {
    if (this.connected) return;
    if (onLine) this.onLine = onLine;
    this.requireSerial();
    const host =
      window.p5compHostSerial || typeof window.serialConnected === "boolean";
    // Ask while the click still has browser permission to open the chooser.
    const selectedPort =
      options.port || (host ? null : await navigator.serial.requestPort());
    if (!ArduinoSerialPort && typeof p5.prototype.WebSerial !== "function") {
      await loadArduinoSerialLibrary(P5_WEBSERIAL_LOCAL).catch(() =>
        loadArduinoSerialLibrary(P5_WEBSERIAL_CDN),
      );
    }
    this.port = new (ArduinoSerialPort || p5.prototype.WebSerial)(
      this.sketch || window,
    );
    await this.port.selectPort(
      ...(selectedPort ? [selectedPort, SERIAL_BAUD_RATE] : [SERIAL_BAUD_RATE]),
    );
    await new Promise((resolve, reject) => {
      let finished = false;
      this.readTask = this.port.start().finally(() => {
        finished = true;
      });
      const check = () => {
        if (this.port.opened()) return resolve();
        if (finished)
          return reject(
            new Error(
              "Could not open Arduino serial port. Close other serial monitors and retry.",
            ),
          );
        setTimeout(check, 20);
      };
      check();
    });
    this.connected = true;
  },
  poll() {
    if (!this.port?.opened()) return;
    for (let i = 0; i < 50; i++) {
      const serialLine = this.port.readUntil("\n");
      if (!serialLine) break;
      this.onLine(serialLine);
    }
  },
  sendLine(serialLine) {
    if (this.port?.opened()) return this.port.println(serialLine);
  },
  async disconnect() {
    await this.port?.close();
    this.connected = false;
  },
});

(function () {
  let removeControls = () => {};
  function afterSetup() {
    arduinoComms.sketch = this;
    if (
      window.p5compHostSerial ||
      typeof window.serialConnected === "boolean"
    ) {
      if (window.serialConnected) arduinoComms.connect().catch(console.error);
      return;
    }
    const controls = document.createElement("div");
    controls.style.cssText =
      "position:fixed;right:0;bottom:0;z-index:1000;display:flex;align-items:center;gap:8px;padding:12px;min-width:180px;min-height:40px;max-width:90vw;font:13px sans-serif";
    const button = document.createElement("button");
    button.style.cssText = "padding:8px 12px;cursor:pointer";
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    arduinoComms.connectButton = button;
    arduinoComms.connectControls = controls;
    const supported = Boolean(navigator.serial);
    let hovered = false,
      focused = false,
      revealed = null;
    function update() {
      const visible =
        !arduinoComms.connected ||
        focused ||
        status.textContent ||
        (revealed ??
          (SERIAL_CONTROLS === "always" ||
            (SERIAL_CONTROLS === "hover" && hovered)));
      controls.hidden = !visible && SERIAL_CONTROLS === "hidden";
      controls.style.opacity = visible ? "1" : "0";
      // In hover mode the transparent bottom-right area stays reachable.
      controls.style.pointerEvents = controls.hidden ? "none" : "auto";
      if (!button.disabled)
        button.textContent = arduinoComms.connected
          ? "Disconnect Arduino"
          : "Connect Arduino";
    }
    arduinoComms.updateControls = update;
    controls.onmouseenter = () => {
      hovered = true;
      update();
    };
    controls.onmouseleave = () => {
      hovered = false;
      update();
    };
    controls.onfocusin = () => {
      focused = true;
      update();
    };
    controls.onfocusout = (event) => {
      focused = controls.contains(event.relatedTarget);
      update();
    };
    const shortcut = (event) => {
      if (
        !event.altKey ||
        !event.shiftKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.code !== "Key" + SERIAL_SHORTCUT.toUpperCase() ||
        event.repeat
      )
        return;
      if (event.target.closest?.("input,textarea,[contenteditable=true]"))
        return;
      event.preventDefault();
      revealed = controls.hidden || controls.style.opacity === "0";
      update();
    };
    document.addEventListener("keydown", shortcut);
    removeControls = () => {
      document.removeEventListener("keydown", shortcut);
      controls.remove();
    };
    if (!supported) {
      button.disabled = true;
      button.textContent = "USB serial unavailable";
      status.textContent =
        "Use a browser with Web Serial, such as Chrome or Edge. Safari is not supported.";
    }
    async function connectOrDisconnect(options) {
      button.disabled = true;
      status.textContent = "";
      try {
        if (arduinoComms.connected) await arduinoComms.disconnect();
        else await arduinoComms.connect(undefined, options);
      } catch (error) {
        if (error.name === "NotFoundError")
          status.textContent = "No port selected. Click Connect to try again.";
        else {
          console.error(error);
          status.textContent =
            error.name === "NetworkError"
              ? "Port unavailable. Disconnect p5comp and other serial monitors, then retry."
              : error.message;
        }
      } finally {
        button.disabled = !supported;
        // Clicking does not force the control to stay visible once connected.
        focused = button.matches?.(":focus-visible") || false;
        revealed = null;
        update();
      }
    }
    button.onclick = () => connectOrDisconnect();
    controls.append(button, status);
    document.body.append(controls);
    update();
    if (supported && SERIAL_AUTO_CONNECT) {
      button.disabled = true;
      navigator.serial
        .getPorts()
        .then((ports) => {
          if (ports.length === 1)
            return connectOrDisconnect({ port: ports[0] });
          status.textContent = ports.length
            ? "Choose which Arduino to connect."
            : "Click Connect to permit an Arduino first.";
        })
        .catch((error) => {
          status.textContent = error.message;
        })
        .finally(() => {
          button.disabled = false;
          update();
        });
    }
  }
  function beforeDraw() {
    arduinoComms.poll();
    arduinoComms.updateControls?.();
  }
  function removed() {
    removeControls();
    arduinoComms.disconnect().catch(console.error);
  }
  if (typeof p5.registerAddon === "function") {
    p5.registerAddon(function (_p5, _prototype, lifecycles) {
      lifecycles.postsetup = afterSetup;
      lifecycles.predraw = beforeDraw;
      lifecycles.remove = removed;
    });
  } else {
    p5.prototype.registerMethod("afterSetup", afterSetup);
    p5.prototype.registerMethod("pre", beforeDraw);
    p5.prototype.registerMethod("remove", removed);
  }
})();

////////////////////////////////////////////////////////////////////////
// p5comp communications: end
