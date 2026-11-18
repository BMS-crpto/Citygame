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
    canvas: null, yaw: Math.PI / 4, pitch: 0.78, zoom: 1, target: new THREE.Vector3(),
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
  tools.innerHTML = '<button type="button" data-zoom="out" aria-label="Zoom out">−</button><button type="button" data-zoom="in" aria-label="Zoom in">+</button><button type="button" data-view="reset">Reset view</button><span id="cgIsoHint">Drag to explore · Tap a place to navigate</span>';
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
  function addUrbanMapLayer(scene) {
    // Cartographic overlay: curved arterial corridors and a lagoon edge make the
    // overview read as a city map while retaining the live world's destination coordinates.
    const roadMat = material(0x303b43, 0.96);
    const laneMat = new THREE.MeshBasicMaterial({ color: 0xd8c49a, transparent: true, opacity: 0.8 });
    function ribbon(points, width, y, mat) {
      const verts = [], indices = [];
      for (let i = 0; i < points.length; i++) {
        const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len * width / 2, nz = dx / len * width / 2;
        verts.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
        if (i) { const k = i * 2; indices.push(k-2,k-1,k,k-1,k+1,k); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setIndex(indices); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat); mesh.rotation.x = 0; scene.add(mesh);
      return mesh;
    }
    const corridors = [
      [[-760,-360],[-560,-290],[-360,-230],[-170,-155],[30,-105],[240,-55],[470,20],[760,95]],
      [[-730,310],[-520,245],[-330,185],[-120,145],[80,160],[280,215],[510,300],[760,390]],
      [[-430,-760],[-370,-540],[-300,-330],[-240,-120],[-170,90],[-110,300],[-40,520],[35,760]],
      [[250,-760],[220,-540],[180,-330],[155,-110],[190,100],[255,310],[340,530],[420,760]]
    ];
    corridors.forEach(path => {
      ribbon(path, 15, 2.2, roadMat);
      const center = path.map(p => [p[0], p[1]]);
      ribbon(center, 0.65, 2.35, laneMat);
    });

    // Lagoon/water occupies the eastern edge, with an irregular shoreline.
    const lagoon = new THREE.Shape();
    lagoon.moveTo(555,-850);
    lagoon.bezierCurveTo(455,-620,610,-430,535,-235);
    lagoon.bezierCurveTo(470,-65,650,95,590,285);
    lagoon.bezierCurveTo(545,485,690,660,640,850);
    lagoon.lineTo(1000,850); lagoon.lineTo(1000,-850); lagoon.closePath();
    const water = new THREE.Mesh(new THREE.ShapeGeometry(lagoon, 28),
      new THREE.MeshStandardMaterial({color:0x287e9a, roughness:0.38, metalness:0.08}));
    water.rotation.x = -Math.PI / 2; water.position.y = 0.55; scene.add(water);

    // District names are anchored geographically and remain readable at overview scale.
    const districts = [
      ['IKEJA',-440,-390],['YABA',-235,-70],['SURULERE',-410,285],
      ['VICTORIA ISLAND',245,-365],['IKOYI',390,-120],['LEKKI',410,390],
      ['MAINLAND',-40,410]
    ];
    districts.forEach(([name,x,z]) => {
      const tag = labelSprite(name); tag.position.set(x,34,z); tag.scale.set(34,6.2,1); scene.add(tag);
    });
    // Bridge links over the water edge.
    const bridgeMat = material(0x8b9699,0.72);
    ribbon([[420,-290],[490,-245],[560,-190],[640,-150]],19,4.2,bridgeMat);
    ribbon([[445,245],[510,275],[575,315],[655,350]],19,4.2,bridgeMat);
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

    // Clone the actual static Three.js city geometry into the overview.
    // This keeps the map visually tied to the playable world instead of drawing substitute blocks.
    const sourceScene = window.scene;
    let cloned = 0;
    if (sourceScene && sourceScene.children) {
      sourceScene.children.forEach(function (sourceObject) {
        if (!sourceObject || (!sourceObject.isMesh && !sourceObject.isInstancedMesh)) return;
        if (sourceObject.isSkinnedMesh || sourceObject.isSprite || sourceObject.isPoints) return;
        try {
          const copy = sourceObject.clone();
          copy.traverse(function (node) {
            if (node.isMesh || node.isInstancedMesh) {
              node.castShadow = false;
              node.receiveShadow = false;
              node.frustumCulled = false;
            }
          });
          scene.add(copy);
          cloned++;
        } catch (error) {
          console.warn('Map skipped a non-cloneable city object:', error);
        }
      });
    }
    if (!cloned) console.warn('Isometric map found no static world meshes; check world initialisation');
    addUrbanMapLayer(scene);
    const places = (window.placesList() || []).filter(p => Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.z)));
    state.places = places;
    state.pickables = [];
    const palette = [0xc8d0d0,0xd7c8b3,0x9eb5c1,0xd8d1c3,0xb7c9bd,0xd2b9a7,0x9daebd,0xe0d6c4];
    places.forEach((p, i) => {
      const name = String(p.name || 'Lagos destination');
      const landmark = /hotel|tower|mall|bank|court|hospital|airport|plaza|library|school|lounge|salon|station/i.test(name);
      // Invisible pick volumes sit over the real buildings; they do not replace city geometry.
      const hit = new THREE.Mesh(
        new THREE.BoxGeometry(landmark ? 30 : 20, 42, landmark ? 30 : 20),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.position.set(Number(p.x), 19, Number(p.z));
      hit.userData.placeId = p.id; hit.userData.placeName = name;
      scene.add(hit); state.pickables.push(hit);
      if (landmark || i % 3 === 0) {
        const label = labelSprite(name);
        label.position.set(Number(p.x), 38, Number(p.z));
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
    const aspect = w / h;
    const verticalExtent = Math.max(980, 1180 / Math.max(0.58, aspect));
    state.camera.left = -verticalExtent * aspect / 2;
    state.camera.right = verticalExtent * aspect / 2;
    state.camera.top = verticalExtent / 2;
    state.camera.bottom = -verticalExtent / 2;
    state.camera.updateProjectionMatrix();
  }
  function placeCamera() {
    const distance = 1180 / state.zoom;
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
        canvas.addEventListener('pointerdown',e=>{state.drag={x:e.clientX,y:e.clientY,targetX:state.target.x,targetZ:state.target.z};state.moved=false;try{canvas.setPointerCapture(e.pointerId)}catch(_){}});
        canvas.addEventListener('pointermove',e=>{
          if(!state.drag)return;
          const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;
          if(Math.abs(dx)+Math.abs(dy)>5)state.moved=true;
          const scale = 2.4 / state.zoom;
          state.target.x = state.drag.targetX - dx * scale;
          state.target.z = state.drag.targetZ + dy * scale;
          placeCamera();
        });
        const end=e=>{if(state.drag){if(!state.moved)pick(e);state.drag=null}};
        canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',()=>{state.drag=null});
        tools.addEventListener('click',e=>{
          const b=e.target.closest('button');if(!b)return;
          if(b.dataset.zoom){state.zoom=Math.max(0.55,Math.min(2.2,state.zoom+(b.dataset.zoom==='in'?0.15:-0.15)));placeCamera()}
          if(b.dataset.view){state.yaw=Math.PI/4;state.pitch=.78;state.zoom=1;state.target.set(0,0,0);placeCamera()}
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