// Fixed demo colors keep the teaching sketches independent of the host UI theme.
export function fixedDemoColors(source) {
  return source
    .replace(/\s*const dark = window\.theme === ["']dark["'];?/g, '')
    .replace(/(?:window\.theme\s*===\s*["']dark["']|\bdark)\s*\?\s*["']#[\da-f]+["']\s*:\s*(["']#[\da-f]+["'])/gi, '$1')
    .replace(/var\(--ui-hover\)/g, '#e8e8eb')
    .replace(/var\(--ui-text\)/g, '#343436');
}
