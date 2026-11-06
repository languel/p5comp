# Browser FFmpeg

p5comp's optional MP4 exporter includes:

- `@ffmpeg/ffmpeg` 0.12.15, MIT, <https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.15/packages/ffmpeg>.
- `@ffmpeg/core` 0.12.10, GPL-2.0-or-later, <https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10/packages/core>.

The upstream source, build scripts, constituent libraries and notices are available from <https://github.com/ffmpegwasm/ffmpeg.wasm> and <https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core>. FFmpeg source: <https://ffmpeg.org/download.html>. GNU GPL v2: <https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>.

The core is distributed as an unchanged installed package asset. The app imports its JavaScript and WebAssembly files through Vite; encoding executes in a worker only when MP4 export is requested. HTML lesson exports do not embed FFmpeg.
