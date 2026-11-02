// First-person controls for the continuous building, ported from the
// Earth_Worldbuild museum walkthrough (_Museum/web/js/controls.js +
// touch.js): WASD / arrows to walk, Shift to hurry, pointer-lock or
// click-drag to look, axis-separated raycasts against the wall list so the
// player slides along walls (one at knee height for the low things -- a
// chair, a hydrant, a car's flank -- one at chest height), a downward ray
// for the floor that eases over steps and kerbs instead of snapping, and a
// swim mode for the dive. Raycasts run in world space, so rooms placed
// anywhere in the joined building collide as they are. Touch: left half
// joystick, right half drag-to-look.
//
// A blocked axis is not cancelled but clamped: the step is cut to the hit
// distance less the body's radius, so a long step (a slow frame on a slow
// machine) still brings him right up to a wall or a door's face rather than
// stopping him short of it by up to a whole step.
//
// Swimming has no ascent (C3: nothing climbs after the lobby doors): the
// vertical part of a stroke -- keys or the touch joystick, both steer along
// the look direction -- only ever goes down, and the record's `swim.sink`
// (metres a second, optional) lets the water take him down slowly while he
// floats. The swim floor still stops him.

import * as THREE from '../../vendor/three/three.module.js';

// Look Over There host: ?scale=k makes the rooms larger by making the walker smaller (eye height, pace, body radius and step all shrink by k).
export const SCALE = Math.max(1, parseFloat(new URLSearchParams(location.search).get('scale')) || 1);
export const EYE_HEIGHT = 1.6 / SCALE;
const MOVE_SPEED = 2.6 / SCALE; // m/s -- slower than the museum's 4.2: this is an intern, not a tourist
const SPRINT_SPEED = 4.0 / SCALE;
const SWIM_SPEED = 1.2 / SCALE;
const COLLIDE_RADIUS = 0.35 / SCALE;
const SKIN = 0.002; // left between his radius and a wall when a step is clamped
const STEP_UP = 0.45 / SCALE;
const STEP_DOWN = 1.0;
const GRAVITY = 9.8;
const LOOK_SENS = 0.0022;
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

