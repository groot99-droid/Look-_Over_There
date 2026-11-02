// Doc 4 §9: the global accessibility exit, present in every scene and every
// mini-game. "Quitting is an ending, not an exit" -- the player who leaves
// is filed as PENDING REVIEW, which is exactly what that ending means. This
// is the ONE persistent non-diegetic UI element in the entire game (Doc 4
// §14), deliberately styled as a fire exit sign rather than a generic
// button.
//
// Doc 4 §13: touch long-press requires 1200ms AND 3+ fingers specifically
// so it never collides with walking (one thumb) and looking (the other).
//
// Escape no longer bails: the candidate is always walking, and Escape is
// the browser's own "release the mouse" key under pointer lock. Once the
// pointer is released, EXIT is a click away.

const LONG_PRESS_MS = 1200;
const LONG_PRESS_MIN_TOUCHES = 3;

export function initBail(director) {
  const affordance = document.createElement('button');
  affordance.id = 'bail-affordance';
  affordance.type = 'button';
  affordance.setAttribute('aria-label', 'Exit');
  affordance.textContent = 'EXIT';
  document.body.appendChild(affordance);

  // A mouse click is deliberate (the pointer had to be released first). A
  // touch is not: EXIT sits where the walking thumb lands, so on touch the
  // first tap arms it (EXIT?) and only a second tap within 3 s leaves.
  let lastPointer = 'mouse';
  let armedUntil = 0;
  let disarm = null;
  affordance.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; });
  affordance.addEventListener('click', () => {
    if (lastPointer === 'mouse') { director.bail(); return; }
    const now = performance.now();
    if (now < armedUntil) { director.bail(); return; }
    armedUntil = now + 3000;
    affordance.textContent = 'EXIT?';
    affordance.classList.add('bail-armed');
    clearTimeout(disarm);
    disarm = setTimeout(() => { armedUntil = 0; affordance.textContent = 'EXIT'; affordance.classList.remove('bail-armed'); }, 3000);
  });

  let touchTimer = null;
  const clearTouchTimer = () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = null;
    }
  };

  document.addEventListener('touchstart', (e) => {
    clearTouchTimer();
    if (e.touches.length >= LONG_PRESS_MIN_TOUCHES) {
      touchTimer = setTimeout(() => director.bail(), LONG_PRESS_MS);
    }
  }, { passive: true });
  document.addEventListener('touchend', clearTouchTimer, { passive: true });
  document.addEventListener('touchcancel', clearTouchTimer, { passive: true });
  document.addEventListener('touchmove', clearTouchTimer, { passive: true });

  return {
    destroy() {
      affordance.remove();
    }
  };
}
