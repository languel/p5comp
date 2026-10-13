// Shared classroom Uno uploader, adapted from /Users/liuboto/dev/webfirmata/src/lib/uploader.js.
// Keeps explicit port ownership, STK500v1 signature validation and flash readback.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function parseHex(text) {
  let offset = 0,
    end = 0,
    eof = false;
  const flash = new Uint8Array(32768).fill(255);
  for (const line of text.trim().split(/\r?\n/)) {
    if (!/^:[0-9a-f]+$/i.test(line) || line.length % 2 !== 1)
      throw new Error("Invalid Intel HEX record.");
    const bytes = Uint8Array.from(
      line
        .slice(1)
        .match(/../g)
        .map((s) => parseInt(s, 16)),
    );
    if (bytes.length !== bytes[0] + 5 || bytes.reduce((a, b) => a + b, 0) % 256)
      throw new Error("Firmware checksum mismatch.");
    const [length, hi, lo, type] = bytes,
      address = ((hi << 8) | lo) + offset;
    if (eof) throw new Error("Data after HEX end record.");
    if (type === 0) {
      if (address + length > 32256)
        throw new Error("Firmware exceeds Uno application flash.");
      flash.set(bytes.slice(4, 4 + length), address);
      end = Math.max(end, address + length);
    } else if (type === 1) eof = true;
    else if (type === 4) offset = ((bytes[4] << 8) | bytes[5]) * 65536;
    else if (type === 2) offset = ((bytes[4] << 8) | bytes[5]) * 16;
    else throw new Error("Unsupported HEX record.");
  }
  if (!end || !eof) throw new Error("Empty or incomplete firmware.");
  return flash.slice(0, Math.ceil(end / 128) * 128);
}
// Uno R3 Optiboot / STK500v1. Web Serial owns the port only for the upload.
export async function flashUno(port, hex, onProgress = () => {}) {
  const firmware = parseHex(hex);
  let reader,
    writer,
    readTask,
    stopped = false,
    rx = [];
  const waitBytes = async (count, timeout = 2000) => {
    const deadline = Date.now() + timeout;
    while (rx.length < count) {
      if (stopped) throw new Error("Upload port disconnected.");
      if (Date.now() > deadline)
        throw new Error("Bootloader response timed out.");
      await sleep(5);
    }
    return rx.splice(0, count);
  };
  const packet = async (data, count = 0) => {
    await writer.write(Uint8Array.from([...data, 0x20]));
    const reply = await waitBytes(count + 2);
    if (reply[0] !== 0x14 || reply.at(-1) !== 0x10)
      throw new Error("Unexpected bootloader reply. Try resetting the board.");
    return reply.slice(1, -1);
  };
  try {
    await port.open({ baudRate: 115200 });
    reader = port.readable.getReader();
    writer = port.writable.getWriter();
    readTask = (async () => {
      try {
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          rx.push(...value);
        }
      } catch {
      } finally {
        stopped = true;
      }
    })();
    onProgress("Resetting Uno…");
    await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await sleep(250);
    await port.setSignals({ dataTerminalReady: true, requestToSend: true });
    await sleep(50);
    let synced = false;
    for (let i = 0; i < 8 && !synced; i++) {
      rx = [];
      try {
        await packet([0x30]);
        synced = true;
      } catch (e) {
        if (i === 7) throw e;
      }
    }
    const signature = await packet([0x75], 3);
    if (signature.join(",") !== "30,149,15")
      throw new Error("Device is not an ATmega328P Uno. Upload stopped.");
    await packet([0x50]);
    for (let address = 0; address < firmware.length; address += 128) {
      const word = address / 2;
      await packet([0x55, word & 255, word >> 8]);
      await packet([
        0x64,
        0,
        128,
        0x46,
        ...firmware.slice(address, address + 128),
      ]);
      onProgress(
        `Writing firmware · ${Math.round(((address + 128) / firmware.length) * 100)}%`,
      );
    }
    for (let address = 0; address < firmware.length; address += 128) {
      const word = address / 2;
      await packet([0x55, word & 255, word >> 8]);
      const read = await packet([0x74, 0, 128, 0x46], 128);
      if (read.some((byte, i) => byte !== firmware[address + i]))
        throw new Error(`Verification failed at byte ${address}.`);
      onProgress(
        `Verifying firmware · ${Math.round(((address + 128) / firmware.length) * 100)}%`,
      );
    }
    await packet([0x51]);
    onProgress("Firmware verified. Ready to connect.");
  } finally {
    stopped = true;
    try {
      await reader?.cancel();
      await readTask;
    } catch {}
    reader?.releaseLock();
    writer?.releaseLock();
    try {
      await port.close();
    } catch {}
  }
}
