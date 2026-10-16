# Electronics foundations

The Elements menu now includes a battery/DC supply, diode, inductor, NPN, PNP, 555 timer, ideal op-amp, comparator, signal generator, oscilloscope and speaker. The existing capacitor now stores charge. They work in analog-only projects without Arduino firmware. GND symbols share the circuit reference; VCC symbols supply the existing 5V reference, independently of a battery. A battery needs its negative terminal wired to a reference if you want meaningful ground-referenced readings.

## Classroom models and limits

The analog solver uses backward Euler at 12,000 samples per simulation second and at most 64 nodes. Capacitors use a charge-history companion model, inductors use current history, and resistor/pot/switch networks are included. Diodes use a configurable forward drop with 5Ω on-resistance and tiny reverse leakage. NPN/PNP use a simplified beta/base-junction model with saturation limiting. The 555 uses supply-relative one-third/two-thirds comparators, reset, a latch, control-voltage divider and discharge switch. It is a behavioral timer, not a transistor-level NE555. The ideal op-amp has configurable gain, smooth supply clipping, no input loading and no bandwidth/current limit; comparator output saturates to its supply rails. These are teaching models, not device-specific SPICE or RF models; nonlinear convergence can be approximate and warns in Properties.

Use component values such as `10uF`, `100nF`, `10mH`, `1H`. Resistors retain existing ohms/k notation. The generator supports `sine`, `square`, `triangle`, `saw`, `noise`, `pulse` (square with adjustable duty), and `am`. Set amplitude (peak volts), offset, frequency, duty (0–1), and AM modulation frequency/depth in Properties. Frequency is limited to 1kHz. This limit and the 12kHz sampling rate make ordinary audio/slow teaching signals possible, not broadcast radio frequencies.

The oscilloscope has CH1/CH2, GND, a rising-edge CH1 trigger, `triggerMode` auto/normal, `triggerLevel`, `timeWindow` in seconds, `voltsPerDiv`, and `verticalOffset` (volts at screen center). Normal trigger waits for a crossing. Auto free-runs if no crossing is available. Plotter remains the slower trend instrument; the scope shows internal analog samples, rather than just display refresh frames.

The AVR integration reconstructs recorded digital transitions for analog stepping. Its current rolling transition buffer and 12kHz solver limit high-frequency PWM detail; use the signal generator for reproducible filtering demonstrations. Analog solver nodes currently feed instruments, speaker audio and LED/resistor readings; arbitrary analog feedback into AVR ADC/digital input is not yet a general mixed-signal solver. Existing potentiometer/photo/sound input models continue to drive AVR inputs through their established paths.

## Sound

In Settings → Audio input and output, explicitly enable speaker audio. Each speaker's voltage is converted to a limited mono Web Audio signal with DC removed; volume is an attribute, and mute stops queued sound. The physical speaker model is a resistor (8Ω default), so it loads a circuit. High-impedance **audio monitor** examples intentionally use a larger resistance; these do not claim a passive detector could directly drive a real 8Ω speaker.

Input choices are test tone, microphone (explicit permission), and a local audio file (looping). Start/stop controls acquire/release the source. RMS loudness feeds all sound sensors, whose existing analog-level and threshold models respond. This is an envelope input, not sample-by-sample microphone voltage injection. Input and output are local to the browser, and audio is not enabled on page load. Live audio/media acquisition is not replayed by agent automation.

## Lessons

Examples → Electronics foundations contains:

- Capacitor: smooth a square wave, with raw/filtered traces.
- Diode: rectify and smooth a sine wave.
- NPN / PNP transistor switching.
- 555 astable oscillator: output and timing capacitor, with an audio monitor.
- LC resonance: sweep frequency around 159Hz.
- Ideal op-amp buffer and comparator: compare a sine wave with a threshold output.
- AM envelope detector: low-frequency AM source, diode, capacitor and audio monitor. This demonstrates detection, not an antenna or a complete RF receiver.

Change values in Properties and restart to reset stored energy. Analog history and live streams are runtime state; the project stores wiring, source settings and component attributes, not capacitor charge or microphone recordings.

For implementing a new element, see Help → Make your own element and `docs/diy-elements.md`.
