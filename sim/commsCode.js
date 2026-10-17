import { nativeSketch, webserialSketch } from "./examples.js";
export const COMMS_VERSION = "// p5comp communications: version 2";
const begin = "// p5comp communications: begin",
  end = "// p5comp communications: end";
const normalize = (s) =>
  s
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, "")
    .replace(/"/g, "'");
// p5 1.x and 2.x use different lifecycle registration APIs.
const lifecycle = `
(function () {
  let removeControls = () => {};
  function afterSetup() {
    arduinoComms.sketch = this;
    if (window.p5compHostSerial || typeof window.serialConnected === 'boolean') {
      if (window.serialConnected) arduinoComms.connect().catch(console.error);
      return;
    }
    const controls = document.createElement('div');
    controls.style.cssText = 'position:fixed;right:0;bottom:0;z-index:1000;display:flex;align-items:center;gap:8px;padding:12px;min-width:180px;min-height:40px;max-width:90vw;font:13px sans-serif';
    const button = document.createElement('button');
    button.style.cssText = 'padding:8px 12px;cursor:pointer';
    const status = document.createElement('span');
    status.setAttribute('role','status');
    arduinoComms.connectButton = button;
    arduinoComms.connectControls = controls;
    const supported = Boolean(navigator.serial);
    let hovered = false, focused = false, revealed = null;
    function update() {
      const visible = !arduinoComms.connected || focused || status.textContent || (revealed ?? (SERIAL_CONTROLS === 'always' || (SERIAL_CONTROLS === 'hover' && hovered)));
      controls.hidden = !visible && SERIAL_CONTROLS === 'hidden';
      controls.style.opacity = visible ? '1' : '0';
      // In hover mode the transparent bottom-right area stays reachable.
      controls.style.pointerEvents = controls.hidden ? 'none' : 'auto';
      if (!button.disabled) button.textContent = arduinoComms.connected ? 'Disconnect Arduino' : 'Connect Arduino';
    }
    arduinoComms.updateControls = update;
    controls.onmouseenter = () => { hovered = true; update(); };
    controls.onmouseleave = () => { hovered = false; update(); };
    controls.onfocusin = () => { focused = true; update(); };
    controls.onfocusout = event => { focused = controls.contains(event.relatedTarget); update(); };
    const shortcut = event => {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.code !== 'Key' + SERIAL_SHORTCUT.toUpperCase() || event.repeat) return;
      if (event.target.closest?.('input,textarea,[contenteditable=true]')) return;
      event.preventDefault(); revealed = controls.hidden || controls.style.opacity === '0'; update();
    };
    document.addEventListener('keydown', shortcut);
    removeControls = () => { document.removeEventListener('keydown', shortcut); controls.remove(); };
    if (!supported) {
      button.disabled = true;
      button.textContent = 'USB serial unavailable';
      status.textContent = 'Use a browser with Web Serial, such as Chrome or Edge. Safari is not supported.';
    }
    async function connectOrDisconnect(options) {
      button.disabled = true;
      status.textContent = '';
      try {
        if (arduinoComms.connected) await arduinoComms.disconnect();
        else await arduinoComms.connect(undefined, options);
      } catch (error) {
        if (error.name === 'NotFoundError') status.textContent = 'No port selected. Click Connect to try again.';
        else {
          console.error(error);
          status.textContent = error.name === 'NetworkError'
            ? 'Port unavailable. Disconnect p5comp and other serial monitors, then retry.'
            : error.message;
        }
      } finally {
        button.disabled = !supported;
        // Clicking does not force the control to stay visible once connected.
        focused = button.matches?.(':focus-visible') || false; revealed = null; update();
      }
    }
    button.onclick = () => connectOrDisconnect();
    controls.append(button,status);
    document.body.append(controls);
    update();
    if (supported && SERIAL_AUTO_CONNECT) {
      button.disabled = true;
      navigator.serial.getPorts().then(ports => {
        if (ports.length === 1) return connectOrDisconnect({port:ports[0]});
        status.textContent = ports.length ? 'Choose which Arduino to connect.' : 'Click Connect to permit an Arduino first.';
      }).catch(error => { status.textContent = error.message; }).finally(() => { button.disabled = false; update(); });
    }
  }
  function beforeDraw() { arduinoComms.poll(); arduinoComms.updateControls?.(); }
  function removed() { removeControls(); arduinoComms.disconnect().catch(console.error); }
  if (typeof p5.registerAddon === 'function') {
    p5.registerAddon(function (_p5, _prototype, lifecycles) {
      lifecycles.postsetup = afterSetup;
      lifecycles.predraw = beforeDraw;
      lifecycles.remove = removed;
    });
  } else {
    p5.prototype.registerMethod('afterSetup', afterSetup);
    p5.prototype.registerMethod('pre', beforeDraw);
    p5.prototype.registerMethod('remove', removed);
  }
})();
`;
function block(
  api,
  { parser: parserSource = "", client: clientSource = "" } = {},
  options = {},
) {
  const header = `${begin}\n${COMMS_VERSION}\n////////////////////////////////////////////////////////////////////////\n// Arduino ↔ p5: ${api}. This code is part of your sketch.\n`;
  if (api === "none")
    return (
      header +
      `const arduinoComms = window.arduinoComms = {connect:async()=>{},poll(){},sendLine(){},lastLine:''};\n////////////////////////////////////////////////////////////////////////\n${end}`
    );
  const settings = `// Match Serial.begin() in your Arduino sketch.\nconst SERIAL_BAUD_RATE = ${options.baudRate ?? (api === "firmata" ? 57600 : 9600)};\nconst SERIAL_AUTO_CONNECT = ${options.autoConnect ?? false}; // Only a previously permitted, unambiguous device.\nconst SERIAL_CONTROLS = '${options.controls || "always"}'; // 'always', 'hover', or 'hidden' once connected.\nconst SERIAL_SHORTCUT = '${options.shortcut || "s"}'; // Alt+Shift+S reveals/hides controls.\n\n`;
  const common = `const ArduinoSerialPort = p5.prototype.WebSerial;\nconst arduinoComms = window.arduinoComms = {\n  lastLine:'', connected:false,\n  requireSerial(){if(!navigator.serial)throw new Error('USB serial is unavailable in this browser. Use Chrome or Edge; Safari is not supported.');},\n  onLine(line){this.lastLine=line;if(typeof acceptLine==='function')acceptLine(line);},\n`;
  if (api === "webserial")
    return (
      header + settings +
      `// Load a local p5.webserial.js first, then jsDelivr. No index.html edit needed.\nconst P5_WEBSERIAL_LOCAL = './p5.webserial.js';\nconst P5_WEBSERIAL_CDN = 'https://cdn.jsdelivr.net/npm/@gohai/p5.webserial@1.1.2/libraries/p5.webserial.js';\nfunction loadArduinoSerialLibrary(url){\n  return new Promise((resolve,reject)=>{\n    const script=document.createElement('script');\n    const timeout=setTimeout(()=>{script.remove();reject(new Error('Timed out loading '+url));},8000);\n    script.src=url;\n    script.onload=()=>{clearTimeout(timeout);if(typeof p5.prototype.WebSerial==='function')resolve();else{script.remove();reject(new Error('Invalid p5.webserial library: '+url));}};\n    script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('Could not load '+url));};\n    document.head.append(script);\n  });\n}\n${common}  async connect(onLine, options={}){if(this.connected)return; if(onLine)this.onLine=onLine;this.requireSerial();const host=window.p5compHostSerial || typeof window.serialConnected==='boolean';\n    // Ask while the click still has browser permission to open the chooser.\n    const selectedPort=options.port || (host?null:await navigator.serial.requestPort());\n    if(!ArduinoSerialPort && typeof p5.prototype.WebSerial!=='function'){\n      await loadArduinoSerialLibrary(P5_WEBSERIAL_LOCAL).catch(()=>loadArduinoSerialLibrary(P5_WEBSERIAL_CDN));\n    }\n    this.port=new (ArduinoSerialPort || p5.prototype.WebSerial)(this.sketch || window);\n    await this.port.selectPort(...(selectedPort?[selectedPort,SERIAL_BAUD_RATE]:[SERIAL_BAUD_RATE]));\n    await new Promise((resolve,reject)=>{let finished=false;this.readTask=this.port.start().finally(()=>{finished=true;});const check=()=>{if(this.port.opened())return resolve();if(finished)return reject(new Error('Could not open Arduino serial port. Close other serial monitors and retry.'));setTimeout(check,20);};check();});this.connected=true;},\n  poll(){if(!this.port?.opened())return;for(let i=0;i<50;i++){const line=this.port.readUntil('\\n');if(!line)break;this.onLine(line);}},\n  sendLine(line){if(this.port?.opened())return this.port.println(line);},\n  async disconnect(){await this.port?.close();this.connected=false;}\n};\n${lifecycle}\n////////////////////////////////////////////////////////////////////////\n${end}`
    );
  const firmata = api === "firmata";
  const classes = firmata
    ? (
        parserSource +
        "\n" +
        clientSource.replace(/^import[^\n]*\n/m, "")
      ).replace(/\bexport\s+/g, "")
    : "";
  return (
    header + settings +
    `// ${firmata ? "Requires StandardFirmata Arduino firmware (57600 baud)." : "Native navigator.serial, UTF-8 newline messages."}\n// Outside p5comp, call arduinoComms.connect() from a button click to choose a device.\n${common}  async connect(onLine, options={}){\n    if(this.connected)return;if(onLine)this.onLine=onLine;this.requireSerial();\n    const host=window.p5compHostSerial || typeof window.serialConnected==='boolean';const ports=host?await navigator.serial.getPorts():[];this.port=options.port || (ports.length===1?ports[0]:await navigator.serial.requestPort());\n    await this.port.open({baudRate:SERIAL_BAUD_RATE});this.reader=this.port.readable.getReader();this.writer=this.port.writable.getWriter();this.connected=true;\n    ${firmata ? `${classes}\nconst transport=new EventTarget();transport.write=bytes=>this.writer.write(bytes);this.board=new FirmataClient(transport);let attempts=0;const retry=setInterval(()=>{if(++attempts<8)this.board.initialize().catch(console.error);else clearInterval(retry);},500);this.board.addEventListener('ready',()=>{clearInterval(retry);this.onReady?.(this.board);});\nthis.readTask=this.readBytes(bytes=>transport.dispatchEvent(new CustomEvent('bytes',{detail:bytes})));await this.board.initialize();` : "const decoder=new TextDecoder();let pending='';this.readTask=this.readBytes(bytes=>{pending+=decoder.decode(bytes,{stream:true});const lines=pending.split('\\n');pending=lines.pop();for(const line of lines)this.onLine(line);});"}\n  },\n  readBytes(receive){\n    // One read per promise callback: no long-lived loop for the p5 editor to time out.\n    return new Promise(resolve=>{\n      const readNext=()=>{\n        if(!this.connected){resolve();return;}\n        this.reader.read().then(({value,done})=>{\n          if(done){this.connected=false;resolve();return;}\n          if(value)receive(value);\n          readNext();\n        }).catch(error=>{if(this.connected)console.error(error);this.connected=false;resolve();});\n      };\n      readNext();\n    });\n  },\n  poll(){},\n  sendLine(line){${firmata ? "throw new Error('Use arduinoComms.board.setPinMode(pin, mode) and .write(pin, value) for Firmata.');" : "if(this.writer)return this.writer.write(new TextEncoder().encode(line+'\\n'));"}},\n  async disconnect(){this.connected=false;this.board?.destroy();await this.reader?.cancel();await this.readTask;this.reader?.releaseLock();this.writer?.releaseLock();await this.port?.close();}\n};\n${lifecycle}\n////////////////////////////////////////////////////////////////////////\n${end}`
  );
}
// Upgrade the two bundled starter drawings without replacing student drawing logic.
function upgradeStarter(source) {
  if (
    !source.includes("// A real serial message controls the drawing") &&
    !source.includes("// Values come from Arduino at 9600 baud")
  )
    return source;
  const start = source.indexOf("while (port.opened()) {");
  if (start < 0) return source;
  const brace = source.indexOf("{", start);
  let depth = 1,
    end = brace + 1;
  for (; end < source.length && depth; end++) {
    if (source[end] === "{") depth++;
    if (source[end] === "}") depth--;
  }
  const handler = source
    .slice(brace + 1, end - 1)
    .replace(
      /\s*const line = port.readUntil\([^;]*;\s*if \(!line\) break;/,
      "",
    );
  source = source.slice(0, start) + "arduinoComms.poll();" + source.slice(end);
  source = source
    .replace("let port, ", "let ")
    .replace(/\s*port = createSerial\(\);\s*port.open\(9600\);/, "");
  return source + "\nfunction acceptLine(line) {" + handler + "\n}\n";
}
function renameSerialParameter(source) {
  const signature = /function (?:acceptLine|sendSerial)\(line\)\s*\{/g;
  // Skip strings/comments when locating the handler's closing brace or renaming.
  const token = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|[{}]|\bline\b/g;
  let match;
  while ((match = signature.exec(source))) {
    token.lastIndex = signature.lastIndex;
    let depth = 1, part;
    while ((part = token.exec(source))) {
      if (part[1]) continue;
      if (part[0] === "{") depth++;
      if (part[0] === "}" && --depth === 0) break;
    }
    if (!part) break;
    const end = token.lastIndex;
    const handler = source.slice(match.index, end).replace(token, (word, quoted) => quoted || (word === "line" ? "serialLine" : word));
    source = source.slice(0, match.index) + handler + source.slice(end);
    signature.lastIndex = match.index + handler.length;
  }
  return source;
}
export function embedComms(source, api, sources = {}) {
  // Keep student-edited settings when rebuilding/switching the managed adapter.
  const oldAPI = source.match(/Arduino ↔ p5: (\w+)/)?.[1];
  const oldBaud = Number(source.match(/const SERIAL_BAUD_RATE\s*=\s*(\d+)/)?.[1]);
  const options = {
    baudRate: oldAPI && (oldAPI === 'firmata') !== (api === 'firmata') ? undefined : (oldBaud > 0 && oldBaud <= 4000000 ? oldBaud : undefined),
    autoConnect: source.match(/const SERIAL_AUTO_CONNECT\s*=\s*(true|false)/)?.[1] === 'true',
    controls: source.match(/const SERIAL_CONTROLS\s*=\s*['"](always|hover|hidden)['"]/)?.[1],
    shortcut: source.match(/const SERIAL_SHORTCUT\s*=\s*['"]([a-z])['"]/i)?.[1],
  };
  source = upgradeStarter(source);
  source = source
    .replace(new RegExp("\\n?" + begin + "[\\s\\S]*?" + end + "\\n?", "g"), "")
    .trimEnd();
  const marker = source.search(/\blet\s+values\s*=/);
  if (marker >= 0) {
    const prefix = source.slice(0, marker);
    if (
      [nativeSketch, webserialSketch].some(
        (s) =>
          normalize(prefix) ===
          normalize(s.slice(0, s.search(/\blet\s+values\s*=/))),
      )
    ) {
      source =
        `function setup(){createCanvas(500,360);makeControls();}\nfunction readSerial(){arduinoComms.poll();}\nfunction sendSerial(serialLine){return arduinoComms.sendLine(serialLine);}\n` +
        source.slice(marker);
    }
  }
  return renameSerialParameter(source) + "\n\n" + block(api, sources, options).replace(/\bline\b/g, "serialLine") + "\n";
}

export function commsExample(api, sources = {}) {
  const starter =
    api === "none"
      ? "function setup(){createCanvas(500,360); }\nfunction draw(){background(window.theme === 'dark' ? '#242426' : '#fafafa'); }"
      : api === "firmata"
        ? "function setup(){createCanvas(500,360);arduinoComms.onReady=board=>board.setPinMode('A0','ANALOG');}\nfunction draw(){background(window.theme === 'dark' ? '#242426' : '#fafafa');fill(window.theme === 'dark' ? '#d8d8da' : '#464b49');text('Firmata A0: '+(arduinoComms.board?.pins.find(p=>p.id==='A0')?.value??'waiting'),20,40);}"
        : api === "native"
          ? nativeSketch
          : webserialSketch;
  return embedComms(starter, api, sources);
}
