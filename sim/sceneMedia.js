import { icon } from "./uiIcons.js";
export function installSceneMedia(wb) {
  wb.cameraStreams = new Map();
  const menu = document.getElementById("addReference");
  const add = document.createElement("button");
  add.textContent = "Add webcam…";
  add.id = "addWebcam";
  menu.after(add);
  add.onclick = () => {
    const bounds = document.getElementById("stage").getBoundingClientRect(),
      p = wb.ctx.canvas.toWorld({
        clientX: bounds.left + 80,
        clientY: bounds.top + 80,
      });
    wb.references.push({
      id: crypto.randomUUID(),
      kind: "webcam",
      name: "Webcam",
      x: p.x,
      y: p.y,
      width: 320,
      height: 240,
      opacity: 1,
      blend: "normal",
      showLabel: false,
    });
    wb.renderReferences();
    wb.tab("properties");
    wb.ctx.persist();
  };
  const stage = document.getElementById("stage");
  stage.addEventListener("dragover", (e) => {
    if (e.dataTransfer.types.includes("application/x-p5comp-asset")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });
  stage.addEventListener("drop", (e) => {
    const name = e.dataTransfer.getData("application/x-p5comp-asset"),
      asset = wb.assets[name];
    if (!asset) return;
    e.preventDefault();
    e.stopPropagation();
    const p = wb.ctx.canvas.toWorld(e);
    wb.references.push({
      id: crypto.randomUUID(),
      kind: asset.type?.startsWith("video/") ? "video" : "image",
      name,
      src: asset.src,
      x: p.x,
      y: p.y,
      width: 320,
      opacity: 1,
      blend: "normal",
      showLabel: false,
    });
    wb.renderReferences();
    wb.ctx.persist();
  });
}
export function decorateMedia(wb, ref, scene, content, handle, row) {
  const remove = () => wb.removeReference(ref.id);
  scene.addEventListener("pointerdown", (e) => {
    if(e.altKey && e.button===0 && !e.target.closest('button,input,select,textarea,[contenteditable],.note-resize,.media-resize')) {
      e.preventDefault();e.stopImmediatePropagation();
      const clone=wb.duplicateReference(ref,0);
      const target=[...document.querySelectorAll('.scene-item')].find(el=>el.dataset.reference===clone.id);
      const handle=target?.querySelector('.scene-handle');
      (handle||target)?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,pointerId:e.pointerId,clientX:e.clientX,clientY:e.clientY,button:0}));
      return;
    }
    if (ref.kind !== "note") wb.selectReference(ref);
  }, {capture:true});
  scene.addEventListener("pointerdown", e => e.stopPropagation());
  scene.oncontextmenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    document.querySelector(".media-context-menu")?.remove();
    const menu = document.createElement("div");
    menu.className = "media-context-menu";
    menu.setAttribute("role", "menu");
    const button = document.createElement("button");
    button.textContent =
      "Remove " + (ref.kind === "webcam" ? "capture overlay" : "media");
    button.setAttribute("role", "menuitem");
    menu.append(button);
    const controller = new AbortController();
    const close = () => {
      controller.abort();
      menu.remove();
    };
    button.onclick = () => {
      close();
      remove();
    };
    document.body.append(menu);
    menu.style.left =
      Math.max(8, Math.min(e.clientX, innerWidth - menu.offsetWidth - 8)) +
      "px";
    menu.style.top =
      Math.max(8, Math.min(e.clientY, innerHeight - menu.offsetHeight - 8)) +
      "px";
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!menu.contains(event.target)) close();
      },
      { capture: true, signal: controller.signal },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      },
      { capture: true, signal: controller.signal },
    );
    button.focus();
  };
  if (ref.kind === "note") return;
  scene.classList.add("scene-visual");
  if (ref.height) {
    scene.style.height = ref.height + "px";
    content.style.height = "100%";
    content.style.objectFit = "contain";
  }
  handle.hidden = ref.showLabel === false;
  const name = document.createElement("input");
  name.value = ref.name;
  name.setAttribute("aria-label", "Media label");
  name.oninput = name.onchange = () => {
    ref.name = name.value;
    handle.textContent = ref.name;
    labelText.textContent = ref.name;
    wb.ctx.persist();
  };
  const labelText = row.querySelector("span");
  row.prepend(name);
  labelText.hidden = true;
  const show = document.createElement("label");
  show.textContent = "Label ";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = ref.showLabel !== false;
  checkbox.setAttribute("aria-label", "Show media label");
  checkbox.onchange = () => {
    ref.showLabel = checkbox.checked;
    handle.hidden = !checkbox.checked;
    wb.ctx.persist();
  };
  show.append(checkbox);
  row.prepend(show);
  scene.ondblclick = (e) => {
    e.stopPropagation();
    wb.selectedNoteId = null;
    document.getElementById("referenceProperties").hidden = false;
    document
      .querySelectorAll(".reference-row")
      .forEach((r) => (r.hidden = r !== row));
    wb.tab("properties");
    name.focus();
    name.select();
  };
  const overlay = ref.kind === "webcam";
  if (overlay) {
    const bounds = scene.getBoundingClientRect();
    ref.overlayX ??= Math.max(
      12,
      Math.min(innerWidth - ref.width - 12, bounds.left),
    );
    ref.overlayY ??= Math.max(60, Math.min(innerHeight - 100, bounds.top));
    let layer = document.getElementById("webcamOverlayLayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "webcamOverlayLayer";
      document.body.append(layer);
    }
    scene.classList.add("camera-overlay");
    const close = document.createElement("button");
    close.className = "media-close ui-icon-button";
    close.append(icon("close"));
    close.title = "Close capture overlay";
    close.setAttribute("aria-label", close.title);
    close.onpointerdown = (e) => e.stopPropagation();
    close.onclick = (e) => {
      e.stopPropagation();
      remove();
    };
    scene.append(close);
    layer.append(scene);
    scene.style.left = ref.overlayX + "px";
    scene.style.top = ref.overlayY + "px";
    for (const prop of ["x", "y"]) {
      const input = row.querySelector(
        `input[aria-label="${ref.name} ${prop}"]`,
      );
      if (input) {
        input.value = ref[prop === "x" ? "overlayX" : "overlayY"];
        input.oninput = () => {
          ref[prop === "x" ? "overlayX" : "overlayY"] = Number(input.value);
          scene.style[prop === "x" ? "left" : "top"] = input.value + "px";
          wb.ctx.persist();
        };
      }
    }
  }
  const resize = document.createElement("button");
  resize.className = "note-resize media-resize";
  resize.title = "Resize " + ref.name;
  resize.setAttribute("aria-label", resize.title);
  scene.append(resize);
  resize.onpointerdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const start = {
      x: e.clientX,
      y: e.clientY,
      w: scene.offsetWidth,
      h: scene.offsetHeight,
    };
    resize.setPointerCapture(e.pointerId);
    resize.onpointermove = (event) => {
      const z = overlay ? 1 : wb.ctx.canvas.camera.zoom;
      ref.width = Math.max(50, start.w + (event.clientX - start.x) / z);
      ref.height = Math.max(40, start.h + (event.clientY - start.y) / z);
      scene.style.width = ref.width + "px";
      scene.style.height = ref.height + "px";
      content.style.height = "100%";
      content.style.objectFit = "contain";
    };
    resize.onpointerup = resize.onpointercancel = () => {
      resize.onpointermove = null;
      wb.ctx.persist();
    };
  };
  const drag = (e) => {
    if (
      e.button !== 0 ||
      (!overlay && ref.showLabel !== false) ||
      (e.target.closest("button,input") && !e.target.closest(".scene-handle"))
    )
      return;
    if (ref.kind === "video" && content.controls) return;
    e.stopPropagation();
    e.preventDefault();
    const bounds = scene.getBoundingClientRect();
    const start = {
      x: e.clientX,
      y: e.clientY,
      rx: overlay ? bounds.left : ref.x,
      ry: overlay ? bounds.top : ref.y,
    };
    scene.setPointerCapture(e.pointerId);
    scene.onpointermove = (event) => {
      ref[overlay ? "overlayX" : "x"] =
        start.rx +
        (event.clientX - start.x) / (overlay ? 1 : wb.ctx.canvas.camera.zoom);
      ref[overlay ? "overlayY" : "y"] =
        start.ry +
        (event.clientY - start.y) / (overlay ? 1 : wb.ctx.canvas.camera.zoom);
      scene.style.left = ref[overlay ? "overlayX" : "x"] + "px";
      scene.style.top = ref[overlay ? "overlayY" : "y"] + "px";
    };
    scene.onpointerup = scene.onpointercancel = () => {
      scene.onpointermove = null;
      wb.ctx.persist();
    };
  };
  content.addEventListener("pointerdown", drag);
  if (overlay) handle.onpointerdown = drag;
  if (overlay)
    scene.addEventListener("pointerdown", (e) => {
      if (
        e.target === scene ||
        e.target.classList.contains("webcam-placeholder")
      )
        drag(e);
    });
  if (ref.kind === "webcam") {
    content.autoplay = true;
    content.muted = true;
    content.playsInline = true;
    content.srcObject = wb.cameraStreams.get(ref.id) || null;
    content.style.transform = ref.flipX ? "scaleX(-1)" : "";
    const placeholder = document.createElement("span");
    placeholder.className = "webcam-placeholder";
    placeholder.textContent = "Camera off";
    placeholder.hidden = !!content.srcObject;
    scene.append(placeholder);
    const controls = document.createElement("div");
    controls.onpointerdown = (e) => e.stopPropagation();
    controls.onclick = (e) => e.stopPropagation();
    controls.className = "webcam-controls";
    controls.classList.toggle("camera-off", !content.srcObject);
    scene.append(controls);
    const start = document.createElement("button");
    start.className = "ui-icon-button";
    const paint = (on) => {
      start.replaceChildren(icon("camera"));
      start.setAttribute("aria-pressed", String(on));
      start.setAttribute("aria-label", on ? "Stop camera" : "Start camera");
      start.title = on ? "Stop camera" : "Start camera";
    };
    paint(!!content.srcObject);
    start.onclick = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera capture is unavailable in this browser. Open this project in Chrome or Edge on localhost/HTTPS.",
          );
        const old = wb.cameraStreams.get(ref.id);
        if (old) {
          old.getTracks().forEach((t) => t.stop());
          wb.cameraStreams.delete(ref.id);
          content.srcObject = null;
          paint(false);
          placeholder.hidden = false;
          controls.classList.add("camera-off");
          return;
        }
        start.disabled = true;
        placeholder.hidden = false;
        placeholder.textContent = "Waiting for camera permission…";
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (!wb.references.some(r => r.id === ref.id)) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        wb.cameraStreams.set(ref.id, stream);
        content.srcObject = stream;
        await content.play();
        paint(true);
        placeholder.hidden = true;
        controls.classList.remove("camera-off");
      } catch (e) {
        placeholder.hidden = false;
        placeholder.textContent = "Camera: " + e.message;
        wb.ctx.notice("Camera: " + e.message);
      } finally {
        start.disabled = false;
      }
    };
    const share = document.createElement("button");
    share.className = "ui-icon-button";
    share.append(icon("windowShare"));
    share.title = "Share window / Desk View";
    share.setAttribute("aria-label", share.title);
    share.onclick = async () => {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia)
          throw new Error(
            "Window sharing is unavailable in this browser. Open the project in Chrome or Edge, then choose the Desk View window.",
          );
        share.disabled = true;
        // Request first: cancelling the chooser must leave the camera running.
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "window", cursor: "never" },
          audio: false,
        });
        // Hide the source-window cursor instead of baking a second pointer into the feed.
        const displayTrack = stream.getVideoTracks()[0];
        try {
          await displayTrack.applyConstraints({ cursor: "never" });
        } catch {
          /* Optional capture constraint; keep the selected feed usable. */
        }
        const old = wb.cameraStreams.get(ref.id);
        if (!wb.references.some(r => r.id === ref.id)) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        wb.cameraStreams.set(ref.id, stream);
        content.srcObject = stream;
        old?.getTracks().forEach((t) => t.stop());
        await content.play();
        paint(true);
        start.setAttribute("aria-label", "Stop capture");
        start.title = "Stop capture";
        placeholder.hidden = true;
        controls.classList.remove("camera-off");
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          if (wb.cameraStreams.get(ref.id) !== stream) return;
          wb.cameraStreams.delete(ref.id);
          content.srcObject = null;
          paint(false);
          placeholder.textContent = "Capture stopped";
          placeholder.hidden = false;
          controls.classList.add("camera-off");
        });
      } catch (e) {
        if (e.name !== "NotAllowedError" && e.name !== "AbortError") {
          placeholder.textContent = e.message;
          placeholder.hidden = false;
          wb.ctx.notice("Window capture: " + e.message);
        }
      } finally {
        share.disabled = false;
      }
    };
    const snap = document.createElement("button");
    snap.textContent = "◉";
    snap.title = "Save webcam snapshot to assets";
    snap.setAttribute("aria-label", snap.title);
    snap.onclick = () => {
      if (!content.videoWidth) {
        wb.ctx.notice("Start the camera before taking a snapshot.");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = content.videoWidth;
      canvas.height = content.videoHeight;
      const context = canvas.getContext("2d");
      if (ref.flipX) {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(content, 0, 0);
      const src = canvas.toDataURL("image/png"),
        name = "webcam-" + Date.now() + ".png";
      wb.assets[name] = {
        src,
        type: "image/png",
        size: Math.ceil((src.length - 22) * 0.75),
      };
      wb.renderAssets();
      wb.ctx.persist();
      wb.ctx.notice("Snapshot saved to assets: " + name);
    };
    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = 0.1;
    opacity.max = 1;
    opacity.step = 0.05;
    opacity.value = ref.opacity ?? 1;
    opacity.title = "Camera opacity";
    opacity.setAttribute("aria-label", "Camera opacity");
    opacity.oninput = () => {
      ref.opacity = Number(opacity.value);
      scene.style.opacity = ref.opacity;
      wb.ctx.persist();
    };
    const flip = document.createElement("button");
    flip.className = "ui-icon-button";
    flip.append(icon("mirror"));
    flip.title = "Mirror camera horizontally";
    flip.setAttribute("aria-label", flip.title);
    flip.setAttribute("aria-pressed", String(!!ref.flipX));
    flip.onclick = () => {
      ref.flipX = !ref.flipX;
      content.style.transform = ref.flipX ? "scaleX(-1)" : "";
      flip.setAttribute("aria-pressed", String(ref.flipX));
      wb.ctx.persist();
    };
    controls.append(start, share, snap, flip, opacity);
  }
}
