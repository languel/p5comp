import { basePath } from "../basePath.js";
const STORAGE_KEY = "physical-p5.theme";

function loadTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch (error) {
    console.warn("Could not read theme preference:", error);
    return "light";
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    console.warn("Could not save theme preference:", error);
  }
}

export function initializeTheme() {
  document.querySelectorAll('a[href^="/"]').forEach((a) => {
    const href = a.getAttribute("href");
    a.href = basePath(href === "/ide" ? "miniide.html" : href);
  });
  const toggle = document.querySelector("#themeToggle");
  if (!toggle) throw new Error("Theme toggle is missing from the page.");

  const themeColor = document.querySelector('meta[name="theme-color"]');
  let theme = loadTheme();

  function applyTheme(nextTheme, persist = false) {
    theme = nextTheme;
    document.documentElement.dataset.theme = theme;
    toggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
    toggle.setAttribute(
      "aria-label",
      `Switch to ${theme === "dark" ? "light" : "dark"} mode`,
    );
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
    if (themeColor)
      themeColor.content = theme === "dark" ? "#1c1c1e" : "#fafafa";
    if (persist) saveTheme(theme);
    document.dispatchEvent(
      new CustomEvent("physical-p5:themechange", { detail: theme }),
    );
  }

  toggle.addEventListener("click", () => {
    applyTheme(theme === "dark" ? "light" : "dark", true);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY)
      applyTheme(event.newValue === "dark" ? "dark" : "light");
  });
  applyTheme(theme);

  return {
    get current() {
      return theme;
    },
  };
}
