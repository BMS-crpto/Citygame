/* Citygame Lagos street infrastructure — real Three.js world geometry.
 * Adds instanced streetlights and storm-drain grates plus modular bus shelters.
 * This is a visual world pass only: it does not alter collision, traffic, or server state.
 */
(function () {
  'use strict';
  if (window.CG_LAGOS_STREETS && window.CG_LAGOS_STREETS.built) return;
  const THREE = window.THREE;
  const scene = window.scene;
  if (!THREE || !scene || !THREE.InstancedMesh || !THREE.Object3D) {
    console.warn('[Citygame streets] Three.js scene is not ready; street pass skipped.');
    return;
  }

  const BLOCK = 64;
  const GRID = 12;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const count = (list, geometry, material, castShadow) => {
    if (!list.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, item.rotation || 0, 0);
      dummy.scale.set(item.sx || 1, item.sy || 1, item.sz || 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      if (item.color && mesh.setColorAt) mesh.setColorAt(index, color.setHex(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = !!castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };

  // Galvanised poles, short road-facing outreach arms and warm LED heads.
  const poles = [], arms = [], heads = [];
  for (let road = -GRID - 1; road <= GRID + 1; road++) {
    for (let segment = -GRID; segment <= GRID; segment += 2) {
      const along = segment * BLOCK;
      for (const side of [-1, 1]) {
        const x = road * BLOCK;
        const z = along + BLOCK / 2;
        poles.push({ x: x + side * 8.55, y: 3.65, z, rotation: 0 });
        arms.push({ x: x + side * 7.95, y: 7.05, z, rotation: side > 0 ? 0 : Math.PI });
        heads.push({ x: x + side * 7.25, y: 7.02, z, rotation: 0 });
        const vx = along + BLOCK / 2;
        const vz = road * BLOCK;
        poles.push({ x: vx, y: 3.65, z: vz + side * 8.55, rotation: 0 });
        arms.push({ x: vx, y: 7.05, z: vz + side * 7.95, rotation: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
        heads.push({ x: vx, y: 7.02, z: vz + side * 7.25, rotation: 0 });
      }
    }
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x46515a, metalness: 0.72, roughness: 0.48 });
  const armMat = new THREE.MeshStandardMaterial({ color: 0x303b43, metalness: 0.62, roughness: 0.52 });
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffe6ad, emissive: 0xffbd62, emissiveIntensity: 0.55, roughness: 0.36 });
  count(poles, new THREE.CylinderGeometry(0.075, 0.13, 7.3, 8), poleMat, false);
  count(arms, new THREE.BoxGeometry(1.25, 0.11, 0.13), armMat, false);
  count(heads, new THREE.BoxGeometry(0.78, 0.16, 0.38), ledMat, false);

  // Kerbside storm-water drains: dark channels with repeated steel slots.
  const drainBases = [], drainSlots = [];
  for (let road = -GRID - 1; road <= GRID + 1; road++) {
    for (let segment = -GRID; segment <= GRID; segment++) {
      const mid = segment * BLOCK + BLOCK / 2;
      for (const side of [-1, 1]) {
        drainBases.push({ x: mid, y: 0.205, z: road * BLOCK + side * 6.02, sx: 1, sy: 1, sz: 1 });
        drainBases.push({ x: road * BLOCK + side * 6.02, y: 0.205, z: mid, rotation: Math.PI / 2, sx: 1, sy: 1, sz: 1 });
        for (let k = -4; k <= 4; k += 2) {
          drainSlots.push({ x: mid + k, y: 0.218, z: road * BLOCK + side * 6.02, rotation: 0 });
          drainSlots.push({ x: road * BLOCK + side * 6.02, y: 0.218, z: mid + k, rotation: Math.PI / 2 });
        }
      }
    }
  }
  const drainMat = new THREE.MeshStandardMaterial({ color: 0x343a3d, metalness: 0.48, roughness: 0.78 });
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x858b8b, metalness: 0.72, roughness: 0.58 });
  count(drainBases, new THREE.BoxGeometry(9.2, 0.035, 0.42), drainMat, false);
  count(drainSlots, new THREE.BoxGeometry(0.11, 0.025, 0.32), slotMat, false);

  // Recognisable Lagos danfo stops: shelter, bench, route board and concrete pads.
  const shelters = [];
  const shelterMat = new THREE.MeshStandardMaterial({ color: 0x183d50, metalness: 0.32, roughness: 0.62 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xf0bd42, metalness: 0.12, roughness: 0.72 });
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x4d5960, metalness: 0.2, roughness: 0.82 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xf3f0df, roughness: 0.9 });
  for (let i = -GRID; i <= GRID; i += 4) {
    for (let j = -GRID; j <= GRID; j += 4) {
      const side = ((i + j) & 1) ? 1 : -1;
      const x = i * BLOCK + 19;
      const z = j * BLOCK + side * 10.8;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.12, 3.5), new THREE.MeshStandardMaterial({ color: 0xaaa69d, roughness: 0.96 }));
      pad.position.y = 0.06; g.add(pad);
      for (const px of [-3.7, 3.7]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.16), shelterMat);
        post.position.set(px, 1.32, 0); g.add(post);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.22, 3.9), roofMat);
      roof.position.y = 2.62; g.add(roof);
      const back = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.1, 0.12), shelterMat);
      back.position.set(0, 1.05, -1.55); g.add(back);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.18, 0.62), benchMat);
      bench.position.set(0, 0.72, -0.55); g.add(bench);
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.0, 0.12), boardMat);
      board.position.set(3.0, 1.45, 1.62); g.add(board);
      g.traverse(node => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = true; } });
      scene.add(g); shelters.push(g);
    }
  }


  // Major junctions receive full 3D traffic signals and district wayfinding.
  // Geometry is instanced so the extra street detail stays lightweight on phones.
  const signalPoles = [], signalBodies = [], signalLenses = [], activeLenses = [];
  const signalPoleMat = new THREE.MeshStandardMaterial({ color: 0x39434a, metalness: 0.58, roughness: 0.55 });
  const signalBodyMat = new THREE.MeshStandardMaterial({ color: 0x20282d, metalness: 0.18, roughness: 0.68 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.05 });
  const activeLensMat = new THREE.MeshStandardMaterial({ color: 0x72e58a, emissive: 0x28d65a, emissiveIntensity: 0.72, roughness: 0.24 });
  for (let ix = -6; ix <= 6; ix += 3) {
    for (let iz = -6; iz <= 6; iz += 3) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = ix * BLOCK + sx * 7.45;
        const z = iz * BLOCK + sz * 7.45;
        const face = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
        const rotation = Math.abs(sx) ? face : (sz < 0 ? 0 : Math.PI);
        signalPoles.push({ x, y: 2.35, z });
        signalBodies.push({ x, y: 4.12, z, rotation, sx: 0.48, sy: 1.18, sz: 0.38 });
        for (let lens = 0; lens < 3; lens++) {
          const ly = 4.48 - lens * 0.36;
          const offset = rotation === 0 ? { x: 0, z: 0.205 } :
            rotation === Math.PI ? { x: 0, z: -0.205 } :
            rotation > 0 ? { x: 0.205, z: 0 } : { x: -0.205, z: 0 };
          signalLenses.push({ x: x + offset.x, y: ly, z: z + offset.z, color: [0xe74b4b, 0xffc247, 0x43c978][lens], rotation, sx: 0.23, sy: 0.23, sz: 0.23 });
          if (lens === 2) activeLenses.push({ x: x + offset.x, y: ly, z: z + offset.z, rotation, sx: 0.72, sy: 0.72, sz: 0.72 });
        }
      }
    }
  }
  count(signalPoles, new THREE.CylinderGeometry(0.075, 0.095, 4.7, 8), signalPoleMat, false);
  count(signalBodies, new THREE.BoxGeometry(1, 1, 1), signalBodyMat, false);
  count(signalLenses, new THREE.SphereGeometry(0.13, 10, 8), lensMat, false);
  count(activeLenses, new THREE.SphereGeometry(0.13, 10, 8), activeLensMat, false);

  // Map the procedural grid to recognisable Lagos districts for wayfinding.
  function districtForSign(ix, iz) {
    if (ix >= 3 && iz >= 0) return 'LEKKI';
    if (ix >= 0 && iz < 0) return 'IKEJA';
    if (ix < 0 && iz >= 0) return 'SURULERE';
    if (ix < -3 && iz < 0) return 'VICTORIA ISLAND';
    return 'LAGOS MAINLAND';
  }

  // Raised, readable 3D district signs at the main crossroads.
  const signSupports = [];
  function makeDistrictSign(label, x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#075b3d'; context.fillRect(0, 0, 512, 128);
    context.strokeStyle = '#f5f0d7'; context.lineWidth = 8; context.strokeRect(5, 5, 502, 118);
    context.fillStyle = '#ffffff'; context.font = 'bold 48px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(label, 256, 65, 470);
    const texture = new THREE.CanvasTexture(canvas);
    if ('colorSpace' in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in texture && THREE.sRGBEncoding) texture.encoding = THREE.sRGBEncoding;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.78, metalness: 0.08, side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.05, 0.12), material);
    board.position.set(x, 5.55, z);
    board.rotation.y = Math.PI / 4;
    const supportOffset = 1.55 * Math.SQRT1_2;
    signSupports.push({ x: x - supportOffset, y: 2.75, z: z + supportOffset });
    signSupports.push({ x: x + supportOffset, y: 2.75, z: z - supportOffset });
    board.castShadow = false; board.receiveShadow = true;
    scene.add(board);
  }
  let districtSigns = 0;
  for (let ix = -6; ix <= 6; ix += 3) {
    for (let iz = -6; iz <= 6; iz += 3) {
      makeDistrictSign(districtForSign(ix, iz), ix * BLOCK + 8.2, iz * BLOCK + 8.2);
      districtSigns++;
    }
  }
  // Structural sign supports reach the pavement and are batched into one mesh.
  count(signSupports, new THREE.CylinderGeometry(0.065, 0.085, 5.5, 8), poleMat, false);

  window.CG_LAGOS_STREETS = {
    built: true,
    streetLights: poles.length,
    drainSections: drainBases.length,
    busShelters: shelters.length,
    trafficSignals: signalPoles.length,
    districtSigns: districtSigns
  };
  console.info('[Citygame streets] 3D street infrastructure built:', window.CG_LAGOS_STREETS);
})();
