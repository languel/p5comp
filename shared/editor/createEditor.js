import { completeFromList } from "@codemirror/autocomplete";
import { basicSetup, EditorView } from "codemirror";
import { cppLanguage, cpp } from "@codemirror/lang-cpp";
import { javascriptLanguage, javascript } from "@codemirror/lang-javascript";
import { Compartment, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { Prec } from "@codemirror/state";
import {
  editorPreferences,
  setEditorPreferences,
  editorTheme,
} from "./editorPreferences.js";
import { formatCode } from "./formatCode.js";

export function createEditor({
  parent,
  value,
  language,
  onChange,
  onRun,
  onUpload,
}) {
  const theme = new Compartment();
  const shortcuts = [
    indentWithTab,
    {
      key: "Mod-Enter",
      run: () => {
        onRun?.();
        return true;
      },
    },
    {
      key: "Mod-Shift-Enter",
      run: () => {
        onUpload?.();
        return true;
      },
    },
  ];
  const state = EditorState.create({
    doc: value,
    extensions: [
      basicSetup,
      language === "cpp"
        ? cpp()
        : language === "html"
          ? html()
          : language === "css"
            ? css()
            : javascript(),
      language === "cpp"
        ? cppLanguageData
        : language === "javascript"
          ? p5LanguageData
          : [],
      theme.of(editorTheme(editorPreferences())),
      Prec.highest(keymap.of(shortcuts)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange?.(update.state.doc.toString());
      }),
    ],
  });
  const editor = new EditorView({ state, parent });
  const apply = () => {
    const prefs = editorPreferences();
    editor.dom.style.fontSize = prefs.fontSize + "px";
    editor.dispatch({ effects: theme.reconfigure(editorTheme(prefs)) });
  };
  editor.tidy = async () => {
    const source = editor.state.doc.toString();
    try {
      const formatted = await formatCode(source, language);
      if (editor.state.doc.toString() !== source) return;
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: formatted },
      });
    } catch (error) {
      document.dispatchEvent(
        new CustomEvent("p5comp:editor-error", { detail: error.message }),
      );
    }
  };
  editor.dom.addEventListener(
    "keydown",
    (e) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        e.stopPropagation();
        editor.tidy();
      } else if (
        ["Equal", "Minus"].includes(e.code) ||
        ["+", "-", "_", "="].includes(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
        const up = e.code === "Equal" || ["+", "="].includes(e.key);
        setEditorPreferences({
          fontSize: editorPreferences().fontSize + (up ? 1 : -1),
        });
      }
    },
    true,
  );
  document.addEventListener("physical-p5:themechange", apply);
  document.addEventListener("p5comp:editor-settings", apply);
  const destroy = editor.destroy.bind(editor);
  editor.destroy = () => {
    document.removeEventListener("physical-p5:themechange", apply);
    document.removeEventListener("p5comp:editor-settings", apply);
    destroy();
  };
  apply();
  return editor;
}

const arduinoWords =
  "setup loop pinMode digitalWrite digitalRead analogRead analogWrite delay delayMicroseconds millis micros pulseIn tone noTone constrain map random attachInterrupt detachInterrupt Serial INPUT INPUT_PULLUP OUTPUT HIGH LOW LED_BUILTIN A0 A1 A2 A3 A4 A5".split(
    " ",
  );
const p5Words =
  "setup draw preload createCanvas resizeCanvas background fill noFill stroke noStroke strokeWeight circle ellipse rect line triangle point text textSize textFont image loadImage loadFont loadSound translate rotate scale push pop beginShape vertex endShape createVector color lerp map constrain random noise sin cos radians frameRate mouseX mouseY width height keyPressed mousePressed mouseDragged createButton createSlider navigator serial".split(
    " ",
  );
const cppLanguageData = cppLanguage.data.of({
  autocomplete: completeFromList(
    arduinoWords.map((label) => ({
      label,
      type: /^[A-Z]/.test(label) ? "constant" : "function",
    })),
  ),
});
const p5LanguageData = javascriptLanguage.data.of({
  autocomplete: completeFromList(
    p5Words.map((label) => ({ label, type: "function" })),
  ),
});
