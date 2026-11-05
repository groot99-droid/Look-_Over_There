// The things in a room you can use: a red tin to take off a heap, an empty frame to hang a
// photograph in, a picture on the wall to point at. A scene lists them as `interact`
// targets; every frame the one closest to the middle of the view, within reach, gets the
// prompt, and "use" (E / Space / Enter, a click while the mouse is captured, a click on the
// prompt, or a tap on it on a phone) calls it. The mini games are a bonus: nothing here
// touches a room's exit.
//
// A target: { x, y, z, reach = 1.8, size = 0.2, label, enabled() -> bool, use(ctx), hover?(on) }
//   reach  how close (on the floor) the player must stand
//   size   its radius in metres, for aiming: anything within that of the view ray counts
//   label  the prompt text (a string, or a function returning one)
//   hover  optional: called with true when the prompt points at it and false when it stops,
//          so a room can light up which of several look-alike things "use" would pick
import * as THREE from 'three';

const AIM_SLACK = 0.05;   // radians of forgiveness on top of the target's own size

const toTarget = new THREE.Vector3();
const view = new THREE.Vector3();

export function createPlay(targets, { camera, button, touch = false }) {
  let current = null;
  let shown = null;
  if (button) button.classList.toggle('touch', !!touch);

  function labelOf(t) { return typeof t.label === 'function' ? t.label() : t.label; }

  function show(label) {
    if (label === shown) return;
    shown = label;
    if (!button) return;
    if (label) {
      button.textContent = `${touch ? 'TAP' : 'E'}  ·  ${label}`;
      button.classList.add('visible');
    } else {
      button.classList.remove('visible');
    }
  }

  // Pick the target the player is looking at (p is the player's floor position).
  function update(p) {
    camera.getWorldDirection(view);
    let best = null, bestAngle = Infinity;
    for (const t of targets) {
      if (t.enabled && !t.enabled()) continue;
      const reach = t.reach || 1.8;
      const dx = t.x - p.x, dz = t.z - p.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      toTarget.set(t.x - camera.position.x, t.y - camera.position.y, t.z - camera.position.z);
      const dist = toTarget.length();
      if (dist < 1e-3) continue;
      const angle = toTarget.angleTo(view);
      if (angle > Math.atan((t.size || 0.2) / dist) + AIM_SLACK) continue;
      if (angle < bestAngle) { bestAngle = angle; best = t; }
    }
    if (best !== current) {
      if (current && current.hover) current.hover(false);
      if (best && best.hover) best.hover(true);
    }
    current = best;
    show(best ? labelOf(best) : '');
  }

  function use(ctx) {
    if (!current) return false;
    const t = current;
    t.use(ctx);
    return true;
  }

  function hide() {
    if (current && current.hover) current.hover(false);
    current = null;
    show('');
  }

  return {
    update, use, hide,
    get target() { return current ? labelOf(current) : null; },
  };
}
