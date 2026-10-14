import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
const key = "p5comp.editor.preferences";
export function editorPreferences() {
  try {
    return {
      theme: "subdued",
      fontSize: 12,
      ...JSON.parse(localStorage.getItem(key) || "{}"),
    };
  } catch {
    return { theme: "subdued", fontSize: 12 };
  }
}
export function setEditorPreferences(next) {
  const prefs = { ...editorPreferences(), ...next };
  prefs.fontSize = Math.max(8, Math.min(32, Number(prefs.fontSize) || 12));
  localStorage.setItem(key, JSON.stringify(prefs));
  document.dispatchEvent(
    new CustomEvent("p5comp:editor-settings", { detail: prefs }),
  );
  return prefs;
}
export function editorTheme(prefs) {
  const dark =
      prefs.theme === "subdued"
        ? document.documentElement.dataset.theme === "dark"
        : prefs.theme.endsWith("dark"),
    github = prefs.theme.startsWith("github");
  const p = github
    ? dark
      ? {
          bg: "#0d1117",
          text: "#c9d1d9",
          quiet: "#8b949e",
          line: "#161b22",
          selection: "#264f78",
          keyword: "#ff7b72",
          string: "#a5d6ff",
          number: "#79c0ff",
          fn: "#d2a8ff",
        }
      : {
          bg: "#ffffff",
          text: "#24292f",
          quiet: "#6e7781",
          line: "#f6f8fa",
          selection: "#c8e1ff",
          keyword: "#cf222e",
          string: "#0a3069",
          number: "#0550ae",
          fn: "#8250df",
        }
    : dark
      ? {
          bg: "#242426",
          text: "#d8d8da",
          quiet: "#909094",
          line: "#303033",
          selection: "#414145",
          keyword: "#babac4",
          string: "#b1b8a0",
          number: "#b9aea0",
          fn: "#aabec7",
        }
      : {
          bg: "#fafafa",
          text: "#464b49",
          quiet: "#89918b",
          line: "#f0f2ef",
          selection: "#dce4de",
          keyword: "#5d7065",
          string: "#6d775e",
          number: "#877466",
          fn: "#657c86",
        };
  return [
    EditorView.theme(
      {
        "&": { backgroundColor: p.bg, color: p.text },
        ".cm-scroller": {
          fontFamily: "ui-monospace, Menlo, monospace",
          lineHeight: "1.5",
        },
        ".cm-content": { caretColor: p.text },
        ".cm-gutters": {
          backgroundColor: p.bg,
          color: p.quiet,
          border: "none",
        },
        ".cm-activeLine,.cm-activeLineGutter": { backgroundColor: p.line },
        ".cm-cursor": { borderLeftColor: p.text },
        "&.cm-focused .cm-selectionBackground,.cm-selectionBackground,::selection":
          { backgroundColor: p.selection + " !important" },
        ".cm-tooltip,.cm-panels": {
          backgroundColor: p.bg,
          color: p.text,
          borderColor: p.line,
        },
        ".cm-tooltip-autocomplete li[aria-selected]": {
          backgroundColor: p.selection,
          color: p.text,
        },
      },
      { dark },
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        {
          tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.typeName],
          color: p.keyword,
        },
        { tag: [t.string, t.special(t.string)], color: p.string },
        { tag: [t.number, t.bool, t.null], color: p.number },
        {
          tag: [t.function(t.variableName), t.function(t.propertyName)],
          color: p.fn,
        },
        { tag: t.comment, color: p.quiet, fontStyle: "italic" },
        {
          tag: [
            t.operator,
            t.punctuation,
            t.bracket,
            t.variableName,
            t.propertyName,
          ],
          color: p.text,
        },
      ]),
    ),
  ];
}
