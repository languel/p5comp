// Directions are from the board's perspective, matching its printed TX/RX labels.
export function createSerialActivity({duration = 90, schedule = setTimeout, cancel = clearTimeout} = {}) {
  const active = new Map();
  function pulse(board, direction) {
    if (!board || !['TX', 'RX'].includes(direction)) return;
    let timers = active.get(board);
    if (!timers) active.set(board, timers = {});
    cancel(timers[direction]);
    board['led' + direction] = true;
    timers[direction] = schedule(() => {
      board['led' + direction] = false;
      delete timers[direction];
      if (!Object.keys(timers).length) active.delete(board);
    }, duration);
  }
  function clear() {
    for (const [board, timers] of active) {
      for (const direction of Object.keys(timers)) cancel(timers[direction]);
      board.ledTX = board.ledRX = false;
    }
    active.clear();
  }
  return {pulse, clear};
}
