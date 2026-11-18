/* Citygame road accessibility: raised kerb ramps and tactile paving at street crossings. */
(function () {
  'use strict';
  if (window.CG_ROAD_ACCESSIBILITY && window.CG_ROAD_ACCESSIBILITY.built) return;
  const THREE = window.THREE;
  const scene = window.scene;
  if (!THREE || !scene || !THREE.InstancedMesh || !THREE.BufferGeometry) {
    console.warn('[Citygame road access] Three.js scene is not ready; accessibility pass skipped.');
    return;
  }

  const GRID = 12, BLOCK = 64;
  const dummy = new THREE.Object3D();
  const ramps = [], tactile = [];
  for (let ix = -GRID; ix <= GRID; ix++) {
    for (let iz = -GRID; iz <= GRID; iz++) {
      const cx = ix * BLOCK, cz = iz * BLOCK;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const rotation = Math.atan2(sx, sz);
        ramps.push({ x: cx + sx * 7.55, z: cz + sz * 7.55, rotation });
        // Raised tactile studs sit on the upper half of each ramp, before the pavement.
        for (const lateral of [-0.58, 0, 0.58]) {
          for (const depth of [0.48, 0.82, 1.12]) {
            const sin = Math.sin(rotation), cos = Math.cos(rotation);
            tactile.push({
              x: cx + sx * 7.55 + lateral * cos + depth * sin,
              z: cz + sz * 7.55 - lateral * sin + depth * cos,
              y: 0.405
            });
          }
        }
      }
    }
  }

  // A solid wedge: its road-facing edge is low and its pavement-facing edge is raised.
  const rampGeometry = new THREE.BufferGeometry();
  rampGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1.2,0.025,-1.2,  1.2,0.025,-1.2,
    -1.2,0.025, 1.2,  1.2,0.025, 1.2,
    -1.2,0.38, 1.2,   1.2,0.38, 1.2
  ], 3));
  rampGeometry.setIndex([
    0,1,5, 0,5,4, 0,2,3, 0,3,1,
    0,4,2, 1,3,5, 2,4,5, 2,5,3
  ]);
  rampGeometry.computeVertexNormals();
  const rampMaterial = new THREE.MeshStandardMaterial({
    color: 0xb9b5aa, roughness: 0.94, metalness: 0, side: THREE.DoubleSide
  });
  const rampMesh = new THREE.InstancedMesh(rampGeometry, rampMaterial, ramps.length);
  ramps.forEach((r, i) => {
    dummy.position.set(r.x, 0, r.z);
    dummy.rotation.set(0, r.rotation, 0);
    dummy.updateMatrix();
    rampMesh.setMatrixAt(i, dummy.matrix);
  });
  rampMesh.instanceMatrix.needsUpdate = true;
  rampMesh.receiveShadow = true;
  rampMesh.castShadow = false;
  rampMesh.frustumCulled = false;
  scene.add(rampMesh);

  const tactileGeometry = new THREE.BoxGeometry(0.16, 0.045, 0.12);
  const tactileMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5b82f, roughness: 0.82, metalness: 0
  });
  const tactileMesh = new THREE.InstancedMesh(tactileGeometry, tactileMaterial, tactile.length);
  tactile.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    tactileMesh.setMatrixAt(i, dummy.matrix);
  });
  tactileMesh.instanceMatrix.needsUpdate = true;
  tactileMesh.receiveShadow = true;
  tactileMesh.castShadow = false;
  tactileMesh.frustumCulled = false;
  scene.add(tactileMesh);

  window.CG_ROAD_ACCESSIBILITY = {
    built: true,
    curbRamps: ramps.length,
    tactilePavingStuds: tactile.length
  };
  console.info('[Citygame road access] crossings built:', window.CG_ROAD_ACCESSIBILITY);
})();
