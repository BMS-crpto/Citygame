/* Citygame environment pass: gentle daylight balance and material consistency. */
(function(){
 'use strict';
 try{
  if(!window.THREE||!window.scene)return;
  const scene=window.scene;
  const hemi=new THREE.HemisphereLight(0xd9efff,0x675442,0.10);
  hemi.position.set(0,120,0);scene.add(hemi);
  const fill=new THREE.DirectionalLight(0xffe2b8,0.06);
  fill.position.set(-55,95,42);fill.castShadow=false;scene.add(fill);
  scene.traverse(function(o){
   if(!o.isMesh||o.isInstancedMesh||!o.material)return;
   const mats=Array.isArray(o.material)?o.material:[o.material];
   mats.forEach(function(m){
    if(!m)return;
    if(m.isMeshStandardMaterial){m.roughness=Math.max(.48,Math.min(.9,m.roughness==null?.72:m.roughness));m.metalness=Math.min(.16,m.metalness||0);}
    if(m.isMeshPhongMaterial){m.shininess=Math.max(12,Math.min(60,m.shininess||24));}
    m.needsUpdate=true;
   });
  });
 }catch(e){console.warn('Citygame environment polish safely skipped:',e);}
})();