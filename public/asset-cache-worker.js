'use strict';
const SHELL='citygame-shell-v4';
const ASSETS='citygame-assets-v1';
const SHELL_FILES=['/','/index.html','/asset-packs.json','/buildings.js','/lagos-3d-skin.css','/citygame-premium-ui.css','/mobile-controls.css','/city3d-social-emotes.js','/city-missions-career.js','/city-app-suite.js','/citygame-company-app.js','/lagos-3d-polish.js','/citygame-world-finish.js','/citygame-city-guide.js','/citygame-map-experience.js','/player-account-center.js','/asset-download-manager.js'];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  await Promise.all(SHELL_FILES.map(async path=>{
   try{const response=await fetch(path,{cache:'reload'});if(response.ok)await cache.put(path,response)}catch(error){console.warn('Offline shell item skipped:',path,error)}
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const names=await caches.keys();
 await Promise.all(names.filter(name=>name.startsWith('citygame-shell-')&&name!==SHELL).map(name=>caches.delete(name)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 if(/\.(?:glb|png|jpe?g|webp|avif|ktx2|basis|mp3|ogg|wav|woff2?|ttf|otf)$/i.test(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(ASSETS);
   const cached=await cache.match(request,{ignoreSearch:true});
   if(cached)return cached;
   const response=await fetch(request);
   if(response.ok)await cache.put(request,response.clone());
   return response;
  })());
  return;
 }
 if(request.mode==='navigate'){
  event.respondWith((async()=>{
   const cache=await caches.open(SHELL);
   try{
    const response=await fetch(request);
    if(response.ok)await cache.put('/index.html',response.clone());
    return response;
   }catch(error){return (await cache.match('/index.html'))||Response.error()}
  })());
  return;
 }
 if(/\.(?:js|css|json)$/i.test(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(SHELL);
   try{
    const response=await fetch(request);
    if(response.ok)await cache.put(url.pathname,response.clone());
    return response;
   }catch(error){return (await cache.match(url.pathname))||Response.error()}
  })());
 }
});