function isEditable(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export function createControls(camera, domElement, getCollidables, { onBump = null } = {}) {
  const keys = { forward: false, back: false, left: false, right: false, sprint: false };
  const axis = { x: 0, y: 0 };
  let yaw = 0;
  let pitch = 0;
  let pointerLocked = false;
  let dragLooking = false;
  let lastPointerType = 'mouse';
  let moved = 0; // metres walked this frame (footstep cadence)
  let eyeOffset = 0; // head-bob, added on top of EYE_HEIGHT wherever the floor sets y
  let enabled = true;
  let lockable = true;
  let swim = null;      // { floorY, ceilingY, sink } while swimming
  let footY = null;     // smoothed floor height under the player
  let fallV = 0;
  let lastFloor = null;
  let speedScale = 1;
  let lastSafe = null;  // the last place he stood on a floor (a fall too far puts him back)

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const raycaster = new THREE.Raycaster();
  const forwardVec = new THREE.Vector3();
  const rightVec = new THREE.Vector3();
  const moveVec = new THREE.Vector3();
  const rayOrigin = new THREE.Vector3();
  const axisDir = new THREE.Vector3();

  function onKeyDown(e) {
    if (isEditable(e.target)) return;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': keys.forward = true; break;
      case 'KeyS': case 'ArrowDown': keys.back = true; break;
      case 'KeyA': case 'ArrowLeft': keys.left = true; break;
      case 'KeyD': case 'ArrowRight': keys.right = true; break;
      case 'ShiftLeft': case 'ShiftRight': keys.sprint = true; return;
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
      case 'ShiftLeft': case 'ShiftRight': keys.sprint = false; break;
      default: break;
    }
  }
  function onBlur() { keys.forward = keys.back = keys.left = keys.right = keys.sprint = false; }
  function rotateRadians(dYaw, dPitch) {
    if (!enabled) return;
    yaw -= dYaw;
    pitch -= dPitch;
    pitch = Math.max(-Math.PI / 2 + 0.08, Math.min(Math.PI / 2 - 0.08, pitch));
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
  }
  function onMouseMove(e) {
    if (pointerLocked || dragLooking) rotateRadians((e.movementX || 0) * LOOK_SENS, (e.movementY || 0) * LOOK_SENS);
  }
  function onLockChange() { pointerLocked = document.pointerLockElement === domElement; }
  function onPointerDown(e) {
    lastPointerType = e.pointerType || 'mouse';
    if (e.button !== 0 || lastPointerType === 'touch') return;
    if (!pointerLocked && enabled) dragLooking = true;
  }
  function onPointerUp() { dragLooking = false; }
  function requestLock() {
    if (lastPointerType === 'touch' || !lockable || !enabled) return;
    const p = domElement.requestPointerLock && domElement.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }
  function onClick() { requestLock(); }

  domElement.addEventListener('click', onClick);
  domElement.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);

  function firstHit(origin, dir, dist, walls) {
    if (dist <= 0 || !walls.length) return null;
    raycaster.set(origin, dir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(walls, false);
    return hits.length > 0 && hits[0].distance < dist ? hits[0] : null;
  }

  // Blocked along one axis? The nearest hit of the rays at each height
  // (its distance clamps the step), or null.
  const SWIM_HEIGHTS = [0];
  const WALK_HEIGHTS = [1.0 / SCALE, 0.45 / SCALE, 1.5 / SCALE];
  function blockedAxis(x, z, feetY, dir, dist, walls) {
    // knee, chest and head height: a lintel lower than the eye (the store's
    // 1.1 m hatch) must stop him, not let the camera through the wall
    let best = null;
    for (const h of swim ? SWIM_HEIGHTS : WALK_HEIGHTS) {
      rayOrigin.set(x, swim ? camera.position.y : feetY + h, z);
      const hit = firstHit(rayOrigin, dir, best ? best.distance : dist, walls);
      if (hit) best = hit;
    }
    return best;
  }
  // How far along one axis he may go: the whole step, or up to the wall.
  function clampStep(step, hit) {
    if (!hit) return step;
    if (onBump) onBump(hit.object);
    return Math.sign(step) * Math.max(0, Math.min(Math.abs(step), hit.distance - COLLIDE_RADIUS - SKIN));
  }

  function tryMove(delta) {
    if (swim && moveVec.y > 0) moveVec.y = 0; // no ascent (C3)
    const len = moveVec.length();
    if (len === 0) return;
    if (len > 1) moveVec.divideScalar(len);
    const speed = (swim ? SWIM_SPEED : (keys.sprint || padSprint) ? SPRINT_SPEED : MOVE_SPEED) * speedScale;
    moveVec.multiplyScalar(speed * delta);
    const { walls } = getCollidables();
    const feetY = camera.position.y - EYE_HEIGHT - eyeOffset;
    let dx = 0, dz = 0;
    if (Math.abs(moveVec.x) > 0) {
      axisDir.set(Math.sign(moveVec.x), 0, 0);
      dx = clampStep(moveVec.x, blockedAxis(camera.position.x, camera.position.z, feetY, axisDir, Math.abs(moveVec.x) + COLLIDE_RADIUS, walls));
    }
    if (Math.abs(moveVec.z) > 0) {
      axisDir.set(0, 0, Math.sign(moveVec.z));
      dz = clampStep(moveVec.z, blockedAxis(camera.position.x + dx, camera.position.z, feetY, axisDir, Math.abs(moveVec.z) + COLLIDE_RADIUS, walls));
    }
    camera.position.x += dx;
    camera.position.z += dz;
    if (swim && Math.abs(moveVec.y) > 0) {
      camera.position.y = Math.min(swim.ceilingY, Math.max(swim.floorY, camera.position.y + moveVec.y));
    }
    moved = Math.hypot(dx, dz);
  }

  // The floor under the player, eased: kerbs and treads are climbed, not
  // teleported onto. With nothing underfoot he falls.
  function followFloor(delta, snap = false) {
    if (swim) return;
    const { floors } = getCollidables();
    if (!floors || floors.length === 0) return;
    const feetY = footY === null ? camera.position.y - EYE_HEIGHT - eyeOffset : footY;
    // snapping (a teleport, the end of a carried move) looks down from the eye,
    // so a camera left low (seated) still finds the floor under it
    rayOrigin.set(camera.position.x, snap ? camera.position.y + 0.2 : feetY + STEP_UP, camera.position.z);
    raycaster.set(rayOrigin, DOWN);
    raycaster.far = snap ? 50 : STEP_UP + STEP_DOWN;
    const hits = raycaster.intersectObjects(floors, false);
    if (hits.length > 0) {
      const target = hits[0].point.y;
      lastFloor = hits[0].object;
      fallV = 0;
      if (footY === null || snap) footY = target;
      else footY += (target - footY) * Math.min(1, delta * 14);
      lastSafe = { x: camera.position.x, y: footY, z: camera.position.z };
    } else if (footY !== null) {
      fallV += GRAVITY * delta;
      footY -= fallV * delta;
      lastFloor = null;
      if (lastSafe && footY < lastSafe.y - 6) {
        // nothing under him for six metres: a hole in the building that should
        // not be there. Back to where he last stood.
        camera.position.x = lastSafe.x;
        camera.position.z = lastSafe.z;
        footY = lastSafe.y;
        fallV = 0;
      }
    }
    if (footY !== null) camera.position.y = footY + EYE_HEIGHT + eyeOffset;
  }
  // Smoothed toward `target` so the bob eases in and out with the stride
  // instead of snapping when a key is released.
  function setEyeOffset(target, delta) {
    const k = Math.min(1, (delta || 0.016) * 10);
    eyeOffset += (target - eyeOffset) * k;
  }

  let padSprint = false;
  function update(delta) {
    moved = 0;
    if (!enabled) return;
    // Xbox controller (added for the Look Over There host): left stick walks, right stick looks, RB / R-stick click sprints
    let padX = 0, padY = 0;
    const gp = (navigator.getGamepads ? [...navigator.getGamepads()] : []).find((g) => g && g.connected);
    if (gp) {
      const dzf = (v, t) => (Math.abs(v) < t ? 0 : Math.sign(v) * (Math.abs(v) - t) / (1 - t));
      padX = dzf(gp.axes[0] || 0, 0.16); padY = -dzf(gp.axes[1] || 0, 0.16);
      const lx = dzf(gp.axes[2] || 0, 0.12), ly = dzf(gp.axes[3] || 0, 0.12);
      if (lx || ly) rotateRadians(lx * 2.6 * delta, ly * 2.0 * delta);
      padSprint = !!((gp.buttons[5] && gp.buttons[5].pressed) || (gp.buttons[11] && gp.buttons[11].pressed));
    } else padSprint = false;
    camera.getWorldDirection(forwardVec);
    if (!swim) forwardVec.y = 0;
    forwardVec.normalize();
    rightVec.crossVectors(forwardVec, UP).normalize();
    moveVec.set(0, 0, 0);
    if (keys.forward) moveVec.add(forwardVec);
    if (keys.back) moveVec.sub(forwardVec);
    if (keys.right) moveVec.add(rightVec);
    if (keys.left) moveVec.sub(rightVec);
    if (axis.x || axis.y || padX || padY) {
      moveVec.addScaledVector(forwardVec, axis.y + padY);
      moveVec.addScaledVector(rightVec, axis.x + padX);
    }
    tryMove(delta);
    if (swim && swim.sink > 0) camera.position.y = Math.max(swim.floorY, camera.position.y - swim.sink * delta);
    followFloor(delta);
  }

  function setLook(y, p = 0) {
    yaw = y;
    pitch = p;
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
  }
  // After a carried camera move: pick yaw / pitch back up from wherever the
  // camera was left looking.
  function syncFromCamera() {
    euler.setFromQuaternion(camera.quaternion, 'YXZ');
    yaw = euler.y;
    pitch = Math.max(-Math.PI / 2 + 0.08, Math.min(Math.PI / 2 - 0.08, euler.x));
    setLook(yaw, pitch);
    footY = camera.position.y - EYE_HEIGHT - eyeOffset;
    followFloor(0, true);
  }
  function setMoveAxis(x, y) {
    const len = Math.hypot(x, y);
    const s = len > 1 ? 1 / len : 1;
    axis.x = x * s;
    axis.y = y * s;
  }
  // World position (y = the floor under the feet) and facing in degrees.
  function teleport(x, y, z, yawDeg = 0, pitchDeg = 0) {
    footY = y;
    fallV = 0;
    camera.position.set(x, y + EYE_HEIGHT, z);
    setLook(THREE.MathUtils.degToRad(yawDeg || 0), THREE.MathUtils.degToRad(pitchDeg || 0));
    followFloor(0, true);
  }
  function release() {
    if (pointerLocked && document.exitPointerLock) document.exitPointerLock();
  }
  function dispose() {
    release();
    domElement.removeEventListener('click', onClick);
    domElement.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('blur', onBlur);
  }

  return {
    update, setLook, setMoveAxis, teleport, release, dispose, rotateRadians, setEyeOffset, syncFromCamera, requestLock,
    setEnabled(v) { enabled = !!v; if (!enabled) { dragLooking = false; onBlur(); setMoveAxis(0, 0); } },
    setLockable(v) { lockable = !!v; if (!lockable) release(); },
    // v: { floorY, ceilingY, sink } in world metres (sink in m/s, optional), or null
    setSwim(v) { swim = v ? { floorY: v.floorY, ceilingY: v.ceilingY, sink: Math.max(0, v.sink || 0) } : null; if (!swim) footY = camera.position.y - EYE_HEIGHT; },
    setSpeedScale(v) { speedScale = v; },
    isEnabled: () => enabled,
    isSprinting: () => keys.sprint,
    isSwimming: () => !!swim,
    movedThisFrame: () => moved,
    isPointerLocked: () => pointerLocked,
    floorObject: () => lastFloor,
    feetY: () => (footY === null ? camera.position.y - EYE_HEIGHT : footY),
    yawDeg: () => THREE.MathUtils.radToDeg(yaw),
    state: () => ({ position: camera.position.toArray(), yaw, pitch })
  };
}

