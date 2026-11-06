import coreSource from "./take.js?raw";
import playerSource from "./lessonPlayer.js?raw";
import { validateTake } from "./take.js";
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const scriptSafe = (value) => value.replace(/<\/script/gi, "<\\/script");
export function takeToHTML(take, { drawingScript = "" } = {}) {
  validateTake(take);
  const source =
    coreSource.replace(/^export\s+/gm, "") +
    "\n" +
    playerSource.replace(/^import[^;]*;\s*/gm, "").replace(/^export\s+/gm, "");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(take.title)}</title><meta name="generator" content="p5comp lesson timeline">
<style>html,body{margin:0;height:100%;background:#1c1c1e;color:#d8d8da;font:14px system-ui}body{display:flex;flex-direction:column}main{flex:1;min-height:0;display:grid;place-items:center}canvas{max-width:100%;max-height:100%;aspect-ratio:16/9;object-fit:contain}nav{display:flex;align-items:center;gap:10px;padding:10px;background:#242426}button,select{background:#303033;color:inherit;border:1px solid #3d3d40;border-radius:5px;padding:6px;font:inherit}input{flex:1;min-width:40px}output{min-width:100px}#status{padding:4px 10px;color:#a1a1a5;font-size:12px}</style></head><body>
<main><canvas id="lesson" width="1280" height="720" aria-label="Recorded lesson"></canvas></main><div id="status">Recorded playback · no hardware connection</div>
<nav aria-label="Playback"><button id="play" aria-label="Play lesson">▶</button><input id="seek" aria-label="Lesson position" type="range" min="0" step="1" value="0"><output id="clock"></output><select id="speed" aria-label="Playback speed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select><button id="download" aria-label="Download take JSON">JSON ↓</button></nav>
<script>${scriptSafe(drawingScript)}</script><script>
${scriptSafe(source)}

const take = ${JSON.stringify(take).replace(/</g, "\\u003c")};
const player=window.p5compLesson=createLessonPlayer(document.getElementById('lesson'),take,globalThis.AMSDrawingRenderer);
const play=document.getElementById('play'), seek=document.getElementById('seek'), clock=document.getElementById('clock');
seek.max=player.duration;const fmt=t=>Math.floor(t/60000)+':'+(t/1000%60).toFixed(1).padStart(4,'0');
function update(){seek.value=player.time;clock.textContent=fmt(player.time)+' / '+fmt(player.duration);play.textContent=player.playing?'Ⅱ':'▶'}
play.onclick=()=>{player.playing?player.pause():player.play();update()};seek.oninput=()=>{player.seek(seek.value);update()};document.getElementById('speed').onchange=e=>player.rate=e.target.value;
player.onTime=update;player.onEnd=update;player.ready.then(update).catch(e=>document.getElementById('status').textContent=e.message);update();
document.getElementById('download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(take,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='lesson.ams-take.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
addEventListener('keydown',e=>{if(e.target.matches('input,select,button'))return;if(e.code==='Space'){e.preventDefault();play.click()}if(e.key==='ArrowRight'){player.seek(player.time+2000);update()}if(e.key==='ArrowLeft'){player.seek(player.time-2000);update()}});
</script></body></html>`;
}
