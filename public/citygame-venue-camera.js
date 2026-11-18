/* Citygame venue camera state and compact view selector. Loaded before the game loop. */
(function(root){
  'use strict';
  const allowed=new Set(['above','inside','eyes']);
  let mode='inside';
  function paint(){
    document.querySelectorAll('#venueViews [data-cg-view]').forEach(button=>{
      const active=button.dataset.cgView===mode;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
  }
  function setMode(next){
    if(!allowed.has(next))return false;
    mode=next;
    paint();
    root.dispatchEvent(new CustomEvent('citygame:venue-camera-change',{detail:{mode}}));
    return true;
  }
  root.CitygameVenueCamera={get mode(){return mode;},setMode};
  document.addEventListener('click',event=>{
    const button=event.target.closest('#venueViews [data-cg-view]');
    if(button)setMode(button.dataset.cgView);
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint,{once:true});
  else paint();
})(window);
