/* Lagos Life phone app suite: City News, Gallery and Market. */
(function(){
 'use strict';
 const bridge=window.LAGOS_PHONE;
 if(!bridge){console.error('Phone app suite unavailable: bridge not initialized');return;}
 const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 let posts=[],businesses=[],catalog=[],life=null;
 const STORE='lagos_life_gallery_v1';
 const readGallery=()=>{try{const a=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(a)?a.slice(0,12):[]}catch(_){return[]}};
 const writeGallery=a=>{try{localStorage.setItem(STORE,JSON.stringify(a.slice(0,12)));return true}catch(_){return false}};
 const when=ts=>ts?new Date(ts).toLocaleString():'Recently';
 const appbar=name=>'<div class="phone-appbar"><button class="pb q" data-x="phoneAppBack">‹ Apps</button><div><b>'+esc(name)+'</b><small>LAGOS LIFE • APP</small></div><button class="pb q" data-x="phoneAppBack">⌂</button></div>';
 const renderNews=()=>{
  const headlines=posts.slice(0,12).map(p=>'<article class="card" style="margin:9px 0"><small>📣 COMMUNITY UPDATE · '+esc(when(p.ts))+'</small><h3 style="margin:7px 0">'+esc(p.name||'Lagos resident')+'</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(p.text||'')+'</p><small>📍 '+esc(p.area||'Lagos City')+'</small></article>').join('');
  const openings=businesses.slice(0,10).map(b=>'<article class="card" style="margin:8px 0"><b>'+esc(b.icon||'🏢')+' '+esc(b.name)+'</b><p>'+esc(b.kind)+' · '+esc(b.area)+'</p><small>Owner: '+esc(b.owner||'Lagos resident')+'</small></article>').join('');
  bridge.appview.innerHTML=appbar('News')+'<section class="card" style="background:linear-gradient(135deg,#102b43,#44305e)"><small style="letter-spacing:1.5px;color:#7dd3fc">LAGOS LIFE • CITY DESK</small><h2 style="margin:7px 0">📰 Lagos City News</h2><p>Live community headlines and new businesses across the city.</p><button class="xbtn gold" data-x="newsRefresh">↻ Refresh headlines</button></section><h3>📣 Community headlines</h3>'+(headlines||'<div class="card">No community posts yet. Check back when residents start sharing updates.</div>')+'<h3>🏢 Company openings</h3>'+(openings||'<div class="card">No player companies listed yet.</div>')+'<small style="color:#9aa8bd">Community content is supplied by players in the live city. This is an in-game news desk, not an external news service.</small>';
 };
 bridge.APPR.News=()=>{renderNews();bridge.S({t:'social_get'})};
 bridge.X.newsRefresh=()=>bridge.S({t:'social_get'});
 const renderGallery=()=>{
  const pics=readGallery();
  bridge.appview.innerHTML=appbar('Gallery')+'<section class="card" style="background:linear-gradient(135deg,#312e81,#0e7490)"><small style="letter-spacing:1.5px">LAGOS LIFE • PHOTO STUDIO</small><h2>📸 City Gallery</h2><p>Capture the current 3D city view. Photos are saved on this device.</p><button class="xbtn gold" data-x="galleryCapture">📷 Capture city view</button></section><p style="color:#aabbd0;font-size:12px">Saved photos: '+pics.length+'/12 · Stored privately in this browser</p>'+(pics.length?'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px">'+pics.map((p,i)=>'<article class="card" style="padding:7px;margin:0"><img src="'+p.src+'" alt="Lagos city screenshot" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:9px"><small>'+esc(when(p.ts))+'</small><div style="display:flex;gap:5px;margin-top:6px"><a class="xbtn gray" href="'+p.src+'" download="lagos-life-'+(i+1)+'.jpg" style="text-decoration:none;flex:1;text-align:center">Save</a><button class="xbtn red" data-x="galleryDelete" data-index="'+i+'">Delete</button></div></article>').join('')+'</div>':'<div class="card">Your gallery is empty. Capture a city view to start your collection.</div>');
 };
 bridge.APPR.Gallery=renderGallery;
 bridge.X.galleryCapture=()=>{
  try{
   const src=bridge.capturePhoto();if(!src||!src.startsWith('data:image/jpeg'))throw new Error('Screenshot unavailable');
   const pics=readGallery();pics.unshift({src,ts:Date.now()});
   if(!writeGallery(pics))throw new Error('Device storage is full. Delete an older photo and try again.');
   renderGallery();
  }catch(e){bridge.appview.insertAdjacentHTML('afterbegin','<div class="card" style="border-color:#b45353">Could not save photo: '+esc(e.message||'capture failed')+'</div>')}
 };
 bridge.X.galleryDelete=b=>{const pics=readGallery();pics.splice(+b.dataset.index,1);writeGallery(pics);renderGallery()};
 const renderMarket=()=>{
  const inv=life&&life.inv||{},items=catalog;
  const count=Object.values(inv).reduce((a,n)=>a+(+n||0),0),cash=Number(bridge.getCash())||0;
  const stock=items.map(i=>'<article class="card" style="margin:8px 0"><div style="display:flex;gap:9px;align-items:center"><b style="font-size:25px">'+esc(i.icon)+'</b><div style="flex:1"><b>'+esc(i.name)+'</b><br><small>'+esc(i.desc||i.cat||'Item')+'</small></div><b>₦'+Number(i.price||0).toLocaleString('en-NG')+'</b></div><div style="display:flex;gap:7px;align-items:center;margin-top:9px"><select data-market-qty="'+esc(i.id)+'" style="flex:1;padding:9px;border-radius:9px;background:#172033;color:white"><option value="1">Qty 1</option><option value="2">Qty 2</option><option value="5">Qty 5</option><option value="10">Qty 10</option></select><button class="xbtn gold" data-x="marketBuy" data-id="'+esc(i.id)+'">Buy</button></div></article>').join('');
  const bag=Object.entries(inv).map(([id,n])=>{const i=items.find(x=>x.id===id)||{name:id,icon:'📦',price:0};return '<div class="card" style="display:flex;gap:8px;align-items:center;margin:7px 0"><span style="font-size:22px">'+esc(i.icon)+'</span><div style="flex:1"><b>'+esc(i.name)+'</b><br><small>In bag: '+n+' · Sell value ₦'+Math.floor(i.price/2).toLocaleString('en-NG')+'</small></div><button class="xbtn gray" data-x="marketUse" data-id="'+esc(id)+'">Use</button><button class="xbtn red" data-x="marketSell" data-id="'+esc(id)+'">Sell 1</button></div>'}).join('');
  bridge.appview.innerHTML=appbar('Market')+'<section class="card" style="background:linear-gradient(135deg,#14532d,#0e7490)"><small style="letter-spacing:1.5px">LAGOS LIFE • ONLINE SHOPPING</small><h2>🛍️ Lagos Market</h2><p>Buy supplies directly from your phone, wherever you are in Lagos.</p><div style="display:flex;justify-content:space-between;gap:8px"><b>Cash: ₦'+cash.toLocaleString('en-NG')+'</b><b>Bag: '+count+'/'+(life&&life.cap||40)+'</b></div></section><h3>🛒 Shop items</h3>'+(stock||'<div class="card">Loading item catalogue…</div>')+'<h3>🎒 Your bag</h3>'+(bag||'<div class="card">Your bag is empty.</div>')+'<small style="color:#9aa8bd">Purchases and sales are checked by the game server. Buying uses the listed shop price; selling returns half the listed price.</small>';
 };
 bridge.APPR.Market=()=>{renderMarket()};
 bridge.X.marketBuy=b=>{
  const id=b.dataset.id,sel=bridge.appview.querySelector('[data-market-qty="'+id+'"]'),qty=Math.max(1,Math.min(10,Number(sel&&sel.value)||1));
  bridge.S({t:'shop',op:'buy',id,qty,source:'phone'});
 };
 bridge.X.marketSell=b=>bridge.S({t:'shop',op:'sell',id:b.dataset.id,qty:1,source:'phone'});
 bridge.X.marketUse=b=>bridge.S({t:'shop',op:'use',id:b.dataset.id,qty:1,source:'phone'});
 const OldWS=window.WebSocket;
 window.WebSocket=function(url,protos){
  const sock=protos?new OldWS(url,protos):new OldWS(url);
  sock.addEventListener('message',ev=>{
   let m;try{m=JSON.parse(ev.data)}catch(_){return}
   if(m.t==='social_feed'){posts=Array.isArray(m.posts)?m.posts:[];if(bridge.PX.app==='News'&&bridge.phoneOpen())renderNews()}
   if(m.t==='social_new'&&m.post){posts=[m.post,...posts.filter(p=>p.id!==m.post.id)].slice(0,30);if(bridge.PX.app==='News'&&bridge.phoneOpen())renderNews()}
   if(m.t==='social_update'&&m.post){posts=posts.map(p=>p.id===m.post.id?m.post:p);if(bridge.PX.app==='News'&&bridge.phoneOpen())renderNews()}
   if(m.t==='x_businesses'){businesses=Array.isArray(m.businesses)?m.businesses:[];if(bridge.PX.app==='News'&&bridge.phoneOpen())renderNews()}
   if(m.t==='catalog'){catalog=Array.isArray(m.items)?m.items:[];if(bridge.PX.app==='Market'&&bridge.phoneOpen())renderMarket()}
   if(m.t==='lifeinfo'){life=m;if(bridge.PX.app==='Market'&&bridge.phoneOpen())renderMarket()}
  });
  return sock;
 };
 window.WebSocket.prototype=OldWS.prototype;
 ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(k=>window.WebSocket[k]=OldWS[k]);
 const grid=document.getElementById('pgrid');
 if(grid){
  [['📰','News'],['📸','Gallery'],['🛍️','Market']].forEach(([icon,name])=>{
   if(grid.querySelector('[data-app="'+name+'"]'))return;
   const btn=document.createElement('button');btn.className='app';btn.dataset.app=name;btn.innerHTML='<b>'+icon+'</b>'+name;
   btn.addEventListener('click',()=>bridge.openApp(name));grid.appendChild(btn);
  });
 }
 const st=document.createElement('style');
 st.textContent='.xbtn{border:0;border-radius:9px;padding:9px 11px;font-weight:800;font-size:12px;cursor:pointer;background:#26354a;color:#f8fafc}.xbtn.gold{background:#eabf46;color:#1b2430}.xbtn.gray{background:#334155;color:#f8fafc}.xbtn.red{background:#713b46;color:#fff}';
 document.head.appendChild(st);
})();