/* Citygame City Guide: searchable directory of generated Lagos buildings. */
(function(){
 'use strict';
 const phone=window.LAGOS_PHONE, catalog=window.Buildings;
 if(!phone||!catalog){console.warn('City Guide skipped: game bridge not ready');return;}
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const all=()=>catalog.list().map(b=>({name:b.name,area:b.area,type:b.type,icon:(catalog.TYPES[b.type]||{}).icon||'📍',label:(catalog.TYPES[b.type]||{}).label||b.type}));
 let term='',kind='all',rows=[];
 function render(){
  rows=all();
  const types=[...new Set(rows.map(x=>x.type))].sort();
  const filtered=rows.filter(x=>(kind==='all'||x.type===kind)&&(!term||(x.name+' '+x.area+' '+x.label).toLowerCase().includes(term)));
  const counts=types.map(t=>({t,n:rows.filter(x=>x.type===t).length}));
  phone.appview.innerHTML='<section class="cg-guide"><header><small>LAGOS LIFE • CITY DIRECTORY</small><h2>📍 Explore Lagos</h2><p>'+rows.length.toLocaleString()+' places across the city</p></header><input id="cgGuideSearch" placeholder="Search a place or neighbourhood…" value="'+esc(term)+'"><div class="cg-guide-filters"><button data-kind="all" class="'+(kind==='all'?'active':'')+'">All</button>'+counts.map(x=>'<button data-kind="'+esc(x.t)+'" class="'+(kind===x.t?'active':'')+'">'+esc((catalog.TYPES[x.t]||{}).icon||'📍')+' '+esc((catalog.TYPES[x.t]||{}).label||x.t)+' <small>'+x.n+'</small></button>').join('')+'</div><div class="cg-guide-results"><b>'+filtered.length+' matching places</b>'+filtered.slice(0,100).map(x=>'<article><span>'+esc(x.icon)+'</span><div><b>'+esc(x.name)+'</b><small>'+esc(x.label)+' · '+esc(x.area)+'</small></div></article>').join('')+(filtered.length>100?'<p class="cg-guide-note">Showing first 100 results. Refine your search to narrow it down.</p>':'')+(filtered.length?'':'<p class="cg-guide-note">No places match that search.</p>')+'</div></section>';
  const input=document.getElementById('cgGuideSearch');
  if(input)input.addEventListener('input',()=>{term=input.value.toLowerCase().trim();const p=input.selectionStart;render();const next=document.getElementById('cgGuideSearch');next.focus();next.setSelectionRange(p,p)});
  phone.appview.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>{kind=b.dataset.kind;render()}));
 }
 phone.APPR.CityGuide=render;
 const css=document.createElement('style');
 css.textContent='.cg-guide{color:#edf5ff;padding:4px}.cg-guide header{padding:15px;border-radius:15px;background:linear-gradient(135deg,#123b4a,#26345d);margin-bottom:10px}.cg-guide header small{font-size:9px;letter-spacing:1.7px;color:#5eead4;font-weight:800}.cg-guide h2{font-size:21px;margin:7px 0}.cg-guide p{font-size:11px;color:#a8bed1;margin:4px 0}.cg-guide>input{box-sizing:border-box;width:100%;padding:12px;border-radius:10px;border:1px solid #3b536b;background:#101d2c;color:#fff;margin:4px 0 10px}.cg-guide-filters{display:flex;gap:6px;overflow-x:auto;padding:2px 0 9px}.cg-guide-filters button{white-space:nowrap;border:1px solid #3b536b;background:#17283a;color:#dce9f6;border-radius:20px;padding:7px 10px;font-size:10px}.cg-guide-filters button.active{background:#075985;border-color:#38bdf8}.cg-guide-filters small{opacity:.7}.cg-guide-results{background:#101d2c;border:1px solid #26394e;border-radius:12px;padding:10px}.cg-guide-results> b{font-size:11px;color:#5eead4}.cg-guide-results article{display:flex;gap:10px;align-items:center;padding:10px 2px;border-bottom:1px solid #26394e}.cg-guide-results article>span{font-size:20px}.cg-guide-results article b,.cg-guide-results article small{display:block}.cg-guide-results article b{font-size:11px}.cg-guide-results article small{font-size:10px;color:#9eb1c6;margin-top:3px}.cg-guide-note{padding:12px;text-align:center;color:#9eb1c6}';
 document.head.appendChild(css);
 const grid=document.getElementById('pgrid');
 if(grid&&!grid.querySelector('[data-app="CityGuide"]')){const b=document.createElement('button');b.className='app';b.dataset.app='CityGuide';b.innerHTML='<b>🧭</b>City Guide';b.addEventListener('click',()=>phone.openApp('CityGuide'));grid.appendChild(b)}
})();