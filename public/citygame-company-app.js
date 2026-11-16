/* Citygame Company phone app: register and manage a player-owned Lagos business. */
(function(){
 'use strict';
 const bridge=window.LAGOS_PHONE;
 if(!bridge){console.warn('Company app: phone bridge not ready');return;}
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>'₦'+Math.max(0,Math.floor(Number(v)||0)).toLocaleString('en-NG');
 const kinds=[['restaurant','🍲 Restaurant'],['fashion','👗 Fashion store'],['tech','📱 Tech shop'],['supermarket','🛒 Supermarket'],['salon','💇🏾 Salon'],['lounge','🎶 Lounge'],['carwash','🚗 Car wash'],['pharmacy','💊 Pharmacy']];
 const roles=[['cashier','Cashier'],['manager','Manager'],['security','Security'],['cleaner','Cleaner'],['stylist','Stylist'],['chef','Chef']];
 let businesses=[];
 const css=document.createElement('style');
 css.textContent='.cgCoHero{padding:15px;border-radius:15px;background:linear-gradient(135deg,#102e43,#24466a);border:1px solid #42617d;margin-bottom:10px}.cgCoHero h2{margin:5px 0}.cgCoGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:9px 0}.cgCoStat{background:#17263a;border:1px solid #344860;border-radius:12px;padding:10px;min-width:0}.cgCoStat small{display:block;color:#a7b9cc;font-size:10px}.cgCoStat b{display:block;margin-top:4px;font-size:16px;overflow-wrap:anywhere}.cgCoField{display:grid;gap:5px;margin:9px 0}.cgCoField label{font-size:11px;color:#bdcadd}.cgCoField input,.cgCoField select{width:100%;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid #43566f;background:#0d1928;color:#fff;font:inherit}.cgCoActions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.cgCoActions button{flex:1 1 42%}.cgCoStaff{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px;background:#17263a;border-radius:10px;margin:6px 0}.cgCoNote{font-size:11px;color:#a9bbcf;line-height:1.5}.cgCoWarn{color:#ffd36c;font-size:11px}';
 document.head.append(css);
 const kindsHtml=()=>kinds.map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('');
 function areas(){
  try{
   const list=window.Buildings&&window.Buildings.list?window.Buildings.list():[];
   return [...new Set(list.filter(b=>b&&b.type!=='home'&&b.type!=='terminal').map(b=>b.area).filter(Boolean))].sort();
  }catch(_){return ['Victoria Island','Lekki Phase 1','Ikeja GRA','Yaba','Surulere','Ajah','Eko Atlantic'];}
 }
 function appbar(){return '<div class="phone-appbar"><button class="pb q" data-x="phoneAppBack">‹ Apps</button><div><b>Company</b><small>CITYGAME BUSINESS CENTRE</small></div><button class="pb q" data-x="phoneAppBack">⌂</button></div>'}
 function renderCreate(){
  const list=areas();
  bridge.appview.innerHTML=appbar()+
   '<section class="cgCoHero"><small>🏢 START YOUR LAGOS BUSINESS</small><h2>Become a business owner</h2><p class="cgCoNote">Register a company from your phone, choose a Lagos area and manage your staff without visiting an office.</p><b>Registration fee: ₦150,000</b></section>'+
   '<section class="card"><div class="cgCoField"><label for="cgCoName">Business name</label><input id="cgCoName" maxlength="28" placeholder="e.g. Mainland Fresh Foods"></div>'+
   '<div class="cgCoField"><label for="cgCoKind">Business type</label><select id="cgCoKind">'+kindsHtml()+'</select></div>'+
   '<div class="cgCoField"><label for="cgCoArea">Business location</label><select id="cgCoArea">'+list.map(a=>'<option value="'+esc(a)+'">'+esc(a)+'</option>').join('')+'</select></div>'+
   '<div class="cgCoWarn">You need at least ₦150,000. Each player can own one company.</div><div class="cgCoActions"><button class="xbtn gold" data-x="companyCreate">Register company</button></div></section>'+
   '<div class="cgCoNote">Available company locations are existing commercial building areas in the game. A specific empty building is assigned by the server when you register.</div>';
 }
 function renderOwned(b){
  const staff=Array.isArray(b.staff)?b.staff:[];
  bridge.appview.innerHTML=appbar()+
   '<section class="cgCoHero"><small>🏢 YOUR COMPANY</small><h2>'+esc(b.icon||'🏬')+' '+esc(b.name)+'</h2><p class="cgCoNote">'+esc(b.kind)+' · '+esc(b.area)+'<br>📍 '+esc(b.locationName||'Lagos')+'</p><div class="cgCoActions"><button class="xbtn gold" data-x="companyCollect">Collect earnings</button><button class="xbtn gray" data-x="companyRefresh">Refresh</button></div></section>'+
   '<div class="cgCoGrid"><div class="cgCoStat"><small>Company balance</small><b>'+money(b.balance)+'</b></div><div class="cgCoStat"><small>Customers served</small><b>'+Number(b.customers||0).toLocaleString()+'</b></div><div class="cgCoStat"><small>Staff members</small><b>'+staff.length+' / 10</b></div><div class="cgCoStat"><small>Business rating</small><b>'+Math.max(0,Math.min(100,Number(b.quality)||0))+'%</b></div></div>'+
   '<section class="card"><h3>Company settings</h3><div class="cgCoField"><label for="cgCoRename">Change business name</label><input id="cgCoRename" maxlength="28" value="'+esc(b.name)+'"></div><div class="cgCoActions"><button class="xbtn gray" data-x="companyRename">Save name</button></div></section>'+
   '<section class="card"><h3>Hire staff</h3><p class="cgCoNote">Hire a worker for ₦10,000. Staff help your company serve more customers.</p><div class="cgCoField"><label for="cgCoRole">Staff role</label><select id="cgCoRole">'+roles.map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('')+'</select></div><div class="cgCoActions"><button class="xbtn gold" data-x="companyHire" '+(staff.length>=10?'disabled':'')+'>Hire staff · ₦10,000</button></div></section>'+
   '<section class="card"><h3>Staff roster</h3>'+(staff.length?staff.map((s,i)=>'<div class="cgCoStaff"><span><b>'+esc(s.name||s.role||'Staff member')+'</b><br><small>'+esc(s.role||'Worker')+'</small></span><button class="xbtn red" data-x="companyFire" data-index="'+i+'">Remove</button></div>').join(''):'<p class="cgCoNote">No staff hired yet.</p>')+'</section>'+
   '<div class="cgCoNote">Customers and company earnings are simulated by the game server. Your company is attached to this building location.</div>';
 }
 function render(){
  const own=businesses.find(b=>b&&b.isMine);
  if(own)renderOwned(own);else renderCreate();
 }
 bridge.APPR.Company=()=>{render();bridge.S({t:'business'})};
 bridge.X.companyCreate=()=>{
  const name=(bridge.appview.querySelector('#cgCoName')||{}).value||'';
  const kind=(bridge.appview.querySelector('#cgCoKind')||{}).value||'restaurant';
  const area=(bridge.appview.querySelector('#cgCoArea')||{}).value||'';
  if(name.trim().length<3){bridge.appview.querySelector('#cgCoName')?.focus();return}
  bridge.S({t:'business',op:'create',name:name.trim(),kind,area});
  bridge.appview.innerHTML=appbar()+'<section class="card">Registering your company…</section>';
 };
 bridge.X.companyCollect=()=>bridge.S({t:'business',op:'collect'});
 bridge.X.companyRename=()=>{
  const name=(bridge.appview.querySelector('#cgCoRename')||{}).value||'';
  if(name.trim().length<3)return;
  bridge.S({t:'business',op:'rename',name:name.trim()});
 };
 bridge.X.companyHire=()=>{
  const role=(bridge.appview.querySelector('#cgCoRole')||{}).value||'cashier';
  bridge.S({t:'business',op:'hire',role});
 };
 bridge.X.companyFire=b=>bridge.S({t:'business',op:'fire',index:Number(b.dataset.index)});
 bridge.X.companyRefresh=()=>bridge.S({t:'business'});
 const OldWS=window.WebSocket;
 window.WebSocket=function(url,protocols){
  const sock=protocols?new OldWS(url,protocols):new OldWS(url);
  sock.addEventListener('message',ev=>{
   let m;try{m=JSON.parse(ev.data)}catch(_){return}
   if(m.t==='x_businesses'){
    businesses=Array.isArray(m.businesses)?m.businesses:[];
    if(bridge.PX.app==='Company'&&bridge.phoneOpen())render();
   }
  });
  return sock;
 };
 window.WebSocket.prototype=OldWS.prototype;
 ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(k=>window.WebSocket[k]=OldWS[k]);
 const grid=document.getElementById('pgrid');
 if(grid&&!grid.querySelector('[data-app="Company"]')){
  const btn=document.createElement('button');btn.className='app';btn.dataset.app='Company';btn.innerHTML='<b>🏢</b>Company';btn.addEventListener('click',()=>bridge.openApp('Company'));grid.append(btn);
 }
})();
