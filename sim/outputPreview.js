export function outputPreview(part) {
  if (part.type === 'wokwi-led') return {lit:true,brightness:1};
  if (part.type === 'wokwi-rgb-led') return {ledRed:1,ledGreen:1,ledBlue:1};
  if (part.type === 'wokwi-servo') return {angle:90};
  if (part.type === 'wokwi-relay-module') return {energized:true};
  return null;
}
export function outputReading(state = {}) {
  if (state.ledRed != null) return `RGB ${[state.ledRed,state.ledGreen,state.ledBlue].map(v=>Math.round(v*100)).join('/')}%`;
  if (state.brightness != null) return `${Math.round(state.brightness*100)}%`;
  if (state.angle != null) return `${Math.round(state.angle)}°`;
  if (state.energized != null) return state.energized ? 'On' : 'Off';
  return '—';
}
export function paintOutputPreview(element,state) {
  if (!element) return;
  if (state.lit != null) element.value=state.lit;
  for(const prop of ['brightness','ledRed','ledGreen','ledBlue','angle','energized'])
    if(state[prop]!=null) element[prop]=state[prop];
}
