import { nativeSketch, webserialSketch } from "./examples.js";
const begin = "// p5comp communications: begin",
  end = "// p5comp communications: end";
const normalize = (s) =>
  s
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, "")
    .replace(/"/g, "'");
function block(
  api,
  { parser: parserSource = "", client: clientSource = "" } = {},
) {
  const header = `${begin}\n////////////////////////////////////////////////////////////////////////\n// Arduino ↔ p5: ${api}. This code is part of your sketch.\n`;
  if (api === "none")
    return (
      header +
      `var arduinoComms = {connect:async()=>{},poll(){},sendLine(){},lastLine:''};\n////////////////////////////////////////////////////////////////////////\n${end}`
    );
  const common = `var arduinoComms = {\n  lastLine:'', connected:false,\n  onLine(line){this.lastLine=line;if(typeof acceptLine==='function')acceptLine(line);},\n`;
  if (api === "webserial")
    return (
      header +
      `// p5.webserial is loaded by index.html. In setup/draw you can also call connect/poll explicitly.\n${common}  async connect(onLine){if(this.connected)return; if(onLine)this.onLine=onLine;this.port=createSerial();await this.port.open(9600);this.connected=true;},\n  poll(){if(!this.port?.opened())return;for(let i=0;i<50;i++){const line=this.port.readUntil('\\n');if(!line)break;this.onLine(line);}},\n  sendLine(line){if(this.port?.opened())return this.port.println(line);},\n  async disconnect(){await this.port?.close();this.connected=false;}\n};\np5.prototype.registerMethod('pre',()=>arduinoComms.poll());\np5.prototype.registerMethod('afterSetup',()=>{if(window.serialConnected)arduinoComms.connect().catch(console.error);});\n////////////////////////////////////////////////////////////////////////\n${end}`
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
    header +
    `// ${firmata ? "Requires StandardFirmata Arduino firmware (57600 baud)." : "Native navigator.serial, UTF-8 newline messages at 9600 baud."}\n// Outside p5comp, call arduinoComms.connect() from a button click to choose a device.\n${common}  async connect(onLine){\n    if(this.connected)return;if(onLine)this.onLine=onLine;\n    const ports=await navigator.serial.getPorts();this.port=ports.length===1?ports[0]:await navigator.serial.requestPort();\n    await this.port.open({baudRate:${firmata ? 57600 : 9600}});this.reader=this.port.readable.getReader();this.writer=this.port.writable.getWriter();this.connected=true;\n    ${firmata ? `${classes}\nconst transport=new EventTarget();transport.write=bytes=>this.writer.write(bytes);this.board=new FirmataClient(transport);let attempts=0;const retry=setInterval(()=>{if(++attempts<8)this.board.initialize().catch(console.error);else clearInterval(retry);},500);this.board.addEventListener('ready',()=>{clearInterval(retry);this.onReady?.(this.board);});\nthis.readTask=this.readBytes(bytes=>transport.dispatchEvent(new CustomEvent('bytes',{detail:bytes})));await this.board.initialize();` : "const decoder=new TextDecoder();let pending='';this.readTask=this.readBytes(bytes=>{pending+=decoder.decode(bytes,{stream:true});const lines=pending.split('\\n');pending=lines.pop();for(const line of lines)this.onLine(line);});"}\n  },\n  async readBytes(receive){try{while(this.connected){const {value,done}=await this.reader.read();if(done)break;receive(value);}}catch(error){if(this.connected)console.error(error);}},\n  poll(){},\n  sendLine(line){${firmata ? "throw new Error('Use arduinoComms.board.setPinMode(pin, mode) and .write(pin, value) for Firmata.');" : "if(this.writer)return this.writer.write(new TextEncoder().encode(line+'\\n'));"}},\n  async disconnect(){this.connected=false;this.board?.destroy();await this.reader?.cancel();await this.readTask;this.reader?.releaseLock();this.writer?.releaseLock();await this.port?.close();}\n};\np5.prototype.registerMethod('afterSetup',()=>{if(window.serialConnected)arduinoComms.connect().catch(console.error);});\n////////////////////////////////////////////////////////////////////////\n${end}`
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
export function embedComms(source, api, sources = {}) {
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
        `function setup(){createCanvas(500,360);makeControls();}\nfunction readSerial(){arduinoComms.poll();}\nfunction sendSerial(line){return arduinoComms.sendLine(line);}\n` +
        source.slice(marker);
    }
  }
  return source + "\n\n" + block(api, sources) + "\n";
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