// Touch: left half of the layer is a virtual joystick, right half drags to look.
export function createTouchControls({ domElement, overlay, controls }) {
  const enabled = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  if (!enabled) return { enabled: false, dispose() {} };

  const joy = document.createElement('div');
  joy.className = 'walk-joystick';
  joy.innerHTML = '<div class="knob"></div>';
  overlay.appendChild(joy);
  const knob = joy.querySelector('.knob');

  const RADIUS = 50;
  const LOOK_GAIN = 0.0045;
  let movePointer = null, lookPointer = null;
  let moveStart = null, lookLast = null;

  function setKnob(dx, dy) { knob.style.transform = `translate(${dx}px, ${dy}px)`; }

  function onDown(e) {
    if (e.pointerType !== 'touch') return;
    if (e.clientX < window.innerWidth / 2 && movePointer === null) {
      movePointer = e.pointerId;
      moveStart = { x: e.clientX, y: e.clientY };
    } else if (lookPointer === null) {
      lookPointer = e.pointerId;
      lookLast = { x: e.clientX, y: e.clientY };
    } else return;
    try { domElement.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  }
  function onMove(e) {
    if (e.pointerId === movePointer) {
      let dx = (e.clientX - moveStart.x) / RADIUS;
      let dy = -(e.clientY - moveStart.y) / RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      controls.setMoveAxis(dx, dy);
      setKnob(dx * RADIUS * 0.8, -dy * RADIUS * 0.8);
    } else if (e.pointerId === lookPointer) {
      controls.rotateRadians((e.clientX - lookLast.x) * LOOK_GAIN, (e.clientY - lookLast.y) * LOOK_GAIN);
      lookLast = { x: e.clientX, y: e.clientY };
    }
  }
  function onUp(e) {
    if (e.pointerId === movePointer) {
      movePointer = null;
      controls.setMoveAxis(0, 0);
      setKnob(0, 0);
    } else if (e.pointerId === lookPointer) {
      lookPointer = null;
    }
  }
  domElement.addEventListener('pointerdown', onDown);
  domElement.addEventListener('pointermove', onMove);
  domElement.addEventListener('pointerup', onUp);
  domElement.addEventListener('pointercancel', onUp);

  return {
    enabled: true,
    dispose() {
      domElement.removeEventListener('pointerdown', onDown);
      domElement.removeEventListener('pointermove', onMove);
      domElement.removeEventListener('pointerup', onUp);
      domElement.removeEventListener('pointercancel', onUp);
      joy.remove();
    }
  };
}
