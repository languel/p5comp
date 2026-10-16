// Explicit user start; no microphone or audio context is created at load time.
export class CircuitAudio {
  constructor({ onInput, onError }) {
    this.onInput = onInput;
    this.onError = onError;
    this.sources = new Set();
    this.next = 0;
    this.enabled = false;
    this.input = null;
  }
  async enable() {
    this.context ||= new AudioContext();
    await this.context.resume();
    this.enabled = true;
    this.next = this.context.currentTime;
  }
  silence() {
    for (const s of this.sources)
      try {
        s.stop();
      } catch {}
    this.sources.clear();
    this.next = 0;
  }
  async disable() {
    this.enabled = false;
    this.silence();
    if (!this.input) await this.context?.suspend();
  }
  consume(frames, parts) {
    if (!this.enabled || !frames.length || !this.context) return;
    const speakers = parts.filter((p) => p.type === "p5comp-speaker");
    if (!speakers.length) return;
    const audio = this.context.createBuffer(1, frames.length, 12000),
      data = audio.getChannelData(0);
    for (let i = 0; i < frames.length; i++)
      data[i] = Math.tanh(
        speakers.reduce(
          (v, p, k) =>
            v +
            (frames[i].audio[k] || 0) *
              Math.max(0, Math.min(1, Number(p.attrs?.volume ?? 0.15))),
          0,
        ) / 5,
      );
    const source = this.context.createBufferSource(),
      highpass = this.context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 20;
    source.buffer = audio;
    source.connect(highpass).connect(this.context.destination);
    this.next = Math.max(this.next, this.context.currentTime + 0.025);
    if (this.next > this.context.currentTime + 0.3) {
      this.silence();
      this.next = this.context.currentTime + 0.025;
    }
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      highpass.disconnect();
      this.sources.delete(source);
    };
    source.start(this.next);
    this.next += audio.duration;
  }
  async stopInput() {
    clearInterval(this.inputTimer);
    this.inputTimer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      this.input?.stop?.();
    } catch {}
    this.input?.disconnect();
    this.input = null;
    this.onInput(null);
  }
  async startInput(kind, file) {
    await this.stopInput();
    const wasEnabled = this.enabled;
    await this.enable();
    this.enabled = wasEnabled;
    const c = this.context;
    let node;
    if (kind === "microphone") {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.stream = stream;
      node = c.createMediaStreamSource(stream);
    } else if (kind === "file") {
      if (!file) throw Error("Choose an audio file first.");
      const buffer = await c.decodeAudioData(await file.arrayBuffer());
      node = c.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.start();
    } else {
      node = c.createOscillator();
      node.frequency.value = 220;
      node.start();
    }
    this.input = node;
    const analyzer = c.createAnalyser();
    analyzer.fftSize = 1024;
    node.connect(analyzer);
    const data = new Float32Array(analyzer.fftSize);
    this.inputTimer = setInterval(() => {
      analyzer.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      this.onInput(Math.max(0, Math.min(1023, Math.round(rms * 1023))));
    }, 33);
  }
  mount(parent) {
    const panel = document.createElement("details");
    panel.className = "audio-settings";
    panel.innerHTML =
      '<summary>Audio input and output</summary><div><button type="button" data-audio="output">Enable speaker audio</button><select aria-label="Audio input source"><option value="tone">Test tone</option><option value="microphone">Microphone</option><option value="file">Audio file</option></select><input type="file" accept="audio/*" aria-label="Audio input file"><button type="button" data-audio="input">Start audio input</button><output role="status">Audio off · input feeds all sound sensors (RMS level)</output></div>';
    parent.append(panel);
    const status = panel.querySelector("output"),
      out = panel.querySelector("[data-audio=output]"),
      input = panel.querySelector("[data-audio=input]");
    out.onclick = async () => {
      try {
        if (this.enabled) await this.disable();
        else await this.enable();
        out.textContent = this.enabled
          ? "Mute speaker audio"
          : "Enable speaker audio";
        status.textContent = this.enabled
          ? "Speaker audio enabled"
          : "Speaker audio muted";
      } catch (e) {
        status.textContent = e.message;
        this.onError(e.message);
      }
    };
    input.onclick = async () => {
      try {
        if (this.input) {
          await this.stopInput();
          input.textContent = "Start audio input";
          status.textContent = "Audio input stopped";
        } else {
          await this.startInput(
            panel.querySelector("select").value,
            panel.querySelector("input").files[0],
          );
          input.textContent = "Stop audio input";
          out.textContent = this.enabled
            ? "Mute speaker audio"
            : "Enable speaker audio";
          status.textContent = "Audio input active · sound sensor RMS levels";
        }
      } catch (e) {
        await this.stopInput();
        status.textContent = e.message;
        this.onError(e.message);
      }
    };
    window.addEventListener("pagehide", () => {
      this.stopInput();
      this.disable();
    });
  }
}
