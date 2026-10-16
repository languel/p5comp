import { AnalogSolver } from "./analogSolver.js";
import { instrumentStates } from "./instruments.js";
export class AnalogRuntime {
  constructor(topology, controls = {}) {
    this.topology = topology;
    this.controls = controls;
    this.solver = new AnalogSolver(topology);
    this.seconds = 0;
  }
  advance(cycles) {
    this.seconds += cycles / 16000000;
    this.frames = this.solver.advance(this.seconds, [], this.controls);
  }
  setControls(c) {
    this.controls = c;
  }
  write() {}
  snapshot() {
    return {
      seconds: this.seconds,
      cycles: this.seconds * 16000000,
      led: false,
      baudRate: 9600,
      analogFrames: this.frames || [],
      parts: {
        ...this.solver.states(),
        ...instrumentStates(
          this.topology,
          [],
          this.controls,
          {},
          [],
          this.solver.volts,
        ),
      },
    };
  }
}
