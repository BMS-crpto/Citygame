/* Citygame adaptive graphics controller.
 * Auto adapts render resolution only; High uses the device's native DPR.
 * No assets, textures, shadows or visual effects are removed.
 */
(function () {
  'use strict';

  const nativeDpr = () => Math.max(1, window.devicePixelRatio || 1);
  const profiles = {
    Auto: { min: 0.85, max: nativeDpr(), adaptive: true },
    High: { min: nativeDpr(), max: nativeDpr(), adaptive: false },
    Balanced: { min: 1, max: 1.35, adaptive: false },
    Saver: { min: 0.8, max: 1, adaptive: false }
  };

  let mode = 'Auto';
  let currentDpr = 0;
  let rendererRef = null;
  let frames = 0;
  let sampleStart = 0;
  let lowSamples = 0;
  let highSamples = 0;
  let lastVisibility = document.visibilityState;

  function getRenderer() {
    try {
      if (typeof renderer !== 'undefined' && renderer && renderer.setPixelRatio) return renderer;
    } catch (_) {}
    return window.renderer && window.renderer.setPixelRatio ? window.renderer : null;
  }

  function apply(target) {
    const r = getRenderer() || rendererRef;
    if (!r || typeof r.setPixelRatio !== 'function') return false;
    rendererRef = r;
    const dpr = Math.max(0.75, target);
    if (Math.abs(dpr - currentDpr) > 0.03) {
      r.setPixelRatio(dpr);
      const canvas = r.domElement;
      if (canvas && canvas.clientWidth && canvas.clientHeight) {
        r.setSize(canvas.clientWidth, canvas.clientHeight, false);
      }
      currentDpr = dpr;
    }
    return true;
  }

  function desiredInitialDpr() {
    const p = profiles[mode];
    return mode === 'Auto'
      ? Math.min(p.max, Math.max(p.min, nativeDpr() * 0.9))
      : p.max;
  }

  function chooseMode(next) {
    if (!profiles[next]) return;
    mode = next;
    apply(desiredInitialDpr());
    control.textContent = 'Graphics: ' + mode;
    lowSamples = 0;
    highSamples = 0;
  }

  const control = document.createElement('button');
  control.type = 'button';
  control.id = 'cgGraphicsQuality';
  control.textContent = 'Graphics: Auto';
  control.setAttribute('aria-label', 'Graphics quality. Tap to change between Auto, High, Balanced and Saver.');
  control.style.cssText = 'position:fixed;right:8px;top:max(146px,calc(env(safe-area-inset-top) + 138px));z-index:7;padding:7px 10px;border:1px solid #d7bd78;border-radius:11px;background:#071d18dd;color:#fff;font:700 11px system-ui;box-shadow:0 3px 12px #0008;touch-action:manipulation';
  const modes = ['Auto', 'High', 'Balanced', 'Saver'];
  control.addEventListener('click', function () {
    chooseMode(modes[(modes.indexOf(mode) + 1) % modes.length]);
  });
  (document.body || document.documentElement).appendChild(control);

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.visibilityState !== 'visible') return;

    // The game may create its renderer after this controller loads. Keep retrying
    // until it exists instead of permanently giving up after the first attempt.
    if (!rendererRef || !rendererRef.domElement || !rendererRef.setPixelRatio) {
      const found = getRenderer();
      if (found) {
        rendererRef = found;
        currentDpr = 0;
        apply(desiredInitialDpr());
        sampleStart = now;
        frames = 0;
        return;
      }
    }

    if (!sampleStart) sampleStart = now;
    frames++;
    if (now - sampleStart < 2200) return;

    const fps = frames * 1000 / (now - sampleStart);
    frames = 0;
    sampleStart = now;
    const p = profiles[mode];

    if (mode === 'Auto' && rendererRef) {
      if (fps < 43) { lowSamples++; highSamples = 0; }
      else if (fps > 57) { highSamples++; lowSamples = 0; }
      else {
        lowSamples = Math.max(0, lowSamples - 1);
        highSamples = Math.max(0, highSamples - 1);
      }
      if (lowSamples >= 2) {
        apply(Math.max(p.min, currentDpr - 0.12));
        lowSamples = 0;
      } else if (highSamples >= 3) {
        apply(Math.min(nativeDpr(), currentDpr + 0.08));
        highSamples = 0;
      }
    }
  }

  function start() {
    sampleStart = 0;
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    if (lastVisibility !== document.visibilityState) {
      lastVisibility = document.visibilityState;
      frames = 0;
      sampleStart = 0;
      lowSamples = 0;
      highSamples = 0;
    }
  });

  window.addEventListener('resize', function () {
    profiles.Auto.max = nativeDpr();
    profiles.High.min = profiles.High.max = nativeDpr();
    if (mode === 'Auto') apply(desiredInitialDpr());
  }, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  console.info('Citygame adaptive graphics controller ready');
})();
