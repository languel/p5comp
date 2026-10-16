import katex from "katex";
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import { Marked } from "marked";
import DOMPurify from "dompurify";
const mathDelimiters = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];
// Protect math from Markdown emphasis/escape parsing; code spans/fences stay code.
const lessonMarkdown = new Marked({
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
// Same GFM + raw HTML lesson format as Artist–Model Studio; no executable embeds.
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
  renderMathInElement(container, {
    delimiters: mathDelimiters,
    throwOnError: false,
    trust: false,
    strict: "ignore",
  });
  return container.innerHTML;
}
