// ATmega2560 register/vector configuration from avr-libc iomxx0_1.h;
// Arduino pin mapping from Arduino AVR core variants/mega/pins_arduino.h.
import * as avr from "avr8js";
export const boardKind = (type) =>
  type === "wokwi-arduino-mega"
    ? "mega"
    : type === "wokwi-arduino-nano"
      ? "nano"
      : "uno";
export const boardLayout = (kind) => ({
  analogBase: kind === "mega" ? 54 : 14,
  digitalCount: kind === "mega" ? 70 : 20,
  analogCount: kind === "mega" ? 16 : kind === "nano" ? 8 : 6,
  flash: kind === "mega" ? 262144 : 32768,
});
export const megaPins =
  "E0 E1 E4 E5 G5 E3 H3 H4 H5 H6 B4 B5 B6 B7 J1 J0 H1 H0 D3 D2 D1 D0 A0 A1 A2 A3 A4 A5 A6 A7 C7 C6 C5 C4 C3 C2 C1 C0 D7 G2 G1 G0 L7 L6 L5 L4 L3 L2 L1 L0 B3 B2 B1 B0 F0 F1 F2 F3 F4 F5 F6 F7 K0 K1 K2 K3 K4 K5 K6 K7"
    .split(" ")
    .map((p) => [p[0], Number(p[1])]);
export function avrConfig(kind) {
  if (kind !== "mega")
    return {
      ports: { B: avr.portBConfig, C: avr.portCConfig, D: avr.portDConfig },
      timers: [avr.timer0Config, avr.timer1Config, avr.timer2Config],
      adc: avr.adcConfig,
      uarts: [avr.usart0Config],
    };
  const ports = Object.fromEntries(
    "ABCDEFGHJKL".split("").map((p) => [
      p,
      {
        ...avr["port" + p + "Config"],
        pinChange: undefined,
        externalInterrupts: [],
      },
    ]),
  );
  const interrupt = (n) => ({
    EICR: n < 4 ? 0x69 : 0x6a,
    EIMSK: 0x3d,
    EIFR: 0x3c,
    index: n,
    iscOffset: (n % 4) * 2,
    interrupt: (n + 1) * 2,
  });
  ports.D.externalInterrupts = [0, 1, 2, 3].map(interrupt);
  ports.E.externalInterrupts = [
    null,
    null,
    null,
    null,
    ...[4, 5, 6, 7].map(interrupt),
  ];
  const pc = (n) => ({
    PCIE: n,
    PCICR: 0x68,
    PCIFR: 0x3b,
    PCMSK: 0x6b + n,
    pinChangeInterrupt: (9 + n) * 2,
    mask: 255,
    offset: 0,
  });
  ports.B.pinChange = pc(0);
  ports.E.pinChange = { ...pc(1), mask: 1, offset: 0 };
  ports.J.pinChange = { ...pc(1), mask: 0x7f, offset: 1 };
  ports.K.pinChange = pc(2);
  const t0 = {
    ...avr.timer0Config,
    compAInterrupt: 42,
    compBInterrupt: 44,
    ovfInterrupt: 46,
    compPortA: ports.B.PORT,
    compPinA: 7,
    compPortB: ports.G.PORT,
    compPinB: 5,
    externalClockPort: ports.D.PORT,
    externalClockPin: 7,
  };
  const t1 = {
    ...avr.timer1Config,
    captureInterrupt: 32,
    compAInterrupt: 34,
    compBInterrupt: 36,
    compCInterrupt: 38,
    ovfInterrupt: 40,
    OCRC: 0x8c,
    OCFC: 8,
    OCIEC: 8,
    compPortA: ports.B.PORT,
    compPinA: 5,
    compPortB: ports.B.PORT,
    compPinB: 6,
    compPortC: ports.B.PORT,
    compPinC: 7,
    externalClockPort: ports.D.PORT,
    externalClockPin: 6,
  };
  const t2 = {
    ...avr.timer2Config,
    compAInterrupt: 26,
    compBInterrupt: 28,
    ovfInterrupt: 30,
    compPortA: ports.B.PORT,
    compPinA: 4,
    compPortB: ports.H.PORT,
    compPinB: 6,
  };
  const extra = (
    n,
    base,
    tifr,
    timsk,
    vector,
    port,
    bits,
    extPort,
    extPin,
  ) => ({
    ...t1,
    TCCRA: base,
    TCCRB: base + 1,
    TCCRC: base + 2,
    TCNT: base + 4,
    ICR: base + 6,
    OCRA: base + 8,
    OCRB: base + 10,
    OCRC: base + 12,
    TIFR: tifr,
    TIMSK: timsk,
    captureInterrupt: vector * 2,
    compAInterrupt: (vector + 1) * 2,
    compBInterrupt: (vector + 2) * 2,
    compCInterrupt: (vector + 3) * 2,
    ovfInterrupt: (vector + 4) * 2,
    compPortA: ports[port].PORT,
    compPortB: ports[port].PORT,
    compPortC: ports[port].PORT,
    compPinA: bits[0],
    compPinB: bits[1],
    compPinC: bits[2],
    externalClockPort: ports[extPort].PORT,
    externalClockPin: extPin,
  });
  const adc = {
    ...avr.adcConfig,
    adcInterrupt: 58,
    numChannels: 16,
    adcReferences: [
      avr.ADCReference.AREF,
      avr.ADCReference.AVCC,
      avr.ADCReference.Internal1V1,
      avr.ADCReference.Internal2V56,
    ],
    muxInputMask: 0x3f,
    muxChannels: Object.fromEntries([
      ...Array.from({ length: 8 }, (_, i) => [
        i,
        { type: avr.ADCMuxInputType.SingleEnded, channel: i },
      ]),
      ...Array.from({ length: 8 }, (_, i) => [
        32 + i,
        { type: avr.ADCMuxInputType.SingleEnded, channel: 8 + i },
      ]),
      [30, { type: avr.ADCMuxInputType.Constant, voltage: 1.1 }],
      [31, { type: avr.ADCMuxInputType.Constant, voltage: 0 }],
    ]),
  };
  const uart = (base, vec) => ({
    ...avr.usart0Config,
    UCSRA: base,
    UCSRB: base + 1,
    UCSRC: base + 2,
    UBRRL: base + 4,
    UBRRH: base + 5,
    UDR: base + 6,
    rxCompleteInterrupt: vec * 2,
    dataRegisterEmptyInterrupt: (vec + 1) * 2,
    txCompleteInterrupt: (vec + 2) * 2,
  });
  return {
    ports,
    timers: [
      t0,
      t1,
      t2,
      extra(3, 0x90, 0x38, 0x71, 31, "E", [3, 4, 5], "E", 6),
      extra(4, 0xa0, 0x39, 0x72, 41, "H", [3, 4, 5], "H", 7),
      extra(5, 0x120, 0x3a, 0x73, 46, "L", [3, 4, 5], "L", 2),
    ],
    adc,
    uarts: [uart(0xc0, 25), uart(0xc8, 36), uart(0xd0, 51), uart(0x130, 54)],
  };
}
