import { FFmpeg } from "@ffmpeg/ffmpeg";
import workerURL from "./ffmpeg.worker.js?worker&url";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { createLessonPlayer } from "./lessonPlayer.js";

/** Render offline, then encode with single-thread FFmpeg WASM in a browser worker. */
export async function takeToMP4(
  take,
  {
    onProgress = () => {},
    signal,
    fps = 15,
    width = 1280,
    drawingRenderer,
  } = {},
) {
  const ffmpeg = new FFmpeg(),
    canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.round((width * 9) / 16 / 2) * 2;
  const player = createLessonPlayer(canvas, take, drawingRenderer);
  const abort = () => ffmpeg.terminate();
  signal?.addEventListener("abort", abort, { once: true });
  const check = () => {
    if (signal?.aborted)
      throw new DOMException("Export cancelled", "AbortError");
  };
  let lastLog = "";
  ffmpeg.on("log", ({ message }) => {
    lastLog = message;
  });
  try {
    check();
    onProgress("Loading browser FFmpeg…");
    await ffmpeg.load({
      classWorkerURL: new URL(workerURL, location.href).href,
      coreURL: new URL(coreURL, location.href).href,
      wasmURL: new URL(wasmURL, location.href).href,
    });
    await player.ready;
    check();
    const frames = Math.max(1, Math.ceil((player.duration / 1000) * fps));
    for (let i = 0; i < frames; i++) {
      check();
      player.frame(frames === 1 ? 0 : (i / (frames - 1)) * player.duration);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(new Error("Video frame could not be rendered.")),
          "image/jpeg",
          0.9,
        ),
      );
      await ffmpeg.writeFile(
        `frame-${String(i).padStart(6, "0")}.jpg`,
        new Uint8Array(await blob.arrayBuffer()),
      );
      if (i % 15 === 0 || i === frames - 1)
        onProgress(
          `Rendering frames · ${Math.round(((i + 1) / frames) * 100)}%`,
        );
    }
    check();
    onProgress("Encoding MP4 in browser…");
    ffmpeg.on("progress", ({ progress }) =>
      onProgress(
        `Encoding MP4 · ${Math.min(100, Math.round(progress * 100))}%`,
      ),
    );
    const code = await ffmpeg.exec([
      "-framerate",
      String(fps),
      "-i",
      "frame-%06d.jpg",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      "output.mp4",
    ]);
    check();
    if (code !== 0)
      throw new Error(
        `Browser FFmpeg could not encode this take (${lastLog}).`,
      );
    const data = await ffmpeg.readFile("output.mp4");
    return new Blob([data], { type: "video/mp4" });
  } catch (error) {
    check();
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    signal?.removeEventListener("abort", abort);
    ffmpeg.terminate();
    player.destroy();
    canvas.width = canvas.height = 0;
  }
}
