(()=>{'use strict';
// No manual asset-pack screen. Register the service worker so game files,
// including GLB models, are cached automatically as the player uses them.
if(!('serviceWorker'in navigator)||location.protocol!=='https:')return;
navigator.serviceWorker.register('/asset-cache-worker.js')
 .then(()=>navigator.serviceWorker.ready)
 .then(()=>{try{navigator.storage?.persist?.()}catch(_){};})
 .catch(error=>console.warn('Citygame background asset cache unavailable:',error));
})();
