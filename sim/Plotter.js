import {LitElement, html, svg, css} from 'lit';
import {appendPlotSample, plotRange} from './plotHistory.js';
const colors = ['#e0a76e','#7bb4db','#9bc792','#d796b8','#c2b6e8','#dfcc76','#78c8c0','#d58282'];
export class Plotter extends LitElement {
  static properties = {timeWindow:{type:Number}, layout:{type:String}, autoNormalize:{type:Boolean}, min:{type:Number}, max:{type:Number}, measurement:{attribute:false}};
  static styles = css`:host{display:block}svg{display:block}text{font-family:ui-monospace,monospace}`;
  constructor(){super();this.timeWindow=10;this.layout='overlay';this.autoNormalize=true;this.min=0;this.max=5;this.history=[];this._measurement={};}
  set measurement(m){this._measurement=m;this.history=appendPlotSample(this.history,m,this.timeWindow);this.requestUpdate();}
  get measurement(){return this._measurement;}
  get pinInfo(){return [{name:'GND',x:15,y:208,signals:[]},...colors.map((_,i)=>({name:'CH'+(i+1),x:48+i*36,y:208,signals:[]}))];}
  render(){
    const h=this.history, now=h.at(-1)?.time||0, duration=Math.max(.1,Math.min(120,Number(this.timeWindow)||10));
    const active=colors.map((_,i)=>i).filter(i=>h.some(p=>Number.isFinite(p.channels[i]?.value)));
    const all=h.flatMap(p=>p.channels.map(c=>c.value));
    const shared=plotRange(all,this.autoNormalize,this.min,this.max);
    return html`<svg width="320" height="208" viewBox="0 0 320 208" aria-label="Plotter signal history">
      <rect x="1" y="1" width="318" height="195" rx="7" fill="#3d4248" stroke="#7d838a"/>
      <rect x="7" y="23" width="306" height="148" rx="3" fill="#181c21"/>
      <text x="10" y="15" fill="#e0e0e0" font-size="9">Plotter · ${duration}s · ${this.layout} · ${this.autoNormalize?'auto scale':`${this.min}–${this.max}V`}</text>
      ${[0,.25,.5,.75,1].map(n=>svg`<path d="M10 ${28+n*137}H310" stroke="#59616b" stroke-width=".4"/>`)}
      ${active.map((i,k)=>{
        const range=this.layout==='stack'?plotRange(h.map(p=>p.channels[i]?.value),this.autoNormalize,this.min,this.max):shared;
        const lane=this.layout==='stack'?137/active.length:137, top=28+(this.layout==='stack'?k*lane:0);
        let path='', pen=false;
        for(const p of h){const v=p.channels[i]?.value;if(!Number.isFinite(v)){pen=false;continue;}const x=10+300*(1-(now-p.time)/duration),y=top+lane-3-Math.max(0,Math.min(1,(v-range[0])/(range[1]-range[0])))*(lane-6);path+=`${pen?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;pen=true;}
        return svg`<path d=${path} fill="none" stroke=${colors[i]} stroke-width="1.4"/><text x=${this.layout==='stack'?12:12+k*37} y=${this.layout==='stack'?top+10:181} fill=${colors[i]} font-size="7">CH${i+1}${this.layout==='stack'?` ${range[0].toFixed(2)}–${range[1].toFixed(2)}V`:''}</text>`;
      })}
      ${!active.length?svg`<text x="20" y="95" fill="#aaa" font-size="10">Connect GND and CH1…CH8</text>`:''}
      ${this.pinInfo.map((p,i)=>svg`<path d="M${p.x} 196v12" stroke=${i?colors[i-1]:'#777'} stroke-width="2"/><text x=${p.x} y="191" text-anchor="middle" fill="#ddd" font-size="7">${i?i:'GND'}</text>`)}
      <title>Properties: timeWindow (0.1–120 seconds), layout (overlay/stack), autoNormalize, min/max volts. Only connected streams appear. History uses simulation time.</title>
    </svg>`;
  }
}
customElements.define('p5comp-plotter',Plotter);
