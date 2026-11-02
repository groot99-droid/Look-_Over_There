// One fixed pool of real lights for the whole building.
//
// three.js compiles a shader per material per light COUNT. If every room
// brought its own lights, joining a room or dropping one would change the
// count and recompile every material in sight -- a visible hitch at every
// doorway. So rooms only describe lights (room.js `lightSpecs`), and this
// rig owns a constant set -- one sun (the only shadow caster), one ambient,
// one hemisphere, N point lights, M spots -- and each frame hands the pool
// to the specs that matter most: the room the player is in first, then
// the connector, then whatever is nearest. Slots that change hands fade,
// so a light never pops.
//
// Canon C2 lives here now: the sun's direction is the current room's
// "from the entrance side toward the core", turned with the room, so
// shadows fall toward the core in every room of the joined building.

import * as THREE from '../../vendor/three/three.module.js';

const FADE_S = 0.35;

function flickerOf(spec, t) {
  let k = 1;
  if (spec.pattern && spec.pattern.period) {
    // a deterministic cycle (the ENTER sign: 2.3 s, a short drop-out)
    const p = ((t + (spec.pattern.offset || 0)) % spec.pattern.period) / spec.pattern.period;
    const duty = spec.pattern.duty === undefined ? 0.9 : spec.pattern.duty;
    k *= p < duty ? 1 : (spec.pattern.low || 0.15);
  }
  if (spec.flicker) {
    const slow = Math.sin(t * 0.7 + spec.phase) * 0.5 + 0.5;
    const x = Math.sin(Math.floor((t + spec.phase) * spec.rate) * 12.9898) * 43758.5453;
    const fast = x - Math.floor(x);
    k *= 1 - spec.flicker * (0.25 * slow + 0.75 * (fast > 0.85 ? (fast - 0.85) * 6 : 0));
  }
  return k;
}

// A spec's live level (0..1): what its light shows now -- its flicker and
// pattern, a light beat's switch and ramp (levelOf), times the room's light
// level `scale` -- without a pool slot's hand-over fade, so it holds for a
// spec that has no slot this frame. A prop whose glow follows a light
// (rooms.json light `sync`, world.js bindSyncs) is set from it each frame.
export function liveLevel(spec, t, scale = spec.scale === undefined ? 1 : spec.scale) {
  const lvl = spec.lvl === undefined ? (spec.off ? 0 : 1) : spec.lvl;
  return flickerOf(spec, t) * lvl * scale;
}

