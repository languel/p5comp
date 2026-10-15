import { marked } from "marked";
import DOMPurify from "dompurify";
// Same GFM + raw HTML lesson format as Artist–Model Studio; no executable embeds.
export function lessonHTML(source, format = "markdown") {
  return DOMPurify.sanitize(
    format === "html" ? source : marked.parse(source || ""),
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
}
