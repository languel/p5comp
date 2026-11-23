import katex from "katex";
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import { Marked } from "marked";
import DOMPurify from "dompurify";
import { render as renderPele } from "pele";

const mathDelimiters = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];

const PELE_DARK_VARS = {
  "--pele-bg": "transparent",
  "--pele-fg": "#e4e7e4",
  "--pele-muted": "#9aa29f",
  "--pele-line": "#8e9894",
  "--pele-surface": "#252726",
  "--pele-surface-alt": "#2f3230",
  "--pele-border": "#444a47",
  "--pele-accent": "#5ca688",
  "--pele-font": "system-ui, -apple-system, sans-serif",
  "--pele-radius": "6px",
};

const PELE_LIGHT_VARS = {
  "--pele-bg": "transparent",
  "--pele-fg": "#181a19",
  "--pele-muted": "#5d6562",
  "--pele-line": "#424a47",
  "--pele-surface": "#f3f4f2",
  "--pele-surface-alt": "#e7e9e6",
  "--pele-border": "#c5cbc8",
  "--pele-accent": "#2d6f5c",
  "--pele-font": "system-ui, -apple-system, sans-serif",
  "--pele-radius": "6px",
};

/**
 * Render a Mermaid diagram to SVG via Obsidian's Pele engine.
 * When `standalone` is true, inlines theme CSS variables so the SVG renders cleanly
 * inside <img> tags, canvas assets, or exported files.
 */
export function renderDiagramSVG(code, { standalone = false, theme } = {}) {
  const source = String(code || "").trim();
  if (!source) throw new Error("Diagram source is empty.");
  const out = renderPele(source);
  if (!standalone) return out;
  const dark =
    theme === "dark" ||
    (theme !== "light" &&
      typeof document !== "undefined" &&
      document.documentElement?.dataset?.theme !== "light");
  const vars = dark ? PELE_DARK_VARS : PELE_LIGHT_VARS;
  const css = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  const svg = out.svg.replace(
    /<svg\b([^>]*)>/,
    `<svg$1><style>:root,svg{${css};color:${vars["--pele-fg"]};}</style>`,
  );
  return { ...out, svg };
}

function escapeAttr(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Protect math from Markdown emphasis/escape parsing; code spans/fences stay code.
const lessonMarkdown = new Marked({
  gfm: true,
  breaks: true,
  extensions: [
    {
      name: "lessonMath",
      level: "inline",
      start(source) {
        const offsets = mathDelimiters
          .map(({ left }) => source.indexOf(left))
          .filter((index) => index >= 0);
        return offsets.length ? Math.min(...offsets) : undefined;
      },
      tokenizer(source) {
        for (const { left, right } of mathDelimiters) {
          if (!source.startsWith(left)) continue;
          const end = source.indexOf(right, left.length);
          if (end > left.length)
            return {
              type: "lessonMath",
              raw: source.slice(0, end + right.length),
            };
        }
      },
      renderer(token) {
        return token.raw
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      },
    },
  ],
});

/** Upgrade Obsidian-style callouts (> [!note] Title) inside a container. */
function upgradeCallouts(container) {
  for (const bq of container.querySelectorAll("blockquote")) {
    const firstP = bq.querySelector(":scope > p:first-child");
    if (!firstP) continue;
    const match = /^\s*\[!([a-zA-Z0-9_-]+)\][+-]?(?:\s+([^\n]*))?/.exec(firstP.innerHTML);
    if (!match) continue;
    const kind = match[1].toLowerCase();
    const title = (match[2] || "").replace(/<br\s*\/?>.*$/i, "").trim() || kind;
    const rest = firstP.innerHTML.slice(match[0].length).replace(/^\s*<br\s*\/?>/i, "").trim();
    bq.classList.add("obs-callout", `obs-callout-${kind}`);
    const head = document.createElement("div");
    head.className = "obs-callout-title";
    head.textContent = title[0].toUpperCase() + title.slice(1);
    if (rest) {
      firstP.innerHTML = rest;
      bq.prepend(head);
    } else {
      firstP.replaceWith(head);
    }
  }
}

/** Upgrade ```mermaid / ```pele fenced blocks inside a container using Pele SVG. */
function upgradeDiagrams(container) {
  const blocks = container.querySelectorAll(
    'pre > code.language-mermaid, pre > code.language-pele',
  );
  for (const codeEl of blocks) {
    const pre = codeEl.parentElement;
    const source = codeEl.textContent || "";
    if (!source.trim()) continue;
    try {
      const { svg, type } = renderDiagramSVG(source);
      const wrap = document.createElement("div");
      wrap.className = "pele-diagram";
      wrap.dataset.mermaid = source;
      wrap.dataset.diagramType = type || "diagram";
      wrap.innerHTML = svg;
      pre.replaceWith(wrap);
    } catch {
      // Keep the raw code block cleanly if diagram syntax is incomplete (e.g. while streaming).
      pre.classList.add("pele-pending");
    }
  }
}

// Same GFM + KaTeX + Obsidian callouts + Pele Mermaid format across Notes, Help, and Chat.
export function lessonHTML(source, format = "markdown") {
  if (format === "latex")
    return katex.renderToString(source || "", {
      displayMode: true,
      throwOnError: false,
      trust: false,
      strict: "ignore",
    });
  const clean = DOMPurify.sanitize(
    format === "html" ? source : lessonMarkdown.parse(source || ""),
    {
      FORBID_TAGS: [
        "style",
        "form",
        "iframe",
        "object",
        "embed",
        "input",
        "button",
      ],
      FORBID_ATTR: ["style"],
    },
  );
  const container = document.createElement("div");
  container.innerHTML = clean;
  if (format !== "html") {
    upgradeCallouts(container);
    upgradeDiagrams(container);
  }
  renderMathInElement(container, {
    delimiters: mathDelimiters,
    throwOnError: false,
    trust: false,
    strict: "ignore",
  });
  return container.innerHTML;
}

export { escapeAttr };
