// First-person walking for the walk scenes, after the Chronicle Museum viewer's
// controls: WASD / arrows to walk, pointer lock or click-drag to look, and on a
// phone a thumb joystick on the left of the screen with drag-to-look on the right.
//
// E / Space / Enter, or a click while the mouse is captured, is "use": the room's mini
// game decides what that does (walk/play.js picks the thing in front of you).
//
// Collision is axis-aligned boxes rather than raycasts: everything in these rooms
// is a box (walls, table, chairs, sideboard, doors), so a circle-vs-AABB slide is
// cheap enough for a phone and never lets the player through a wall.
import * as THREE from 'three';

export const EYE_HEIGHT = 1.62;
const MOVE_SPEED = 2.2;       // m/s: a wary walk, not a museum stroll
const RADIUS = 0.28;          // player capsule radius
const LOOK_GAIN_MOUSE = 0.0022;
const LOOK_GAIN_TOUCH = 0.0052;
const PITCH_LIMIT = Math.PI / 2 - 0.08;

function isEditable(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export function createControls(camera, domElement, { reducedMotion = false } = {}) {
  const keys = { forward: false, back: false, left: false, right: false };
  const axis = { x: 0, y: 0 };
  let yaw = 0, pitch = 0;
  let enabled = false;
  let pointerLocked = false;
  let dragLooking = false;
  let colliders = [];           // [{ minX, maxX, minZ, maxZ }]
  let bounds = null;            // { minX, maxX, minZ, maxZ } the walkable extent
  let walkTime = 0;             // for the head bob
  let bobScale = 1;             // trampoline beds double it
  let eyeOffset = 0;            // added to the camera height (waking up on the sofa)
  let moving = false;
  let lastPointerType = 'mouse';
  let padUse = false;
  let onUseFn = null;           // walk.js: the player pressed "use"

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const move = new THREE.Vector3();
  const base = new THREE.Vector3(); // the camera position before the head bob

  // --- look -------------------------------------------------------------------
  function applyLook() {
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
  }
  function rotateBy(dx, dy, gain) {
    yaw -= dx * gain;
    pitch -= dy * gain;
    applyLook();
  }
  function setLook(y, p = 0) { yaw = y; pitch = p; applyLook(); }
  function lookAt(target) {
    const d = new THREE.Vector3().subVectors(target, base.lengthSq() ? base : camera.position);
    yaw = Math.atan2(-d.x, -d.z);
    pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    applyLook();
  }

  // --- input ------------------------------------------------------------------
  function onKeyDown(e) {
    if (!enabled || isEditable(e.target)) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': keys.forward = true; break;
      case 'KeyS': case 'ArrowDown': keys.back = true; break;
      case 'KeyA': case 'ArrowLeft': keys.left = true; break;
      case 'KeyD': case 'ArrowRight': keys.right = true; break;
      case 'KeyE': case 'Space': case 'Enter': case 'NumpadEnter':
        // Space and Enter still press a focused button (SKIP, SOUND); E is never a button key
        if (e.code !== 'KeyE' && e.target !== domElement && e.target.closest && e.target.closest('button, a, [role="button"]')) return;
        if (!e.repeat && onUseFn) onUseFn();
        break;
      default: return;
    }
    e.preventDefault();
  }
  function onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': keys.forward = false; break;
      case 'KeyS': case 'ArrowDown': keys.back = false; break;
      case 'KeyA': case 'ArrowLeft': keys.left = false; break;
      case 'KeyD': case 'ArrowRight': keys.right = false; break;
    }
  }
  function onMouseMove(e) {
    if (!enabled) return;
    if (pointerLocked || dragLooking) rotateBy(e.movementX || 0, e.movementY || 0, LOOK_GAIN_MOUSE);
  }
  function onLockChange() { pointerLocked = document.pointerLockElement === domElement; }
  function onPointerDown(e) {
    lastPointerType = e.pointerType || 'mouse';
    if (!enabled || e.pointerType === 'touch' || e.button !== 0) return;
    if (pointerLocked && onUseFn) onUseFn();
    dragLooking = !pointerLocked;
    if (!pointerLocked) requestLock();
  }
  function onPointerUp() { dragLooking = false; }
  function requestLock() {
    if (lastPointerType === 'touch' || !domElement.requestPointerLock) return;
    try {
      const p = domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* older browsers throw synchronously */ }
  }

  // --- touch: joystick (left) + look (right) --------------------------------------
  const touch = { movePointer: null, lookPointer: null, moveStart: null, lookLast: null, onJoystick: null };
  const JOY_RADIUS = 46;
  function onTouchDown(e) {
    if (!enabled || e.pointerType !== 'touch') return;
    if (e.clientX < window.innerWidth * 0.45 && touch.movePointer === null) {
      touch.movePointer = e.pointerId;
      touch.moveStart = { x: e.clientX, y: e.clientY };
      if (touch.onJoystick) touch.onJoystick('show', e.clientX, e.clientY, 0, 0);
    } else if (touch.lookPointer === null) {
      touch.lookPointer = e.pointerId;
      touch.lookLast = { x: e.clientX, y: e.clientY };
    } else return;
    try { domElement.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    e.preventDefault();
  }
  function onTouchMove(e) {
    if (e.pointerId === touch.movePointer) {
      let dx = (e.clientX - touch.moveStart.x) / JOY_RADIUS;
      let dy = -(e.clientY - touch.moveStart.y) / JOY_RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      axis.x = dx; axis.y = dy;
      if (touch.onJoystick) touch.onJoystick('move', touch.moveStart.x, touch.moveStart.y, dx, dy);
    } else if (e.pointerId === touch.lookPointer) {
      rotateBy(e.clientX - touch.lookLast.x, e.clientY - touch.lookLast.y, LOOK_GAIN_TOUCH);
      touch.lookLast = { x: e.clientX, y: e.clientY };
    }
  }
  function onTouchUp(e) {
    if (e.pointerId === touch.movePointer) {
      touch.movePointer = null;
      axis.x = axis.y = 0;
      if (touch.onJoystick) touch.onJoystick('hide', 0, 0, 0, 0);
    } else if (e.pointerId === touch.lookPointer) {
      touch.lookPointer = null;
    }
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointerdown', onTouchDown);
  domElement.addEventListener('pointermove', onTouchMove);
  domElement.addEventListener('pointerup', onTouchUp);
  domElement.addEventListener('pointercancel', onTouchUp);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);

  // --- movement + collision ------------------------------------------------------------
  function collides(x, z) {
    if (bounds && (x - RADIUS < bounds.minX || x + RADIUS > bounds.maxX || z - RADIUS < bounds.minZ || z + RADIUS > bounds.maxZ)) return true;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
    }
    return false;
  }

  function update(delta) {
    if (!enabled) return;
    // Xbox controller (added for the Look Over There host): left stick walks, right stick looks, X / A is "use"
    const gp = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find((g) => g && g.connected);
    let padX = 0, padY = 0;
    if (gp) {
      const dz = (v, t) => (Math.abs(v) < t ? 0 : Math.sign(v) * (Math.abs(v) - t) / (1 - t));
      padX = dz(gp.axes[0] || 0, 0.16); padY = -dz(gp.axes[1] || 0, 0.16);
      const lx = dz(gp.axes[2] || 0, 0.12), ly = dz(gp.axes[3] || 0, 0.12);
      if (lx || ly) rotateBy(lx * 2.6 * delta, ly * 2.0 * delta, 1);
      const use = !!((gp.buttons[2] && gp.buttons[2].pressed) || (gp.buttons[0] && gp.buttons[0].pressed));
      if (use && !padUse && onUseFn) onUseFn();
      padUse = use;
    }
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    move.set(0, 0, 0);
    if (keys.forward) move.add(forward);
    if (keys.back) move.sub(forward);
    if (keys.right) move.add(right);
    if (keys.left) move.sub(right);
    if (axis.x || axis.y || padX || padY) {
      move.addScaledVector(forward, axis.y + padY);
      move.addScaledVector(right, axis.x + padX);
    }
    const len = move.length();
    moving = len > 0.01;
    if (moving) {
      if (len > 1) move.divideScalar(len);
      move.multiplyScalar(MOVE_SPEED * delta);
      // Slide: each axis on its own, a few sub-steps so a fast frame cannot tunnel.
      const steps = 2;
      for (let s = 0; s < steps; s++) {
        const nx = base.x + move.x / steps;
        if (!collides(nx, base.z)) base.x = nx;
        const nz = base.z + move.z / steps;
        if (!collides(base.x, nz)) base.z = nz;
      }
      walkTime += delta * (reducedMotion ? 0 : 1);
    }
    // Head bob: a slow vertical sway and a smaller lateral one, faded out when standing.
    const bob = reducedMotion ? 0 : (moving ? bobScale : 0);
    camera.position.set(
      base.x + Math.sin(walkTime * 6.2) * 0.012 * bob,
      base.y + eyeOffset + Math.abs(Math.sin(walkTime * 6.2)) * 0.028 * bob,
      base.z,
    );
  }

  function setPosition(x, y, z) { base.set(x, y, z); camera.position.copy(base); camera.position.y += eyeOffset; }
  function setBobScale(s) { bobScale = s; }
  function setEyeOffset(dy) { eyeOffset = dy; }
  function position() { return base; }
  function setColliders(list, extent) { colliders = list || []; bounds = extent || null; }
  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) {
      keys.forward = keys.back = keys.left = keys.right = false;
      axis.x = axis.y = 0;
      dragLooking = false;
      if (touch.onJoystick) touch.onJoystick('hide', 0, 0, 0, 0);
      if (pointerLocked && document.exitPointerLock) document.exitPointerLock();
    }
  }
  function isMoving() { return moving; }
  function getLook() { return { yaw, pitch }; }
  function setKeys(next = {}) { Object.assign(keys, { forward: !!next.forward, back: !!next.back, left: !!next.left, right: !!next.right }); }
  function onJoystick(fn) { touch.onJoystick = fn; }
  function onUse(fn) { onUseFn = fn; }

  function dispose() {
    setEnabled(false);
    onUseFn = null;
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('pointerdown', onTouchDown);
    domElement.removeEventListener('pointermove', onTouchMove);
    domElement.removeEventListener('pointerup', onTouchUp);
    domElement.removeEventListener('pointercancel', onTouchUp);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
  }

  return {
    update, setPosition, position, setLook, getLook, lookAt, rotateBy, setColliders, setEnabled,
    isMoving, setKeys, onJoystick, onUse, dispose, EYE_HEIGHT, setBobScale, setEyeOffset,
  };
}
