/* Citygame life needs: original, lightweight simulation loop. */
(function(){
'use strict';
if(window.CG_LIFE_NEEDS)return;
const KEY='citygame-life-needs-v1',names={hunger:'Hunger',energy:'Energy',hygiene:'Hygiene',social:'Social',fun:'Fun',focus:'Focus'};
let values={hunger:90,energy:90,hygiene:90,social:85,fun:85,focus:90};
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&saved.values)values=Object.assign(values,saved.values)}catch(e){}
const style=document.createElement('style');style.textContent='#cg-needs{position:fixed;right:12px;top:76px;width:min(270px,88vw);z-index:8;background:#101923eF;color:#fff;border:1px solid #ffffff24;border-radius:16px;padding:12px;font:13px system-ui;box-shadow:0 8px 30px #0005}#cg-needs .row{display:grid;grid-template-columns:64px 1fr 34px;gap:7px;align-items:center;margin:7px 0}#cg-needs .bar{height:8px;border-radius:8px;background:#ffffff20;overflow:hidden}#cg-needs .fill{height:100%;background:#58c78b;border-radius:8px}#cg-needs button{border:0;border-radius:9px;padding:6px;background:#253746;color:#fff;margin:3px 2px;font-size:12px}#cg-needs button:active{filter:brightness(1.3)}@media(max-width:700px){#cg-needs{top:76px;right:6px;width:min(210px,65vw);padding:8px;font-size:11px}#cg-needs .row{grid-template-columns:52px 1fr 28px;gap:5px}}';document.head.appendChild(style);
const panel=document.createElement('section');panel.id='cg-needs';panel.innerHTML='<b>Daily life</b><div id="cg-needs-bars"></div><div id="cg-needs-actions"></div>';document.body.appendChild(panel);
const bars=panel.querySelector('#cg-needs-bars'),actions=panel.querySelector('#cg-needs-actions');
function render(){bars.innerHTML=Object.keys(names).map(k=>'<div class="row"><span>'+names[k]+'</span><div class="bar"><div class="fill" style="width:'+values[k]+'%;background:'+(values[k]<25?'#e76565':values[k]<55?'#e6b45a':'#58c78b')+'"></div></div><span>'+Math.round(values[k])+'</span></div>').join('');}
const activities=[['🍲 Eat','hunger',28],['🛏 Rest','energy',30],['🧼 Freshen up','hygiene',28],['💬 Socialise','social',25],['🎵 Enjoy','fun',25],['📚 Learn','focus',25]];
actions.innerHTML=activities.map((a,i)=>'<button data-i="'+i+'">'+a[0]+'</button>').join('');
actions.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const a=activities[+b.dataset.i];values[a[1]]=Math.min(100,values[a[1]]+a[2]);Object.keys(values).forEach(k=>{if(k!==a[1])values[k]=Math.max(0,values[k]-1)});save();render()});
function save(){try{localStorage.setItem(KEY,JSON.stringify({values,updated:Date.now()}))}catch(e){}}
function tick(){if(document.hidden)return;Object.keys(values).forEach(k=>values[k]=Math.max(0,values[k]-(k==='energy'?0.035:0.055)));save();render()}
render();setInterval(tick,60000);
window.CG_LIFE_NEEDS={getState:()=>Object.assign({},values),restore:(k,n)=>{if(names[k]){values[k]=Math.max(0,Math.min(100,values[k]+n));save();render()}},version:1};
})();