import { icon } from "./uiIcons.js";
// Display controls never pause the actual serial connection or the p5 sketch.
export class SerialMonitor {
  constructor(log, { pause, latest, feed }) {
    Object.assign(this, { log, pause, latest, feed });
    this.rows = [];
    this.paused = false;
    this.mode = 'latest';
    this.rx = this.tx = '';
    pause.onclick = () => {
      this.paused = !this.paused;
      if (!this.paused) this.render();
      this.update();
    };
    for (const [mode, button] of [['latest', latest], ['feed', feed]]) {
      button.onclick = () => {
        this.mode = mode;
        // Switching views while paused uses the frozen snapshot.
        this.render(this.paused ? this.frozen : undefined);
        this.update();
      };
    }
    this.latest.replaceChildren?.(iconFor(this.latest, 'serialLatest'));
    this.feed.replaceChildren?.(iconFor(this.feed, 'serialFollow'));
    this.render();
    this.update();
  }
  append(line) {
    line = String(line);
    this.rows.push(line);
    if (this.rows.length > 500) this.rows.shift();
    if (line.startsWith('← ')) this.rx = line.slice(2);
    if (line.startsWith('→ ')) this.tx = line.slice(2);
    if (!this.paused) this.render();
  }
  render(snapshot) {
    const state = snapshot || { rows: [...this.rows], rx: this.rx, tx: this.tx };
    this.frozen = state;
    this.log.textContent = this.mode === 'latest'
      ? `⇥ RX: ${state.rx}\n⇤ TX: ${state.tx}`
      : state.rows.join('\n');
    this.log.scrollTop = this.mode === 'feed' ? this.log.scrollHeight : 0;
  }
  clear() {
    this.rows = []; this.rx = this.tx = '';
    this.paused = false;
    this.render(); this.update();
  }
  update() {
    const kind = this.paused ? 'play' : 'pause';
    if (this.pause.querySelector?.('.ui-icon')?.dataset.icon !== kind)
      this.pause.replaceChildren?.(iconFor(this.pause, kind));
    this.pause.setAttribute('aria-pressed', String(this.paused));
    this.pause.title = this.paused ? 'Resume display' : 'Pause display · serial communication continues';
    this.pause.setAttribute('aria-label', this.paused ? 'Resume display' : 'Pause display');
    for (const [mode, button] of [['latest', this.latest], ['feed', this.feed]]) {
      button.setAttribute('aria-pressed', String(this.mode === mode));
    }
  }
}

function iconFor(button, kind) {
  return button.ownerDocument ? icon(kind) : null;
}
