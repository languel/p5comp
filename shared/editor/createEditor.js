import { completeFromList } from "@codemirror/autocomplete";
import { basicSetup, EditorView } from "codemirror";
import { cppLanguage, cpp } from "@codemirror/lang-cpp";
import { javascriptLanguage, javascript } from "@codemirror/lang-javascript";
import { Compartment, EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";

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
      language === "cpp" ? cpp() : javascript(),
      language === "cpp" ? cppLanguageData : p5LanguageData,
      theme.of(
        document.documentElement.dataset.theme === "dark" ? oneDark : [],
      ),
      keymap.of(shortcuts),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange?.(update.state.doc.toString());
      }),
    ],
  });
  const editor = new EditorView({ state, parent });
  document.addEventListener("physical-p5:themechange", (event) => {
    editor.dispatch({
      effects: theme.reconfigure(event.detail === "dark" ? oneDark : []),
    });
  });
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
