/* Citygame 3D Isometric Map
 * A lightweight Three.js overview built from the same world destination coordinates.
 * Keeps the existing destination directory and GPS handlers; no gameplay state is changed.
 */
(function () {
  'use strict';
  if (window.CG_ISOMETRIC_MAP_READY) return;
  if (!window.THREE || typeof window.placesList !== 'function') {
    console.warn('Citygame isometric map: Three.js or destination directory unavailable');
    return;
  }
  window.CG_ISOMETRIC_MAP_READY = true;

  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const state = { active: false, raf: 0, renderer: null, scene: null, camera: null,
    canvas: null, yaw: Math.PI / 4, pitch: 0.72, zoom: 1, target: new THREE.Vector3(),
    drag: null, moved: false, places: [], pickables: [], marker: null, lastResize: '' };
  const root = document.getElementById('bigmap');
  const legacy = document.getElementById('bmc');
  if (!root || !legacy) return;

  const style = document.createElement('style');
  style.textContent = `
    #cgIsoMap{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;touch-action:none;outline:0}
    #bmc{display:none!important}
    #cgIsoTools{position:absolute;left:12px;top:12px;z-index:4;display:flex;gap:7px;align-items:center}
    #cgIsoTools button{padding:8px 12px;border:1px solid #ffffff35;border-radius:12px;background:#102338eF;color:#fff;font:800 13px system-ui;min-width:40px;box-shadow:0 4px 14px #0005}
    #cgIsoHint{font:700 10px system-ui;color:#e8f4f2;background:#102338c9;padding:8px 10px;border-radius:10px;letter-spacing:.3px}
    #cgIsoMap canvas{touch-action:none}
    @media(max-width:700px){#cgIsoTools{top:10px;left:10px}#cgIsoHint{max-width:145px;font-size:9px}}
  `;
  document.head.appendChild(style);

  const canvas = document.createElement('canvas');
  canvas.id = 'cgIsoMap';
  canvas.setAttribute('aria-label', 'Interactive three-dimensional isometric Lagos city map');
  root.insertBefore(canvas, root.firstChild);
  const tools = document.createElement('div');
  tools.id = 'cgIsoTools';
  tools.innerHTML = '<button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-view="reset">Reset view</button><span id="cgIsoHint">Drag to rotate · Tap a building to navigate</span>';
  root.appendChild(tools);

  function districtColor(x, z) {
    if (x >= 4) return z < 0 ? 0x456f62 : 0x3d7965;
    if (x <= -4) return z < 0 ? 0x68745b : 0x4c7059;
    if (z <= -4) return 0x526c64;
    if (z >= 4) return 0x527c62;
    return 0x477866;
  }
  function material(color, roughness) {
    return new THREE.MeshStandardMaterial({ color, roughness: roughness == null ? 0.88 : roughness, metalness: 0.02 });
  }
  function labelSprite(text) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(7,20,31,.88)';
    ctx.beginPath(); ctx.roundRect(8, 8, 496, 80, 24); ctx.fill();
    ctx.strokeStyle = 'rgba(112,222,204,.8)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4faf8'; ctx.fillText(String(text).slice(0, 28), 256, 49);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
    sprite.scale.set(18, 3.4, 1);
    return sprite;
  }
  function buildWorld() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1b25);
    scene.fog = new THREE.Fog(0x0a1b25, 950, 1850);
    scene.add(new THREE.HemisphereLight(0xc9e9ff, 0x345344, 1.45));
    const sun = new THREE.DirectionalLight(0xffe0b0, 1.25);
    sun.position.set(-420, 760, 340); scene.add(sun);
    const fill = new THREE.DirectionalLight(0x83c9e7, 0.42);
    fill.position.set(420, 250, -500); scene.add(fill);

    const land = new THREE.Group(); scene.add(land);
    const tileGeo = new THREE.BoxGeometry(62, 1.2, 62);
    const tileColors = [0x477866,0x456f62,0x3d7965,0x68745b,0x526c64,0x527c62];
    const tiles = new THREE.InstancedMesh(tileGeo, material(0xffffff), 576);
    const dummy = new THREE.Object3D();
    let n = 0;
    for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) {
      const idx = x >= 4 ? (z < 0 ? 1 : 2) : x <= -4 ? (z < 0 ? 3 : 0) : z <= -4 ? 4 : z >= 4 ? 5 : 0;
      dummy.position.set(x * 64 + 32, -0.8, z * 64 + 32); dummy.updateMatrix();
      tiles.setMatrixAt(n, dummy.matrix); tiles.setColorAt(n, new THREE.Color(tileColors[idx])); n++;
    }
    tiles.instanceMatrix.needsUpdate = true;
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
    tiles.receiveShadow = true; scene.add(tiles);

    const roadMat = material(0x303a42, 0.98);
    const sidewalkMat = material(0xb8b4a8, 0.95);
    const curbMat = material(0xe0d8c8, 0.9);
    for (let i = -12; i <= 12; i++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(1580, 0.35, 12), roadMat);
      h.position.set(0, 0.05, i * 64); scene.add(h);
      const v = new THREE.Mesh(new THREE.BoxGeometry(12, 0.35, 1580), roadMat);
      v.position.set(i * 64, 0.05, 0); scene.add(v);
      for (const side of [-1, 1]) {
        const hs = new THREE.Mesh(new THREE.BoxGeometry(1580, 0.24, 2.4), sidewalkMat);
        hs.position.set(0, 0.24, i * 64 + side * 8.8); scene.add(hs);
        const vs = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.24, 1580), sidewalkMat);
        vs.position.set(i * 64 + side * 8.8, 0.24, 0); scene.add(vs);
        const hc = new THREE.Mesh(new THREE.BoxGeometry(1580, 0.42, 0.42), curbMat);
        hc.position.set(0, 0.28, i * 64 + side * 7.4); scene.add(hc);
        const vc = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 1580), curbMat);
        vc.position.set(i * 64 + side * 7.4, 0.28, 0); scene.add(vc);
      }
    }
    const yellow = material(0xf1cf54, 0.72);
    for (let i = -12; i <= 12; i++) for (const off of [-1.2,1.2]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(1580, 0.08, 0.16), yellow);
      a.position.set(0, 0.27, i * 64 + off); scene.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 1580), yellow);
      b.position.set(i * 64 + off, 0.27, 0); scene.add(b);
    }

    // Water channel is a deliberate visual district divider on the map, not a GPS overlay.
    const water = new THREE.Mesh(new THREE.BoxGeometry(1580, 0.7, 28), material(0x176b9a, 0.34));
    water.position.set(0, -0.1, 176); scene.add(water);
    const bank = material(0x8b9b83);
    for (const side of [-1,1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1580, 0.6, 1.2), bank);
      edge.position.set(0, 0.18, 176 + side * 15); scene.add(edge);
    }

    const places = (window.placesList() || []).filter(p => Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.z)));
    state.places = places;
    state.pickables = [];
    const palette = [0xc8d0d0,0xd7c8b3,0x9eb5c1,0xd8d1c3,0xb7c9bd,0xd2b9a7,0x9daebd,0xe0d6c4];
    places.forEach((p, i) => {
      const name = String(p.name || 'Lagos destination');
      const landmark = /hotel|tower|mall|bank|court|hospital|airport|plaza|library|school|lounge|salon|station/i.test(name);
      const w = landmark ? 17 + (i % 3) * 2 : 10 + (i % 4) * 1.8;
      const d = landmark ? 15 + (i % 2) * 3 : 9 + (i % 3) * 1.5;
      const h = landmark ? 16 + (i % 5) * 5 : 5 + (i % 4) * 2.5;
      const base = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 1.4, d + 1.2), material(0x4b5660));
      base.position.set(Number(p.x), 0.95, Number(p.z)); scene.add(base);
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(palette[i % palette.length]));
      body.position.set(Number(p.x), 1.6 + h / 2, Number(p.z)); body.castShadow = true; body.receiveShadow = true;
      body.userData.placeId = p.id; body.userData.placeName = name; scene.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.8, d + 0.7), material(landmark ? 0x34495b : 0x555b60));
      roof.position.set(Number(p.x), h + 2, Number(p.z)); scene.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1.6,w*0.16), Math.max(2.5,h*0.28), 0.18), material(0x263849));
      door.position.set(Number(p.x), 1.7 + Math.max(2.5,h*0.14), Number(p.z) + d/2 + 0.1); scene.add(door);
      body.userData.placeId = p.id;
      state.pickables.push(body);
      if (landmark || i % 3 === 0) {
        const label = labelSprite(name);
        label.position.set(Number(p.x), h + 7, Number(p.z));
        scene.add(label);
      }
    });

    // Small roadside tree groves and light poles, all instanced to keep the overview inexpensive.
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1.0, 8, 6);
    trunkGeo.translate(0,4,0);
    const leafGeo = new THREE.SphereGeometry(4.5, 7, 6);
    const trunkMat = material(0x6a5138), leafMat = material(0x287d45);
    const trunks = [], crowns = [], poles = [];
    for (let i=-12;i<=12;i++) for(let j=-12;j<=12;j++) {
      if ((i+j)%3===0) {
        const x=i*64+15,z=j*64+17;
        trunks.push([x,0,z]); crowns.push([x,8,z]);
      }
      if ((i*7+j*3)%5===0) poles.push([i*64+13,0,j*64+13]);
    }
    function addInstances(geo, mat, arr) {
      const mesh = new THREE.InstancedMesh(geo, mat, arr.length), o = new THREE.Object3D();
      arr.forEach((p,i)=>{o.position.set(p[0],p[1],p[2]);o.updateMatrix();mesh.setMatrixAt(i,o.matrix)});
      mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);
    }
    addInstances(trunkGeo,trunkMat,trunks); addInstances(leafGeo,leafMat,crowns);
    const poleGeo = new THREE.CylinderGeometry(0.22,0.3,13,6); poleGeo.translate(0,6.5,0);
    addInstances(poleGeo,material(0x39434c),poles);
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9,6,5), material(0xffdf9b), poles.length);
    const o = new THREE.Object3D();
    poles.forEach((p,i)=>{o.position.set(p[0]+1.6,13,p[2]);o.updateMatrix();bulbs.setMatrixAt(i,o.matrix)});
    bulbs.instanceMatrix.needsUpdate=true;scene.add(bulbs);

    const me = typeof window.CG_ME === 'function' ? window.CG_ME() : null;
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5,0.8,6,28), new THREE.MeshBasicMaterial({color:0x55f0d0}));
    ring.rotation.x = Math.PI/2; marker.add(ring);
    const pin = new THREE.Mesh(new THREE.ConeGeometry(2.2,7,8), new THREE.MeshBasicMaterial({color:0xffdf68}));
    pin.position.y=6; marker.add(pin);
    if (me) marker.position.set(me.position.x,1,me.position.z);
    scene.add(marker); state.marker=marker;
    return scene;
  }

  function resize() {
    if (!state.renderer || !canvas.clientWidth || !canvas.clientHeight) return;
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
    const sig = [w,h,dpr].join(':');
    if (sig === state.lastResize) return;
    state.lastResize = sig;
    state.renderer.setPixelRatio(dpr); state.renderer.setSize(w,h,false);
    state.camera.left = -w / 2; state.camera.right = w / 2;
    state.camera.top = h / 2; state.camera.bottom = -h / 2;
    state.camera.updateProjectionMatrix();
  }
  function placeCamera() {
    const distance = 1050 / state.zoom;
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    state.camera.position.set(
      state.target.x + Math.sin(state.yaw) * distance * cp,
      state.target.y + distance * sp,
      state.target.z + Math.cos(state.yaw) * distance * cp
    );
    state.camera.lookAt(state.target);
  }
  function pick(event) {
    if (state.moved || !state.renderer) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX-rect.left)/rect.width)*2-1, -((event.clientY-rect.top)/rect.height)*2+1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(pointer,state.camera);
    const hit = ray.intersectObjects(state.pickables,false)[0];
    if (hit && hit.object.userData.placeId != null && typeof window.setGps === 'function') {
      window.setGps(hit.object.userData.placeId);
    }
  }
  function render() {
    if (!state.active || !state.renderer) return;
    state.raf = requestAnimationFrame(render);
    resize();
    const me = typeof window.CG_ME === 'function' ? window.CG_ME() : null;
    if (me && state.marker) {
      state.marker.position.x += (me.position.x-state.marker.position.x)*0.12;
      state.marker.position.z += (me.position.z-state.marker.position.z)*0.12;
    }
    state.renderer.render(state.scene,state.camera);
  }
  function start() {
    if (state.active) return;
    state.active = true;
    if (!state.renderer) {
      try {
        state.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: 'low-power' });
        state.renderer.outputColorSpace = THREE.SRGBColorSpace || state.renderer.outputColorSpace;
        state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        state.renderer.toneMappingExposure = 1.05;
        state.renderer.shadowMap.enabled = false;
        state.scene = buildWorld();
        state.camera = new THREE.OrthographicCamera(-400,400,400,-400,0.1,5000);
        placeCamera();
        canvas.addEventListener('pointerdown',e=>{state.drag={x:e.clientX,y:e.clientY,yaw:state.yaw,pitch:state.pitch};state.moved=false;try{canvas.setPointerCapture(e.pointerId)}catch(_){}});
        canvas.addEventListener('pointermove',e=>{
          if(!state.drag)return;
          const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;
          if(Math.abs(dx)+Math.abs(dy)>5)state.moved=true;
          state.yaw=state.drag.yaw-dx*0.006;
          state.pitch=Math.max(0.42,Math.min(1.18,state.drag.pitch+dy*0.004));
          placeCamera();
        });
        const end=e=>{if(state.drag){if(!state.moved)pick(e);state.drag=null}};
        canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',()=>{state.drag=null});
        tools.addEventListener('click',e=>{
          const b=e.target.closest('button');if(!b)return;
          if(b.dataset.zoom){state.zoom=Math.max(0.55,Math.min(2.2,state.zoom+(b.dataset.zoom==='in'?0.15:-0.15)));placeCamera()}
          if(b.dataset.view){state.yaw=Math.PI/4;state.pitch=.72;state.zoom=1;state.target.set(0,0,0);placeCamera()}
        });
        canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(.55,Math.min(2.2,state.zoom+(e.deltaY<0?.08:-.08)));placeCamera()},{passive:false});
        window.addEventListener('resize',()=>{state.lastResize='';resize()},{passive:true});
      } catch (e) {
        state.active=false;
        console.error('Citygame 3D map failed to initialise:',e);
        return;
      }
    }
    resize(); render();
  }
  function stop() {
    state.active=false;
    if(state.raf)cancelAnimationFrame(state.raf);
    state.raf=0;
  }

  window.CGIsometricMap = { open:start, close:stop };
  const originalOpen = window.openMap;
  if (typeof originalOpen === 'function') {
    window.openMap = function () {
      originalOpen.apply(this,arguments);
      start();
    };
  }
  const originalClose = window.closeMap;
  if (typeof originalClose === 'function') {
    window.closeMap = function () {
      stop();
      originalClose.apply(this,arguments);
    };
  }
  // Avoid continuously repainting the hidden legacy 2D canvas while the 3D map is active.
  window.drawBigMap = function () {};
  console.info('Citygame interactive 3D isometric map ready');
})();