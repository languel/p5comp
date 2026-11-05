// Servers sometimes return an HTML fallback (even with HTTP 200) for missing assets.
// Never expose that document or a raw JSON parser error as the user-facing message.
export async function responseJSON(
  response,
  label = "File",
  { allowHTTPError = false } = {},
) {
  const text = await response.text();
  if (!response.ok && !allowHTTPError)
    throw new Error(
      `${label} could not load (HTTP ${response.status}). Try again; if it persists, reload the app.`,
    );
  if (!text.trim())
    throw new Error(`${label} is empty. Try again or reload the app.`);
  if (
    /^\s*</.test(text) ||
    /text\/html/i.test(response.headers?.get("content-type") || "")
  )
    throw new Error(
      `${label} returned a web page instead of JSON. The file or service may be missing. Reload the app and try again.`,
    );
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${label} contains invalid JSON. Reload the app or choose another file.`,
    );
  }
}
export async function fetchJSON(url, label, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  } catch {
    throw new Error(
      `${label} could not be reached. Check your connection and try again.`,
    );
  }
  return responseJSON(response, label);
}
