/* Citygame mobile joystick input.
 * Keeps the active touch assigned to the joystick until that same touch ends.
 */
(function () {
  'use strict';

  if (window.CitygameTouchControls) return;
  const stick = document.getElementById('stick');
  const knob = document.getElementById('knob');
  const joy = window.CG_JOY;
  if (!stick || !knob || !joy) {
    console.warn('Citygame touch controls unavailable: joystick elements or input bridge missing');
    return;
  }

  let activeTouchId = null;

  function update(touch) {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width * 0.38;
    if (!radius) return;
    let dx = touch.clientX - (rect.left + rect.width / 2);
    let dy = touch.clientY - (rect.top + rect.height / 2);
    const distance = Math.min(radius, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    dx = Math.cos(angle) * distance;
    dy = Math.sin(angle) * distance;
    knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    joy.x = dx / radius;
    joy.y = dy / radius;
  }

  function releaseIfActive(event) {
    if (activeTouchId === null) return;
    for (const touch of event.changedTouches) {
      if (touch.identifier !== activeTouchId) continue;
      activeTouchId = null;
      joy.x = 0;
      joy.y = 0;
      knob.style.transform = 'translate(0,0)';
      return;
    }
  }

  stick.addEventListener('touchstart', function (event) {
    if (activeTouchId !== null || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    activeTouchId = touch.identifier;
    update(touch);
  }, { passive: true });

  stick.addEventListener('touchmove', function (event) {
    if (activeTouchId === null) return;
    for (const touch of event.changedTouches) {
      if (touch.identifier === activeTouchId) {
        update(touch);
        break;
      }
    }
  }, { passive: true });

  stick.addEventListener('touchend', releaseIfActive, { passive: true });
  stick.addEventListener('touchcancel', releaseIfActive, { passive: true });

  window.CitygameTouchControls = {
    get activeTouchId() { return activeTouchId; },
    release() {
      activeTouchId = null;
      joy.x = 0;
      joy.y = 0;
      knob.style.transform = 'translate(0,0)';
    }
  };
})();
