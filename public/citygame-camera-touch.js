/* Citygame camera touch controller: drag to orbit, pinch to zoom. */
(function () {
  'use strict';
  if (window.CitygameCameraTouch) return;

  const canvas = (window.CITYGAME_RENDERER && window.CITYGAME_RENDERER.domElement) ||
    document.querySelector('canvas');
  const state = window.CG_CAMERA_TOUCH;
  if (!canvas || !state) {
    console.warn('Citygame camera touch controller unavailable: canvas or camera bridge missing');
    return;
  }

  let orbitTouchId = null;
  let lastX = 0;
  let lastY = 0;
  let pinchDistance = 0;

  function distance(touches) {
    if (!touches || touches.length < 2) return 0;
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  }

  function begin(event) {
    if (event.touches.length >= 2) {
      orbitTouchId = null;
      pinchDistance = distance(event.touches);
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) return;
    orbitTouchId = touch.identifier;
    lastX = touch.clientX;
    lastY = touch.clientY;
    pinchDistance = 0;
  }

  function move(event) {
    if (event.touches.length >= 2) {
      const nextDistance = distance(event.touches);
      if (pinchDistance > 0 && nextDistance > 0) {
        state.zoom = Math.max(0.72, Math.min(1.8, state.zoom * pinchDistance / nextDistance));
      }
      pinchDistance = nextDistance;
      return;
    }
    if (orbitTouchId === null) return;
    for (const touch of event.changedTouches) {
      if (touch.identifier !== orbitTouchId) continue;
      if (state.canRotate()) state.yaw -= (touch.clientX - lastX) * 0.01;
      state.height = Math.max(3, Math.min(16, state.height + (touch.clientY - lastY) * 0.03));
      lastX = touch.clientX;
      lastY = touch.clientY;
      break;
    }
  }

  function finish(event) {
    pinchDistance = 0;
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      orbitTouchId = touch.identifier;
      lastX = touch.clientX;
      lastY = touch.clientY;
    } else {
      orbitTouchId = null;
    }
  }

  canvas.addEventListener('touchstart', begin, { passive: true });
  canvas.addEventListener('touchmove', move, { passive: true });
  canvas.addEventListener('touchend', finish, { passive: true });
  canvas.addEventListener('touchcancel', finish, { passive: true });

  window.CitygameCameraTouch = {
    reset() { orbitTouchId = null; pinchDistance = 0; },
    get activeTouchId() { return orbitTouchId; }
  };
})();
