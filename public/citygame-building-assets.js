/* Citygame residential GLB pipeline.
 * Uses independently authored building roots from the Ajah housing asset when
 * the file exposes valid, separate building models. Otherwise the established
 * procedural builders remain the safe fallback.
 */
(function () {
  'use strict';

  const sourceBuildWorld = window.buildWorld;
  const sourceBuildRental = window.buildRental;
  if (typeof sourceBuildWorld !== 'function' || typeof sourceBuildRental !== 'function') {
    console.warn('[Citygame buildings] Base world builders are unavailable; keeping original renderer.');
    return;
  }

  const state = {
    settled: false,
    variants: [],
    promise: null,
    used: 0,
    fallback: 0
  };

  function meshCount(root) {
    let count = 0;
    root.traverse(function (node) {
      if (node.isMesh && node.geometry) count++;
    });
    return count;
  }

  function boundsOf(root) {
    root.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(root);
  }

  function validBuildingRoot(root) {
    if (!root || meshCount(root) === 0) return false;
    const box = boundsOf(root);
    const size = box.getSize(new THREE.Vector3());
    return Number.isFinite(size.x) && Number.isFinite(size.y) &&
      Number.isFinite(size.z) && size.x >= 3 && size.z >= 3 &&
      size.y >= 2.5 && size.x <= 48 && size.z <= 48 && size.y <= 48;
  }

  function loadCatalog() {
    return new Promise(function (resolve) {
      if (!window.THREE || !THREE.GLTFLoader) {
        state.settled = true;
        resolve();
        return;
      }
      const loader = new THREE.GLTFLoader();
      let completed = false;
      const finish = function () {
        if (completed) return;
        completed = true;
        state.settled = true;
        resolve();
      };

      // The source file is a multi-building asset pack. Only independently
      // bounded top-level roots are eligible; a single scene/merged mesh is
      // never stretched across every residential lot.
      loader.load('/models/ajah_houses.glb', function (gltf) {
        try {
          if (completed) return;
          const roots = (gltf.scene.children || []).filter(validBuildingRoot);
          if (roots.length >= 2) state.variants = roots;
          else console.warn('[Citygame buildings] Ajah asset has no separable building set; using procedural fallback.');
        } catch (error) {
          console.warn('[Citygame buildings] Asset validation failed; using procedural fallback.', error);
        }
        finish();
      }, undefined, function (error) {
        console.warn('[Citygame buildings] Ajah asset unavailable; using procedural fallback.', error);
        finish();
      });

      // Never hold the initial world hostage to a slow or blocked asset request.
      window.setTimeout(finish, 4500);
    });
  }

  function fitBuilding(source, house) {
    const model = source.clone(true);
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    let size = box.getSize(new THREE.Vector3());
    const target = house.kind === 'villa'
      ? { x: 14.5, y: 11.5, z: 13.5 }
      : house.kind === 'lobby'
        ? { x: 14, y: 13, z: 12 }
        : { x: 13, y: 10, z: 10 };

    const scale = Math.min(target.x / Math.max(size.x, 0.001),
      target.y / Math.max(size.y, 0.001),
      target.z / Math.max(size.z, 0.001));
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('Invalid building scale');
    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.traverse(function (node) {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.geometry) node.geometry.computeBoundingSphere();
      }
    });

    const placement = new THREE.Group();
    placement.position.set(house.x, 0, house.z);
    placement.add(model);
    scene.add(placement);
    return placement;
  }

  function addHouseCollision(house) {
    const x = house.x, z = house.z;
    if (house.kind === 'villa') {
      solid(x, z, 7.1, 6.8);
      solid(x + 7.55, z - 0.55, 2.45, 3.05);
    } else {
      solid(x, z, 6.9, house.kind === 'lobby' ? 6.2 : 5.2);
    }
  }

  function assetBuildRental(house) {
    if (!state.variants.length) {
      state.fallback++;
      return sourceBuildRental(house);
    }
    try {
      const index = Math.abs(Number(house.id) || 0) % state.variants.length;
      fitBuilding(state.variants[index], house);
      addHouseCollision(house);
      if (house.kind === 'flat' || house.kind === 'lobby') apartmentParking(house);
      state.used++;
    } catch (error) {
      console.warn('[Citygame buildings] Model placement failed; using original building.', error);
      state.fallback++;
      sourceBuildRental(house);
    }
  }

  state.promise = loadCatalog();
  window.buildRental = assetBuildRental;
  window.buildWorld = function (worldData) {
    // Resolve the asset check before constructing the world so the renderer
    // does not create procedural shells and then stack GLBs on top of them.
    state.promise.then(function () {
      sourceBuildWorld(worldData);
      window.CG_BUILDING_ASSET_STATUS = {
        source: '/models/ajah_houses.glb',
        variants: state.variants.length,
        placed: state.used,
        fallback: state.fallback,
        mode: state.variants.length ? 'glb-residential-with-fallback' : 'procedural-fallback'
      };
      console.info('[Citygame buildings] Residential asset pass:', window.CG_BUILDING_ASSET_STATUS);
    }).catch(function (error) {
      console.error('[Citygame buildings] World build fallback:', error);
      sourceBuildWorld(worldData);
    });
  };

  window.CG_BUILDING_ASSETS = {
    status: function () {
      return {
        settled: state.settled,
        variants: state.variants.length,
        placed: state.used,
        fallback: state.fallback
      };
    }
  };
  state.promise.catch(function () {});
})();
