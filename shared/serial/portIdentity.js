export function matchingPortName(info, ports) {
  const matches = ports.filter(({port}) =>
    info.usbVendorId != null && info.usbProductId != null &&
    Number(port?.properties?.vid) === info.usbVendorId &&
    Number(port?.properties?.pid) === info.usbProductId);
  // Web Serial hides serial numbers: never guess between identical adapters.
  if (matches.length !== 1) return null;
  return matches[0].port.address?.replace(/^.*\//, '').replace(/^(cu|tty)\./, '') || null;
}
