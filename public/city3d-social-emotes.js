/* Lagos Life 3D social feed + character emotes */
(function(){
  const bridge=window.LAGOS_PHONE;
  if(!bridge){console.error('Social/emotes module unavailable: phone bridge not initialized');return;}
  const esc3=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const EMOTES=[['wave','👋','Wave'],['dance','🕺','Dance'],['cheer','🎉','Cheer'],['laugh','😂','Laugh'],['heart','❤️','Heart'],['flex','💪','Flex'],['sit','🧘','Chill']];
  let feed=[];
  const renderFeed=()=>{
    const rows=feed.map(p=>'<div class="card" style="border-left:3px solid #f6c84c"><b>👤 '+esc3(p.name)+'</b><small style="display:block;color:#9ca3af;margin:3px 0">'+esc3(p.area||'Lagos City')+' • '+new Date(p.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'</small><div style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc3(p.text)+'</div></div>').join('');
    bridge.appview.innerHTML='<div class="card" style="background:linear-gradient(135deg,#0e7490,#312e81)"><b>📸 LAGOS LIFE • CITY FEED</b><p>Share your moment with players in this city.</p><button class="xbtn gold" data-x="socialPost">＋ Create post</button> <button class="xbtn gray" data-x="socialRefresh">↻ Refresh</button></div>'+ (rows||'<div class="card">No posts yet. Be the first to post!</div>');
  };
  bridge.APPR.Social=function(){renderFeed();bridge.S({t:'social_get'})};
  bridge.X.socialPost=()=>{const text=prompt('Write a city feed post (max 180 characters):');if(text&&text.trim())bridge.S({t:'social_post',text:text.trim().slice(0,180)})};
  bridge.X.socialRefresh=()=>bridge.S({t:'social_get'});
  bridge.APPR.Emotes=function(){
    bridge.appview.innerHTML='<div class="card" style="background:linear-gradient(135deg,#7c3aed,#db2777)"><b>🎭 3D CHARACTER EMOTES</b><p>Trigger a floating 3D effect above your avatar. Nearby players see it live.</p></div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">'+EMOTES.map(e=>'<button class="app" data-x="emote" data-id="'+e[0]+'" style="min-height:76px"><b style="font-size:32px">'+e[1]+'</b>'+e[2]+'</button>').join('')+'</div>';
  };
  bridge.X.emote=b=>bridge.S({t:'emote',id:b.dataset.id});
  // New phone app tiles, added after the original grid has been drawn.
  const grid=document.getElementById('pgrid');
  if(grid){
    [['📸','Social'],['🎭','Emotes']].forEach(([ico,name])=>{
      const btn=document.createElement('button');btn.className='app';btn.dataset.app=name;btn.innerHTML='<b>'+ico+'</b>'+name;
      btn.addEventListener('click',()=>bridge.openApp(name));grid.appendChild(btn);
    });
  }
  // Listen for server-authoritative shared feed and emote events.
  const OldWS=window.WebSocket;
  window.WebSocket=function(url,protos){
    const sock=protos?new OldWS(url,protos):new OldWS(url);
    sock.addEventListener('message',ev=>{
      let m;try{m=JSON.parse(ev.data)}catch(e){return}
      if(m.t==='social_feed'){feed=Array.isArray(m.posts)?m.posts.slice(0,30):[];if(bridge.PX.app==='Social'&&bridge.phoneOpen())renderFeed()}
      if(m.t==='social_new'&&m.post){feed.unshift(m.post);feed=feed.slice(0,30);if(bridge.PX.app==='Social'&&bridge.phoneOpen())renderFeed()}
      if(m.t==='emote_fx')show3DEmote(m);
    });
    return sock;
  };
  window.WebSocket.prototype=OldWS.prototype;
  ['CONNECTING','OPEN','CLOSING','CLOSED'].forEach(k=>window.WebSocket[k]=OldWS[k]);
  function show3DEmote(m){
    if(typeof THREE==='undefined'||typeof window.scene==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,256,128);
    ctx.fillStyle='rgba(8,14,28,.82)';ctx.beginPath();if(ctx.roundRect){ctx.roundRect(18,12,220,100,28)}else{ctx.moveTo(46,12);ctx.lineTo(210,12);ctx.quadraticCurveTo(238,12,238,40);ctx.lineTo(238,84);ctx.quadraticCurveTo(238,112,210,112);ctx.lineTo(46,112);ctx.quadraticCurveTo(18,112,18,84);ctx.lineTo(18,40);ctx.quadraticCurveTo(18,12,46,12)}ctx.closePath();ctx.fill();
    ctx.strokeStyle='#f6c84c';ctx.lineWidth=4;ctx.stroke();
    const em=EMOTES.find(e=>e[0]===m.emote);ctx.font='70px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(em?em[1]:'✨',128,62);
    const tex=new THREE.CanvasTexture(canvas);tex.needsUpdate=true;
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
    sp.scale.set(3.3,1.65,1);sp.position.set(+m.x||0,2.9,+m.z||0);sp.renderOrder=1000;window.scene.add(sp);
    const labelCanvas=document.createElement('canvas');labelCanvas.width=256;labelCanvas.height=64;
    const lc=labelCanvas.getContext('2d');lc.font='bold 28px sans-serif';lc.textAlign='center';lc.fillStyle='#fff';lc.strokeStyle='#000';lc.lineWidth=5;lc.strokeText(String(m.name||'Player').slice(0,18),128,42);lc.fillText(String(m.name||'Player').slice(0,18),128,42);
    const lt=new THREE.CanvasTexture(labelCanvas);const lab=new THREE.Sprite(new THREE.SpriteMaterial({map:lt,transparent:true,depthTest:false}));
    lab.scale.set(2.8,.7,1);lab.position.set(sp.position.x,sp.position.y+1.15,sp.position.z);lab.renderOrder=1001;window.scene.add(lab);
    const start=performance.now(),base=sp.position.y;
    const anim=()=>{if(!sp.parent)return;const t=(performance.now()-start)/1000;sp.position.y=base+Math.sin(t*5)*.18;lab.position.y=sp.position.y+1.15;sp.material.opacity=Math.max(0,1-t/2.8);lab.material.opacity=sp.material.opacity;if(t>=2.8){window.scene.remove(sp);window.scene.remove(lab);tex.dispose();lt.dispose();sp.material.dispose();lab.material.dispose();return}requestAnimationFrame(anim)};
    requestAnimationFrame(anim);
  }
})();