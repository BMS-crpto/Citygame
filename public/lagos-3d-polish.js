/* Lagos Life: world-space rendering polish, designed for the existing Three.js city */
(function(){
 'use strict';
 try{
   if(typeof THREE==='undefined'||typeof window.scene==='undefined'||typeof renderer==='undefined')return;
   // Explicit color pipeline makes material colors and textures more consistent across Android browsers.
   if('outputColorSpace' in renderer&&THREE.SRGBColorSpace)renderer.outputColorSpace=THREE.SRGBColorSpace;else if(THREE.sRGBEncoding)renderer.outputEncoding=THREE.sRGBEncoding;
   renderer.toneMapping=THREE.ACESFilmicToneMapping;
   renderer.toneMappingExposure=1.0;
   renderer.shadowMap.enabled=!(window.CITYGAME_MOBILE||(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)));
   renderer.shadowMap.type=THREE.PCFSoftShadowMap;
   // Two low-intensity practical fill lights add depth to the existing city materials without
   // changing gameplay positions, collisions, or server-authoritative player state.
   const fillA=new THREE.PointLight(0x8bdde8,0.08,125,2);
   fillA.position.set(18,18,24);fillA.castShadow=false;window.scene.add(fillA);
   const fillB=new THREE.PointLight(0xffc887,0.06,110,2);
   fillB.position.set(-30,12,-18);fillB.castShadow=false;window.scene.add(fillB);
   // Refine reflective materials already used by cars, character accessories and premium props.
   window.scene.traverse(o=>{
     if(!o.isMesh||!o.material)return;
     const mats=Array.isArray(o.material)?o.material:[o.material];
     mats.forEach(m=>{
       if(m&&m.isMeshPhongMaterial){
         m.shininess=Math.max(28,Math.min(95,m.shininess||40));
         if(m.specular&&m.specular.getHex()===0)m.specular.setHex(0x252a30);
       }
       if(m&&m.isMeshStandardMaterial){
         m.roughness=Math.max(0.38,Math.min(0.88,m.roughness==null?0.68:m.roughness));
         m.metalness=Math.max(0,Math.min(0.22,m.metalness==null?0:m.metalness));
       }
     });
   });
   // Keep the scene treatment subtle on smaller devices: retain the current renderer DPR cap.
   renderer.domElement.style.filter='contrast(1.08) saturate(1.12) brightness(0.98)';
 }catch(err){console.warn('Lagos 3D polish safely skipped:',err)}
})();