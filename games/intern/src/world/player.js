// The candidate's body: controls.js plus what walking sounds and feels
// like -- footsteps that answer the floor (marble rings, carpet swallows,
// the grate clanks), a head-bob driven by distance walked (none under
// prefers-reduced-motion), a slight lean into a hurry, and the touch
// joystick. Always on from the first frame; the director turns it off for
// carried moments (sitting at the computer, the cab's descent, the fall).

import * as THREE from '../../vendor/three/three.module.js';
import { createControls, createTouchControls, EYE_HEIGHT } from '../walk/controls.js';

const STRIDE_M = 0.72;
const BOB_AMPLITUDE = 0.032;
const BOB_RATE = 2 * Math.PI / STRIDE_M;
export const WALK_FOV = 68;

// Footstep voice per floor surface (a material slot from materials.js).
const FOOTSTEP_BY_SURFACE = {
  marble: { filterHz: 1600, gain: 0.13 }, marble_light: { filterHz: 1700, gain: 0.13 },
  carpet: { filterHz: 380, gain: 0.07 }, carpet_red: { filterHz: 360, gain: 0.07 },
  concrete: { filterHz: 800, gain: 0.12 }, concrete_wet: { filterHz: 900, gain: 0.13 }, garage_floor: { filterHz: 760, gain: 0.12 },
  asphalt: { filterHz: 700, gain: 0.11 }, linoleum: { filterHz: 1200, gain: 0.11 }, pool_tile: { filterHz: 1900, gain: 0.12 },
  grate: { filterHz: 2400, gain: 0.16 }, rust: { filterHz: 2000, gain: 0.15 }, paint_green: { filterHz: 850, gain: 0.12 },
  diamond_plate: { filterHz: 2200, gain: 0.15 }, // the freight cab's floor (S7 C)
  cardboard: { filterHz: 500, gain: 0.09 }, plaster: { filterHz: 800, gain: 0.11 }
};

export function createPlayer({ camera, domElement, overlay, world, sfx = null, onBump = null }) {
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const controls = createControls(camera, domElement, () => world.collidables(), { onBump });
  const touch = overlay ? createTouchControls({ domElement, overlay, controls }) : { enabled: false, dispose() {} };
  let strideAcc = 0;
  let bobPhase = 0;
  let fovKick = 0;
  let baseFov = WALK_FOV;
  let footstepOverride = null;

  function update(dt) {
    controls.update(dt);
    const moved = controls.movedThisFrame();
    strideAcc += moved;
    bobPhase += moved * BOB_RATE;
    if (strideAcc >= STRIDE_M) {
      strideAcc -= STRIDE_M;
      const floor = controls.floorObject();
      const surface = floor && floor.userData ? floor.userData.surface : null;
      const voice = footstepOverride || FOOTSTEP_BY_SURFACE[surface] || {};
      if (sfx && !controls.isSwimming()) sfx.play('footstep', voice);
    }
    const sprint = controls.isSprinting() && moved > 0;
    const amp = reduceMotion || controls.isSwimming() ? 0 : BOB_AMPLITUDE * (sprint ? 1.4 : 1);
    controls.setEyeOffset(moved > 0 ? Math.sin(bobPhase) * amp : 0, dt);
    // a few degrees wider in a hurry
    fovKick += ((sprint && !reduceMotion ? 4 : 0) - fovKick) * Math.min(1, dt * 4);
    if (controls.isEnabled()) {
      const fov = baseFov + fovKick;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    }
  }

  return {
    controls,
    update,
    position: () => [camera.position.x, camera.position.y, camera.position.z],
    feet: () => [camera.position.x, controls.feetY(), camera.position.z],
    yawDeg: () => controls.yawDeg(),
    teleport: (x, y, z, yawDeg, pitchDeg) => controls.teleport(x, y, z, yawDeg, pitchDeg),
    enable() { controls.syncFromCamera(); controls.setEnabled(true); controls.setLockable(true); },
    disable({ releasePointer = false } = {}) { controls.setEnabled(false); if (releasePointer) controls.setLockable(false); },
    setLockable: (v) => controls.setLockable(v),
    isEnabled: () => controls.isEnabled(),
    setSwim: (v) => controls.setSwim(v),
    setSpeedScale: (v) => controls.setSpeedScale(v),
    setFootstep(v) { footstepOverride = v; },
    setBaseFov(f) { baseFov = f; },
    eyeHeight: EYE_HEIGHT,
    touchEnabled: () => touch.enabled,
    dispose() { controls.dispose(); touch.dispose(); }
  };
}