export function createLightRig(scene, { points = 16, spots = 4, shadowMap = 2048 } = {}) {
  const ambient = new THREE.AmbientLight(0xffffff, 0);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0);
  const sun = new THREE.DirectionalLight(0xffffff, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMap, shadowMap);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 140;
  scene.add(ambient, hemi, sun, sun.target);

  const pointPool = [];
  for (let i = 0; i < points; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 1.5);
    l.position.set(0, -999, 0);
    scene.add(l);
    pointPool.push({ light: l, spec: null, fade: 0 });
  }
  const spotPool = [];
  for (let i = 0; i < spots; i++) {
    const l = new THREE.SpotLight(0xffffff, 0, 10, Math.PI / 4, 0.5, 1.5);
    l.position.set(0, -999, 0);
    scene.add(l, l.target);
    spotPool.push({ light: l, spec: null, fade: 0 });
  }

  const _dir = new THREE.Vector3();
  const _center = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _upL = new THREE.Vector3();
  const _UP = new THREE.Vector3(0, 1, 0);

  // A spec's own on/off level: `off` switches it, `fadeS` (a light beat's
  // `seconds`) makes the switch a ramp.
  function levelOf(s, dt) {
    const want = s.off ? 0 : 1;
    if (s.lvl === undefined) s.lvl = want;
    if (s.lvl !== want) {
      const step = s.fadeS ? dt / s.fadeS : 1;
      s.lvl = want > s.lvl ? Math.min(want, s.lvl + step) : Math.max(want, s.lvl - step);
    }
    return s.lvl;
  }

  function assign(pool, wanted, dt, t) {
    const wantedSet = new Set(wanted);
    // keep slots whose spec is still wanted
    const held = new Set();
    for (const slot of pool) if (slot.spec && wantedSet.has(slot.spec)) held.add(slot.spec);
    const newcomers = wanted.filter((s) => !held.has(s));
    for (const slot of pool) {
      if (slot.spec && !wantedSet.has(slot.spec)) {
        // fading out, faster while someone waits; handed over once dark
        slot.fade = Math.max(0, slot.fade - dt / (newcomers.length ? FADE_S * 0.35 : FADE_S));
        if (slot.fade <= 0) slot.spec = null;
      }
      if (!slot.spec && newcomers.length) { slot.spec = newcomers.shift(); slot.fade = 0; }
    }
    for (const slot of pool) {
      const l = slot.light;
      const s = slot.spec;
      if (!s) { l.intensity = 0; continue; }
      if (wantedSet.has(s)) slot.fade = Math.min(1, slot.fade + dt / FADE_S);
      l.position.set(s.world[0], s.world[1], s.world[2]);
      l.color.set(s.color);
      l.distance = s.distance;
      l.decay = s.decay;
      l.intensity = s.intensity * flickerOf(s, t) * slot.fade * (s.scale === undefined ? 1 : s.scale) * levelOf(s, dt);
      if (l.isSpotLight) {
        l.angle = THREE.MathUtils.degToRad(s.angle);
        l.penumbra = s.penumbra;
        l.target.position.set(s.worldTarget[0], s.worldTarget[1], s.worldTarget[2]);
        l.target.updateMatrixWorld();
      }
    }
  }

  return {
    sun,
    pointCount: points,
    // env: the blended atmosphere (env.js); specs: world-space light specs
    // already sorted best-first; center: where the shadow map should sit.
    update({ env, specs, center, dt, t }) {
      ambient.color.set(env.ambient.color);
      ambient.intensity = env.ambient.intensity;
      if (env.hemisphere) {
        hemi.color.set(env.hemisphere.sky);
        hemi.groundColor.set(env.hemisphere.ground);
        hemi.intensity = env.hemisphere.intensity;
      } else hemi.intensity = 0;
      if (env.sun && env.sun.intensity > 0) {
        sun.color.set(env.sun.color);
        sun.intensity = env.sun.intensity;
        _dir.set(env.sunDir[0], env.sunDir[1], env.sunDir[2]).normalize();
        _center.set(center[0], center[1], center[2]);
        const ext = env.shadowExtent || 14;
        // snap the shadow camera to its texel grid so shadows don't crawl
        // (in light space: a low sun stretches a world-XZ step over a
        // fraction of a texel, and every step re-rasterises the edges)
        const texel = (2 * ext) / sun.shadow.mapSize.x;
        _right.crossVectors(_dir, _UP);
        if (_right.lengthSq() > 1e-8) {
          _right.normalize();
          _upL.crossVectors(_right, _dir);
          const sx = Math.round(_center.dot(_right) / texel) * texel;
          const sy = Math.round(_center.dot(_upL) / texel) * texel;
          const sd = _center.dot(_dir);
          _center.copy(_right).multiplyScalar(sx).addScaledVector(_upL, sy).addScaledVector(_dir, sd);
        } else {
          _center.x = Math.round(_center.x / texel) * texel;
          _center.z = Math.round(_center.z / texel) * texel;
        }
        sun.position.copy(_center).addScaledVector(_dir, -60);
        sun.target.position.copy(_center);
        sun.target.updateMatrixWorld();
        const cam = sun.shadow.camera;
        if (cam.right !== ext) {
          cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
          cam.updateProjectionMatrix();
        }
      } else sun.intensity = 0;
      const pts = [], sps = [];
      for (const s of specs) {
        if (s.type === 'spot') { if (sps.length < spotPool.length) sps.push(s); } else if (pts.length < pointPool.length) pts.push(s);
      }
      assign(pointPool, pts, dt, t);
      assign(spotPool, sps, dt, t);
    },
    _debug() {
      return {
        points: pointPool.filter((s) => s.spec).length,
        spots: spotPool.filter((s) => s.spec).length,
        sun: sun.intensity
      };
    }
  };
}
