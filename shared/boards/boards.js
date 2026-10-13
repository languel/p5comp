export const boards = Object.freeze({
  uno: Object.freeze({
    id: "uno",
    label: "Arduino Uno R3",
    fqbn: "arduino:avr:uno",
    uploadProtocol: "stk500v1",
    uploadBaudRate: 115200,
    runtimeBaudRate: 9600,
    digitalPins: 14,
    analogPins: 6,
    flashPageSize: 128
  }),
  mega: Object.freeze({
    id: "mega",
    label: "Arduino Mega 2560",
    fqbn: "arduino:avr:mega",
    uploadProtocol: "stk500v2",
    uploadBaudRate: 115200,
    runtimeBaudRate: 9600,
    digitalPins: 54,
    analogPins: 16,
    flashPageSize: 256
  })
});

export function boardForId(id) {
  return boards[id] ?? boards.uno;
}
