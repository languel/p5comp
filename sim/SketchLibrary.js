import { icon } from "./uiIcons.js";
import { basePath } from "../shared/basePath.js";
const KEY = "p5comp.sketchLibrary";
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};
const download = (name, value) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export function installSketchLibraries(wb) {
  for (const kind of ["arduino", "p5"]) {
    const button = document.createElement("button");
    button.className = "ui-icon-button";
    button.append(icon("file"));
    button.title = `${kind === "p5" ? "p5" : "Arduino"} sketch library`;
    button.setAttribute("aria-label", button.title);
    wb[kind + "Pane"].querySelector(".section-bar").append(button);
    button.onclick = async () => {
      const dialog = document.createElement("dialog");
      dialog.className = "sketch-library";
      const heading = document.createElement("header");
      heading.textContent = button.title;
      const close = document.createElement("button");
      close.textContent = "×";
      close.onclick = () => dialog.close();
      heading.append(close);
      dialog.append(heading);
      const search = document.createElement("input");
      search.placeholder = "Search sketches…";
      search.setAttribute("aria-label", "Search sketches");
      dialog.append(search);
      const controls = document.createElement("div");
      dialog.append(controls);
      const items = document.createElement("div");
      dialog.append(items);
      const owned = () => load().filter((x) => x.kind === kind);
      const current = () => {
        const project = wb.ctx.project();
        return {
          version: 1,
          kind,
          name: wb.name,
          source: kind === "p5" ? wb.p5Source() : project.arduino,
          files: Object.fromEntries(
            Object.entries(wb.files).filter(([name]) =>
              kind === "arduino"
                ? /\.(ino|h|hpp|c|cpp)$/.test(name)
                : /\.(js|html|css)$/.test(name),
            ),
          ),
          assets: kind === "p5" ? wb.assets : {},
        };
      };
      const apply = (item) => {
        const files = item.files || {};
        for (const name of Object.keys(wb.files))
          if (
            kind === "arduino"
              ? /\.(ino|h|hpp|c|cpp)$/.test(name)
              : /\.(js|html|css)$/.test(name)
          )
            delete wb.files[name];
        Object.assign(wb.files, files);
        const main =
          kind === "p5"
            ? Object.keys(files).find((n) => n === "sketch.js") ||
              Object.keys(files).find((n) => n.endsWith(".js")) ||
              "sketch.js"
            : Object.keys(files).find((n) => n.endsWith(".ino")) ||
              "sketch.ino";
        wb[kind === "p5" ? "p5Name" : "arduinoName"] = main;
        wb.ctx.setCode(
          wb.ctx[kind === "p5" ? "p5Editor" : "arduinoEditor"],
          item.source || files[main] || "",
        );
        if (kind === "p5") wb.assets = { ...wb.assets, ...item.assets };
        wb.renderFiles();
        wb.renderAssets();
        wb.ctx.persist();
        dialog.close();
      };
      const action = (text, fn, parent = controls) => {
        const b = document.createElement("button");
        b.textContent = text;
        b.onclick = fn;
        parent.append(b);
        return b;
      };
      const saveName = document.createElement("input");
      saveName.value = wb.name;
      saveName.setAttribute("aria-label", "Saved sketch name");
      controls.append(saveName);
      action("Save current", () => {
        const name = saveName.value.trim();
        if (!name) return;
        const all = load();
        all.push({ ...current(), name, id: crypto.randomUUID() });
        localStorage.setItem(KEY, JSON.stringify(all));
        render();
      });
      action("Export current", () =>
        download(`${wb.name}.${kind}.json`, current()),
      );
      action("Import…", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async () => {
          try {
            const item = JSON.parse(await input.files[0].text());
            if (item.kind !== kind || typeof item.source !== "string")
              throw Error("Choose a matching sketch export.");
            const all = load();
            all.push({ ...item, id: crypto.randomUUID() });
            localStorage.setItem(KEY, JSON.stringify(all));
            render();
          } catch (e) {
            wb.ctx.notice(e.message);
          }
        };
        input.click();
      });
      let bundled = [];
      const render = () => {
        items.replaceChildren();
        for (const [label, entries] of [
          ["Saved", owned()],
          ["Examples", bundled],
        ]) {
          const h = document.createElement("h4");
          h.textContent = label;
          items.append(h);
          for (const item of entries.filter((x) =>
            x.name.toLowerCase().includes(search.value.toLowerCase()),
          )) {
            const row = document.createElement("div");
            action(item.name, () => apply(item), row);
            action(
              "↓",
              () => download(`${item.name}.${kind}.json`, item),
              row,
            ).title = "Export sketch";
            if (item.id)
              action(
                "×",
                () => {
                  localStorage.setItem(
                    KEY,
                    JSON.stringify(load().filter((x) => x.id !== item.id)),
                  );
                  render();
                },
                row,
              ).title = "Remove saved sketch";
            items.append(row);
          }
        }
      };
      search.oninput = render;
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
      render();
      try {
        const index = await (
          await fetch(basePath("examples/index.json"))
        ).json();
        bundled = await Promise.all(
          index.map(async (entry) => {
            const project = await (await fetch(basePath(entry.project))).json();
            const source =
              kind === "arduino"
                ? project.arduino
                : typeof project.p5 === "string"
                  ? project.p5
                  : project.p5?.webserial || project.p5?.native || "";
            const files = Object.fromEntries(
              Object.entries(project.workbench?.files || {}).filter(([n]) =>
                kind === "arduino"
                  ? /\.(ino|h|hpp|c|cpp)$/.test(n)
                  : /\.(js|html|css)$/.test(n),
              ),
            );
            return {
              kind,
              name: entry.name,
              source,
              files,
              assets: kind === "p5" ? project.workbench?.assets || {} : {},
            };
          }),
        );
        render();
      } catch (e) {
        wb.ctx.notice(e.message);
      }
    };
  }
}
