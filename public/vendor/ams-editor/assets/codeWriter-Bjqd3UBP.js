import{S as b}from"./embed-CLgfdLii.js";import{c as k,a as $}from"./modelStore-C8eDEA31.js";const x=["point","line","plane","guide","gesture","note","rect","circle","range","random","noise","source","fit","walk","lerp","map","seed","board","stage","brush","decide","print","sin","cos"];function v(t){let e=String(t||"");const n=[],i=/,([ \t]*(?:\/\/[^\n]*)?)\n([ \t]*)(const|let|var)\s/g;i.test(e)&&(e=e.replace(i,`;$1
$2$3 `),n.push("a comma ending a declaration became a semicolon"));for(const s of x)new RegExp(`\\b(const|let|var)\\s+${s}\\b(?=\\s*=)`).test(e)&&(e=e.replace(new RegExp(`\\b${s}\\b(?!\\s*\\()(?!\\s*:)(?!['"\`])`,"g"),`${s}_`),n.push(`the variable ${s} was renamed ${s}_ (it hid the function ${s}())`));return{code:e,fixes:n}}const E=`You write short programs in a drawing studio's own language (JavaScript). Reply with ONE fenced js code block and nothing else.
Only the things listed here exist; do not invent others (no brush(), stage(), walk(), defineLine(), classes, imports, or assigning to a call). The program already runs on its own board: never call board(), artboard() or stage().
- The board: x and y are fractions from 0 to 1 (x to the right, y down). width and height are its size in units.
- Marks: point(x, y, { size, color }). line(points, { color, width }) with points like [[x, y], [x, y]]. plane(points, { color }) a closed shape; rect(x, y, w, h) and circle(cx, cy, r) give points for plane or line. note(x, y, text).
- Loops: for (const i of range(n)) { ... }. random() is 0 to 1; random(a, b). Math, sin, cos, PI, TAU work.
- Pictures: const s = source('name'). s.color(x, y) is the picture's color at a place, already a color string: pass it straight in, point(x, y, { color: s.color(x, y) }). s.value(x, y) is its brightness, 0 (dark) to 1 (light). A source can be read with source('name', { fit: 'contain' }).
- Sizes (point size, line width) are in board units, like width and height (a board is often 800 wide). For a grid of square cells: cell = width / cols, rows = Math.round(cols * height / width), and a dot as big as its cell has size cell.
- "Lighter" or "brighter than t" means s.value(x, y) > t; "darker than t" means s.value(x, y) < t. "Darker gets bigger" means the size grows as 1 - s.value(x, y).
- Only read a picture (source) when the request names one; otherwise do not call source() at all.
- A number a person may want to change gets a range comment: const n = 60 /* 10..120 */.
Language reference:
${b}

Example:
\`\`\`js
// A grid of squares, 8 across and 5 down, each the color of the picture 'photo' at its place.
const s = source('photo')
const cols = 8, rows = 5
for (const i of range(cols)) for (const j of range(rows)) {
  const x = (i + 0.5) / cols, y = (j + 0.5) / rows
  plane(rect(x - 0.04, y - 0.04, 0.08, 0.08), { color: s.color(x, y) })
}
\`\`\``;function S(t){t=String(t||"").replace(/<think>[\s\S]*?(<\/think>|$)/gi,"");const e=[...t.matchAll(/```(?:js|javascript|ts|typescript)?\s*\n([\s\S]*?)```/gi)];if(e.length)return e.at(-1)[1].trim();const n=/```(?:js|javascript)?\s*\n([\s\S]*)$/i.exec(t);return(n?n[1]:t).trim()}function T(t){const e=k(),n=e?.engine||$(),i=t.artists.get(n),s=e?.model||i?.getModel?.()||"";return{engine:n,artist:i,model:s,label:`${n}${s?`: ${s}`:""}`,own:!e}}const j=t=>new Promise(e=>setTimeout(e,t)),M=t=>t==="webgpu"?{temperature:.1}:{};async function P(t,{request:e,board:n=null,repairs:i=2,maxTokens:s=1400,signal:c=null,onStatus:g=()=>{}}={}){const f=performance.now(),r=T(t),o={ok:!1,code:"",marks:0,tries:0,error:null,engine:r.engine,model:r.model,ms:0};if(!r.artist?.complete)return o.error=`${r.engine} cannot write code here (it has no way to be asked a question: pick an engine in Settings › Model)`,o;try{const d=await w(t,n),h=a=>{g(a);try{window.dispatchEvent(new CustomEvent("ams-engine-status",{detail:a}))}catch{}},p=r.artist.onProgress;r.engine==="webgpu"&&(r.artist.onProgress=a=>{(a?.status==="progress_total"||a?.status==="progress")&&h(`Loading ${String(r.model).split("/").pop()}: ${Math.round(a.progress||0)}%`),p?.(a)}),h(`Writing code with ${r.model||r.engine}…`);const u=a=>r.artist.complete({system:E,user:a,maxTokens:s,signal:c,model:r.own?void 0:r.model,...M(r.engine)});let m=await u(e);for(o.tries=1;;o.tries++){c?.throwIfAborted?.();const a=v(S(m));o.code=a.code,o.error=null,g(o.tries>1?`Running the fixed code (try ${o.tries})…`:"Running it…");let l;try{l=await window.ams.callTool("ams_board",{action:"code",id:d,source:o.code},{quiet:!0})}catch(y){l={error:y.message}}if(l?.error)o.error=`${l.error}${l.line?` (line ${l.line})`:""}`;else if(!l?.marks)o.error="It ran, but drew nothing: every mark needs point(), line() or plane(), and rect() and circle() only give points.";else{o.ok=!0,o.marks=l.marks;break}if(o.tries>i)break;g(`It did not work (${o.error}). Asking for a fix…`),m=await u(`${e}

Your code:
\`\`\`js
${o.code}
\`\`\`
The studio says: ${o.error}
Fix it, using only the functions listed. Reply with the corrected code block.`)}}catch(d){o.error=d.name==="AbortError"?"Stopped.":d.message}return r.engine==="webgpu"&&(r.artist.onProgress=null),o.ms=Math.round(performance.now()-f),o}async function w(t,e){const n=t.store.doc.boards||[];if(e){const i=n.find(c=>c.id===e||c.title===e);if(i)return i.id;const s=await window.ams.callTool("ams_board",{action:"add",title:String(e),width:800,height:600},{quiet:!0});return await j(50),s.id||(t.store.doc.boards||[]).find(c=>c.title===e)?.id}return t.activeBoard&&t.activeBoard!=="main"?t.activeBoard:n.find(i=>i.id===t.activeBoard)?.id||await w(t,"Code")}export{E as CODE_SYSTEM,T as codeModel,S as codeOf,P as writeCode};
