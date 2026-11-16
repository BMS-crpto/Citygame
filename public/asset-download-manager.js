(()=>{'use strict';
const CACHE='citygame-assets-v1';
const css=`
#assetdl{position:fixed;inset:0;z-index:30;display:none;background:#050912ed;color:#f5f7ff;padding: max(16px,env(safe-area-inset-top)) 14px max(18px,env(safe-area-inset-bottom));overflow:auto;font:14px system-ui}
#assetdl.show{display:block}#assetdl .wrap{max-width:680px;margin:0 auto}
#assetdl h2{margin:4px 0;font-size:24px}#assetdl .muted{color:#aab4c7;font-size:12px}
#assetdl .pack{background:#151d2b;border:1px solid #303c50;border-radius:16px;padding:13px;margin:10px 0}
#assetdl .pack h3{margin:0 0 4px;font-size:16px}#assetdl .pack p{margin:4px 0 10px;color:#b8c2d3;font-size:12px}
#assetdl .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#assetdl button{font-size:13px;padding:9px 13px;border-radius:10px;cursor:pointer}
#assetdl progress{width:100%;height:8px;margin-top:10px;accent-color:#8b5cf6}
#assetdl .status{font-size:11px;color:#b8c2d3;margin-top:6px}
#assetdl .close{background:#293448;color:white;float:right}
#assetdl .primary{background:#ffd54a;color:#171717}
`;
const style=document.createElement('style');style.textContent=css;document.head.append(style);
const root=document.createElement('section');root.id='assetdl';root.innerHTML='<div class="wrap"><button class="close" id="assetClose">Close</button><h2>Citygame downloads</h2><div class="muted">Download 3D content once. The cached page shell and saved 3D models remain on this device. The full game may still need internet for external libraries, accounts, multiplayer and live services.</div><div id="assetStorage" class="status">Checking device storage…</div><div id="assetPacks"></div><div class="muted">The Lagos road/map dataset is not yet included as a downloadable pack. These are the 3D models already present in the project; pack sizes are estimates.</div></div>';
document.body.append(root);
const cacheName=CACHE;
const open=()=>{root.classList.add('show');refresh()};
const close=()=>root.classList.remove('show');
document.getElementById('assetClose').onclick=close;
const button=document.createElement('button');button.textContent='⬇ Downloads';button.id='assetOpen';button.style.cssText='position:fixed;z-index:8;top:max(46px,calc(env(safe-area-inset-top) + 90px));right:8px;padding:8px 11px;border-radius:12px;font-size:12px;background:#111827;color:white;border:1px solid #8b5cf6';
button.onclick=open;document.body.append(button);
async function refresh(){
 const c=await caches.open(cacheName),keys=await c.keys();
 let estimate='';try{const e=await navigator.storage.estimate();estimate=e.usage?((e.usage/1048576).toFixed(1)+' MB used'):'';if(e.quota)estimate+=' · '+(e.quota/1048576).toFixed(0)+' MB available quota'}catch{}
 document.getElementById('assetStorage').textContent='Saved locally: '+keys.length+' files'+(estimate?' · '+estimate:'');
 const data=await fetch('/asset-packs.json').then(r=>{if(!r.ok)throw Error('Manifest unavailable');return r.json()});
 const host=document.getElementById('assetPacks');host.innerHTML='';
 for(const p of data.packs){
  const saved=(await Promise.all(p.assets.map(async u=>!!await c.match(u)))).filter(Boolean).length;
  const card=document.createElement('article');card.className='pack';
  const h=document.createElement('h3');h.textContent=p.name;card.append(h);
  const desc=document.createElement('p');desc.textContent=p.description+' · '+p.sizeLabel;card.append(desc);
  const actions=document.createElement('div');actions.className='actions';
  const b=document.createElement('button');b.className='primary';b.textContent=saved===p.assets.length?'Downloaded ✓':saved?'Resume download':'Download pack';actions.append(b);
  const del=document.createElement('button');del.className='close';del.textContent='Remove';del.disabled=!saved;actions.append(del);
  card.append(actions);const progress=document.createElement('progress');progress.max=p.assets.length;progress.value=saved;card.append(progress);
  const status=document.createElement('div');status.className='status';status.textContent=saved+' / '+p.assets.length+' files saved';card.append(status);host.append(card);
  b.onclick=async()=>{b.disabled=true;let done=saved;progress.value=done;try{const cache=await caches.open(cacheName);for(const url of p.assets){if(await cache.match(url))continue;status.textContent='Downloading '+(done+1)+' of '+p.assets.length+'…';const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('Download failed: '+url+' ('+response.status+')');await cache.put(url,response.clone());done++;progress.value=done;status.textContent=done+' / '+p.assets.length+' files saved';}b.textContent='Downloaded ✓';}catch(e){status.textContent=e.message+' — tap Resume download to continue.';b.textContent='Resume download';}finally{b.disabled=false;del.disabled=!done;document.getElementById('assetStorage').textContent='Download progress saved on this device.'}};
  del.onclick=async()=>{const cache=await caches.open(cacheName);for(const url of p.assets)await cache.delete(url);refresh()};
 }
}
if('serviceWorker'in navigator && location.protocol==='https:'){
 navigator.serviceWorker.register('/asset-cache-worker.js').then(async()=>{await navigator.serviceWorker.ready;try{if(navigator.storage&&navigator.storage.persist)await navigator.storage.persist()}catch(_){};}).catch(e=>console.warn('Asset cache worker unavailable',e));
}
})();