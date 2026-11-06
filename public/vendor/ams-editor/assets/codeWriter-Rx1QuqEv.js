import{S as y}from"./embed-oxzErQv0.js";const b=["point","line","plane","guide","gesture","note","rect","circle","range","random","noise","source","fit","walk","lerp","map","seed","board","stage","brush","decide","print","sin","cos"];function x(e){let t=String(e||"");const n=[],i=/,([ \t]*(?:\/\/[^\n]*)?)\n([ \t]*)(const|let|var)\s/g;i.test(t)&&(t=t.replace(i,`;$1
$2$3 `),n.push("a comma ending a declaration became a semicolon"));for(const r of b)new RegExp(`\\b(const|let|var)\\s+${r}\\b(?=\\s*=)`).test(t)&&(t=t.replace(new RegExp(`\\b${r}\\b(?!\\s*\\()(?!\\s*:)(?!['"\`])`,"g"),`${r}_`),n.push(`the variable ${r} was renamed ${r}_ (it hid the function ${r}())`));return{code:t,fixes:n}}const k="ams_assistant_engine",m=(e,t=null)=>{try{const n=localStorage.getItem(e);return n??t}catch{return t}},$=()=>m(k,"ollama"),v="ams_code_model";function S(){try{const e=JSON.parse(m(v,"{}"))||{};return e.engine&&e.model?{engine:e.engine,model:e.model}:null}catch{return null}}const E=`You write short programs in a drawing studio's own language (JavaScript). Reply with ONE fenced js code block and nothing else.
Only the things listed here exist; do not invent others (no brush(), stage(), walk(), defineLine(), classes, imports, or assigning to a call). The program already runs on its own board: never call board(), artboard() or stage().
- The board: x and y are fractions from 0 to 1 (x to the right, y down). width and height are its size in units.
- Marks: point(x, y, { size, color }). line(points, { color, width }) with points like [[x, y], [x, y]]. plane(points, { color }) a closed shape; rect(x, y, w, h) and circle(cx, cy, r) give points for plane or line. note(x, y, text).
- Loops: for (const i of range(n)) { ... }. random() is 0 to 1; random(a, b). Math, sin, cos, PI, TAU work.
- Pictures: const s = source('name'). s.color(x, y) is the picture's color at a place, already a color string: pass it straight in, point(x, y, { color: s.color(x, y) }). s.value(x, y) is its brightness, 0 (dark) to 1 (light). A source can be read with source('name', { fit: 'contain' }).
- Sizes (point size, line width) are in board units, like width and height (a board is often 800 wide). For a grid of square cells: cell = width / cols, rows = Math.round(cols * height / width), and a dot as big as its cell has size cell.
- "Lighter" or "brighter than t" means s.value(x, y) > t; "darker than t" means s.value(x, y) < t. "Darker gets bigger" means the size grows as 1 - s.value(x, y).
- A number a person may want to change gets a range comment: const n = 60 /* 10..120 */.
Language reference:
${y}

Example:
\`\`\`js
// A grid of squares, 8 across and 5 down, each the color of the picture 'photo' at its place.
const s = source('photo')
const cols = 8, rows = 5
for (const i of range(cols)) for (const j of range(rows)) {
  const x = (i + 0.5) / cols, y = (j + 0.5) / rows
  plane(rect(x - 0.04, y - 0.04, 0.08, 0.08), { color: s.color(x, y) })
}
\`\`\``;function T(e){e=String(e||"").replace(/<think>[\s\S]*?(<\/think>|$)/gi,"");const t=[...e.matchAll(/```(?:js|javascript|ts|typescript)?\s*\n([\s\S]*?)```/gi)];if(t.length)return t.at(-1)[1].trim();const n=/```(?:js|javascript)?\s*\n([\s\S]*)$/i.exec(e);return(n?n[1]:e).trim()}function _(e){const t=S(),n=t?.engine||$(),i=e.artists.get(n),r=t?.model||i?.getModel?.()||"";return{engine:n,artist:i,model:r,label:`${n}${r?`: ${r}`:""}`,own:!t}}const A=e=>new Promise(t=>setTimeout(t,e)),I=e=>e==="webgpu"?{temperature:.1}:{};async function R(e,{request:t,board:n=null,repairs:i=2,maxTokens:r=1400,signal:a=null,onStatus:d=()=>{}}={}){const f=performance.now(),s=_(e),o={ok:!1,code:"",marks:0,tries:0,error:null,engine:s.engine,model:s.model,ms:0};if(!s.artist?.complete)return o.error=`${s.engine} cannot write code here (it has no way to be asked a question: pick an engine in Settings › Model)`,o;try{const l=await w(e,n);d(`Writing code with ${s.model||s.engine}…`);const u=g=>s.artist.complete({system:E,user:g,maxTokens:r,signal:a,model:s.own?void 0:s.model,...I(s.engine)});let h=await u(t);for(o.tries=1;;o.tries++){a?.throwIfAborted?.();const g=x(T(h));o.code=g.code,o.error=null,d(o.tries>1?`Running the fixed code (try ${o.tries})…`:"Running it…");let c;try{c=await window.ams.callTool("ams_board",{action:"code",id:l,source:o.code},{quiet:!0})}catch(p){c={error:p.message}}if(c?.error)o.error=`${c.error}${c.line?` (line ${c.line})`:""}`;else if(!c?.marks)o.error="It ran, but drew nothing: every mark needs point(), line() or plane(), and rect() and circle() only give points.";else{o.ok=!0,o.marks=c.marks;break}if(o.tries>i)break;d(`It did not work (${o.error}). Asking for a fix…`),h=await u(`${t}

Your code:
\`\`\`js
${o.code}
\`\`\`
The studio says: ${o.error}
Fix it, using only the functions listed. Reply with the corrected code block.`)}}catch(l){o.error=l.name==="AbortError"?"Stopped.":l.message}return o.ms=Math.round(performance.now()-f),o}async function w(e,t){const n=e.store.doc.boards||[];if(t){const i=n.find(a=>a.id===t||a.title===t);if(i)return i.id;const r=await window.ams.callTool("ams_board",{action:"add",title:String(t),width:800,height:600},{quiet:!0});return await A(50),r.id||(e.store.doc.boards||[]).find(a=>a.title===t)?.id}return e.activeBoard&&e.activeBoard!=="main"?e.activeBoard:n.find(i=>i.id===e.activeBoard)?.id||await w(e,"Code")}export{E as CODE_SYSTEM,_ as codeModel,T as codeOf,R as writeCode};
