/* Citygame adaptive graphics controller.
 * Preserves the full-resolution High preset; Auto adjusts render resolution only
 * when frame time shows sustained load. It does not remove assets, shadows or effects.
 */
(function () {
  'use strict';
  const profiles = {
    Auto: { min: 0.85, max: Math.min(window.devicePixelRatio || 1, 1.75), adaptive: true },
    High: { min: Math.min(window.devicePixelRatio || 1, 2), max: Math.min(window.devicePixelRatio || 1, 2), adaptive: false },
    Balanced: { min: 1, max: 1.35, adaptive: false },
    Saver: { min: 0.8, max: 1, adaptive: false }
  };
  let mode = 'Auto';
  let currentDpr = 0;
  let rendererRef = null;
  let frames = 0;
  let sampleStart = performance.now();
  let lowSamples = 0;
  let highSamples = 0;

  function getRenderer() {
    try {
      if (typeof renderer !== 'undefined' && renderer && renderer.setPixelRatio) return renderer;
    } catch (_) {}
    return window.renderer && window.renderer.setPixelRatio ? window.renderer : null;
  }

  function apply(target) {
    const r = getRenderer();
    if (!r) return false;
    rendererRef = r;
    const dpr = Math.max(0.75, Math.min(2, target));
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

  function chooseMode(next) {
    if (!profiles[next]) return;
    mode = next;
    const p = profiles[mode];
    const initial = mode === 'Auto'
      ? Math.min(p.max, Math.max(p.min, (window.devicePixelRatio || 1) * 0.9))
      : p.max;
    apply(initial);
    if (label) label.textContent = 'Graphics: ' + mode;
    if (mode !== 'Auto') { lowSamples = 0; highSamples = 0; }
  }

  const control = document.createElement('button');
  control.type = 'button';
  control.id = 'cgGraphicsQuality';
  control.textContent = 'Graphics: Auto';
  control.setAttribute('aria-label', 'Graphics quality. Tap to change between Auto, High, Balanced and Saver.');
  control.style.cssText = 'position:fixed;right:8px;top:max(146px,calc(env(safe-area-inset-top) + 138px));z-index:7;padding:7px 10px;border:1px solid #d7bd78;border-radius:11px;background:#071d18dd;color:#fff;font:700 11px system-ui;box-shadow:0 3px 12px #0008;touch-action:manipulation';
  const label = control;
  const modes = ['Auto', 'High', 'Balanced', 'Saver'];
  control.addEventListener('click', function () {
    const next = modes[(modes.indexOf(mode) + 1) % modes.length];
    chooseMode(next);
  });
  document.body.appendChild(control);

  function frame(now) {
    requestAnimationFrame(frame);
    frames++;
    if (now - sampleStart < 2200) return;
    const fps = frames * 1000 / (now - sampleStart);
    frames = 0;
    sampleStart = now;
    const p = profiles[mode];
    if (mode === 'Auto' && rendererRef && document.visibilityState === 'visible') {
      if (fps < 43) { lowSamples++; highSamples = 0; }
      else if (fps > 57) { highSamples++; lowSamples = 0; }
      else { lowSamples = Math.max(0, lowSamples - 1); highSamples = Math.max(0, highSamples - 1); }
      if (lowSamples >= 2) {
        apply(Math.max(p.min, currentDpr - 0.12));
        lowSamples = 0;
      } else if (highSamples >= 3) {
        apply(Math.min(p.max, currentDpr + 0.08));
        highSamples = 0;
      }
    }
  }

  function start() {
    chooseMode('Auto');
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  window.addEventListener('resize', function () {
    if (mode === 'Auto') {
      const p = profiles.Auto;
      apply(Math.min(p.max, Math.max(p.min, (window.devicePixelRatio || 1) * 0.9)));
    }
  }, { passive: true });
  console.info('Citygame adaptive graphics controller ready');
})();
