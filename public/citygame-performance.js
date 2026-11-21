/* Citygame adaptive graphics controller v2.
 * Presets control render resolution; Auto adapts within a conservative floor.
 * No scene assets or visual effects are removed.
 */
(function () {
  'use strict';
  const nativeDpr = () => Math.max(1, window.devicePixelRatio || 1);
  const presets = {
    Low: 0.75,
    Medium: 1,
    High: nativeDpr(),
    Ultra: Math.min(2.25, nativeDpr() * 1.25)
  };
  const storage = (() => { try { return window.localStorage; } catch (_) { return null; } })();
  let mode = 'High', auto = false, currentDpr = 0, rendererRef = null;
  let frames = 0, sampleStart = 0, lowSamples = 0, highSamples = 0;
  try {
    const saved = storage && JSON.parse(storage.getItem('citygame.graphics.v2') || '{}');
    if (saved && presets[saved.mode]) mode = saved.mode;
    auto = !!(saved && saved.auto);
  } catch (_) {}
  function getRenderer() {
    const r = window.CITYGAME_RENDERER || window.renderer;
    return r && typeof r.setPixelRatio === 'function' ? r : null;
  }
  function apply(target) {
    const r = getRenderer() || rendererRef;
    if (!r || typeof r.setPixelRatio !== 'function') return false;
    rendererRef = r;
    target = Math.max(0.65, Math.min(nativeDpr() * 1.25, target));
    if (Math.abs(target - currentDpr) > 0.03) {
      r.setPixelRatio(target);
      if (r.domElement && r.domElement.clientWidth && r.domElement.clientHeight)
        r.setSize(r.domElement.clientWidth, r.domElement.clientHeight, false);
      currentDpr = target;
    }
    return true;
  }
  function save() {
    try { if (storage) storage.setItem('citygame.graphics.v2', JSON.stringify({ mode, auto })); } catch (_) {}
  }
  function baseDpr() { return presets[mode]; }
  function chooseMode(next) {
    if (!presets[next]) return;
    mode = next; auto = false; apply(baseDpr()); save(); resetSamples(); updateControl();
  }
  function resetSamples() { lowSamples = 0; highSamples = 0; frames = 0; sampleStart = 0; }
  const control = document.createElement('button');
  control.type = 'button'; control.id = 'cgGraphicsQuality';
  control.textContent = 'Graphics: ' + mode + (auto ? ' + Auto' : '');
  control.setAttribute('aria-label', 'Graphics quality. Tap to cycle Low, Medium, High and Ultra. Long press is not required; adaptive mode toggles separately.');
  control.style.cssText = 'position:fixed;right:8px;top:max(146px,calc(env(safe-area-inset-top) + 138px));z-index:7;padding:7px 10px;border:1px solid #d7bd78;border-radius:11px;background:#071d18dd;color:#fff;font:700 11px system-ui;box-shadow:0 3px 12px #0008;touch-action:manipulation';
  control.addEventListener('click', function () { chooseMode(['Low','Medium','High','Ultra'][(['Low','Medium','High','Ultra'].indexOf(mode)+1)%4]); });
  control.addEventListener('contextmenu', function (e) { e.preventDefault(); auto = !auto; save(); resetSamples(); updateControl(); apply(baseDpr()); });
  function updateControl() { control.textContent = 'Graphics: ' + mode + (auto ? ' · Auto' : ''); }
  (document.body || document.documentElement).appendChild(control);
  let frameHandle = 0;
  function scheduleFrame() { if (document.visibilityState === 'visible' && !frameHandle) frameHandle = requestAnimationFrame(frame); }
  function stopFrame() { if (frameHandle) { cancelAnimationFrame(frameHandle); frameHandle = 0; } }
  function frame(now) {
    frameHandle = 0;
    if (document.visibilityState !== 'visible') return;
    scheduleFrame();
    if (!rendererRef || !rendererRef.domElement || !rendererRef.setPixelRatio) {
      const found = getRenderer();
      if (found) { rendererRef = found; currentDpr = 0; apply(baseDpr()); sampleStart = now; frames = 0; }
      return;
    }
    if (!sampleStart) sampleStart = now;
    frames++;
    if (now - sampleStart < 2200) return;
    const fps = frames * 1000 / (now - sampleStart);
    frames = 0; sampleStart = now;
    if (auto) {
      if (fps < 43) { lowSamples++; highSamples = 0; }
      else if (fps > 57) { highSamples++; lowSamples = 0; }
      else { lowSamples = Math.max(0, lowSamples - 1); highSamples = Math.max(0, highSamples - 1); }
      if (lowSamples >= 2) { apply(Math.max(0.75, currentDpr - 0.12)); lowSamples = 0; }
      else if (highSamples >= 3) { apply(Math.min(baseDpr(), currentDpr + 0.08)); highSamples = 0; }
    }
  }
  function start() { sampleStart = 0; scheduleFrame(); }
  document.addEventListener('visibilitychange', function () {
    resetSamples();
    if (document.visibilityState === 'visible') { apply(baseDpr()); scheduleFrame(); }
    else stopFrame();
  });
  window.addEventListener('resize', function () {
    presets.High = nativeDpr(); presets.Ultra = Math.min(2.25, nativeDpr() * 1.25);
    if (!auto) apply(baseDpr());
  }, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  apply(baseDpr()); updateControl();
  console.info('Citygame adaptive graphics controller v2 ready');
})();
