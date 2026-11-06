import{i as S,a as k,s as A,p as C}from"./embed-CLgfdLii.js";import{guiCode as f}from"./exportGui-DnEfWerM.js";const E=e=>String(e).replace(/[&<>"]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[s]),D=e=>String(e||"sketch").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"sketch",H=({title:e,kind:s,flavor:o,panel:a,gui:c,latest:i,versions:r})=>`# ${e}

Made in Artist Model Studio. ${s==="three"?o==="vite"?`A Vite project with three.js installed (${i?"the latest":`r${r.three.split(".")[1]}, ${r.three}`}): \`npm install\`, then \`npm run dev\`.`:`A page of native ES modules with an import map and no build step (three.js ${i?"latest":r.three} from a CDN): serve this folder with any static server (\`npx serve .\`), or open it in Codevre, or copy \`src/main.js\` and the import map into CodePen.`:`A page with p5.js ${i?"(the latest)":r.p5} from a CDN and the sketch in \`src/sketch.js\`: serve this folder with any static server.`}

## The code

\`src/${s==="three"?"main":"sketch"}.js\` is the sketch. ${s==="three"?"It imports `'three'` and `'three/addons/…'` by their names: "+(o==="vite"?"npm finds them.":"the import map in `index.html` says where they are (add a line to it for another library)."):""}
The size of the window is \`innerWidth\` and \`innerHeight\`, as in any page.

## The comments

A comment next to a value, like \`/* 0..4 */\`, \`/* toggle */\`, \`/* a|b */\` or \`/* color */\`, is a **control** in the studio: a slider, a checkbox, a menu, a colour. ${c?"Here they are a lil-gui panel (the GUI three.js's own examples use): a line after each value adds its control, and `import { GUI }` at the top brings it in. Delete those lines to have plain code.":a?"Here they are a small panel (H shows or hides it; the gear comes up near the top right corner; Shift+H hides it all): `src/controls.js` makes it, and the lines `__ctl(...)` after the values let it change them. Delete `import './controls.js'` and those lines to have plain code.":"In this project they are only comments: the sketch runs with the values as written, and you change a number in the code to change the sketch. (Export with the controls panel option to have the panel.)"}
`;function T({kind:e,flavor:s="modules",title:o,code:a,ground:c,versions:i,latest:r=!1,panel:m=!1,gui:j=!1}){const p=D(o),n=`${p}/`;e==="p5"&&(s="modules");const b=/^#[0-9a-f]{3,8}$/i.test(c||"")?c:"#141414",d=e==="three"?"main":"sketch",u=S(a),t=[],$=m?k(a):[],h=m&&$.length>0,y=j&&e==="three"&&!h&&f(a)!==a,g=h?u.code:y?f(a):a,w=e==="three"&&h?`import './controls.js';

${g.trimEnd()}
`:`${g.trimEnd()}
`;t.push({name:`${n}src/${d}.js`,data:w}),h&&t.push({name:`${n}src/controls.js`,data:`// The controls panel, made by Artist Model Studio from the comments in ${d}.js.
${A(u.values,o,e==="p5")}
${C($,a)}
`});const x=`<style>*{margin:0}html,body{overflow:hidden;background:${b}}canvas{display:block}</style>`,l=`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${E(o)}</title>
  ${x}`;if(e==="three"&&s==="vite")t.push({name:`${n}index.html`,data:`${l}
</head>
<body>
  <script type="module" src="/src/main.js"><\/script>
</body>
</html>
`}),t.push({name:`${n}package.json`,data:JSON.stringify({name:p,version:"1.0.0",private:!0,type:"module",scripts:{dev:"vite",build:"vite build",preview:"vite preview"},dependencies:{three:r?"latest":`^${i.three}`},devDependencies:{vite:"^6.2.0"}},null,2)+`
`}),t.push({name:`${n}vite.config.js`,data:`import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 }
});
`});else if(e==="three"){const v=`https://cdn.jsdelivr.net/npm/three${r?"":`@${i.three}`}`;t.push({name:`${n}index.html`,data:`${l}
  <script type="importmap">
  { "imports": {
    "three": "${v}/build/three.module.js",
    "three/addons/": "${v}/examples/jsm/"
  } }
  <\/script>
</head>
<body>
  <script type="module" src="./src/main.js"><\/script>
</body>
</html>
`}),t.push({name:`${n}package.json`,data:JSON.stringify({name:p,version:"1.0.0",private:!0,scripts:{start:"npx --yes serve ."}},null,2)+`
`})}else t.push({name:`${n}index.html`,data:`${l}
  <script src="https://cdn.jsdelivr.net/npm/p5${r?"":`@${i.p5}`}/lib/p5.min.js"><\/script>
</head>
<body>
${h?`  <script src="./src/controls.js"><\/script>
`:""}  <script src="./src/sketch.js"><\/script>
</body>
</html>
`}),t.push({name:`${n}package.json`,data:JSON.stringify({name:p,version:"1.0.0",private:!0,scripts:{start:"npx --yes serve ."}},null,2)+`
`});return t.push({name:`${n}README.md`,data:H({title:o,kind:e,flavor:s,panel:h,gui:y,latest:r,versions:i})}),t}export{T as projectFiles,D as slugOf};
