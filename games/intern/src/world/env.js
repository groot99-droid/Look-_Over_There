// A room's atmosphere (room.js `env`, carried into world space by
// world.js), the blend between two of them, and the env beat's lerp of one
// room's own atmosphere. Pure: test-friendly.
//
// Inside a room the stage uses that room's env. Inside a connector it
// blends the room behind into the room ahead by how far along the
// connector the player is, so night turns to dawn on the stairs and the
// lobby's light comes up as the street's goes down -- without a fade.

import * as THREE from '../../vendor/three/three.module.js';

const _a = new THREE.Color();
const _b = new THREE.Color();

function mixColor(ca, cb, t) {
  _a.set(ca || '#000000');
  _b.set(cb || '#000000');
  return '#' + _a.lerp(_b, t).getHexString();
}
const mix = (a, b, t) => a + (b - a) * t;

export const BLACK_ENV = {
  ambient: { color: '#000000', intensity: 0 },
  hemisphere: null,
  sun: null,
  sunDir: [0, -1, 0],
  fog: { color: '#000000', near: 1, far: 40 },
  background: '#000000',
  exposure: 1,
  grain: 0.03,
  vignette: 0.55,
  shadowExtent: 12
};

function fogOf(env) {
  return env.fog || { color: env.background || '#000000', near: 400, far: 1200 };
}

// ---- the env beat (director.js `env`, world.js setEnv) ------------------------
//
// A beat may move ONE live room's own atmosphere: `env: {fog: {color, near,
// far}, background, exposure, ambient: {color, intensity}, sun: {color,
// intensity}, grain, vignette, base, seconds}`. Every piece is optional and
// a piece left out stays where it is; `base: true` aims at the room
// record's own atmosphere first (then the given pieces on top), so a beat
// can hand a room back to what build_rooms.py made it. The sun's colour and
// strength may change, never its direction (C2) or whether there is one.
// `seconds` is the lerp (0: at once).
export const ENV_BEAT_KEYS = ['fog', 'background', 'exposure', 'ambient', 'sun', 'grain', 'vignette', 'base', 'seconds'];

// The pieces an env beat moves, copied out of an env (its own objects, so
// a lerp written into them never touches the room record's).
export function envPieces(env) {
  const f = fogOf(env);
  return {
    fog: { color: f.color, near: f.near, far: f.far },
    background: env.background || '#000000',
    exposure: env.exposure === undefined ? 1 : env.exposure,
    ambient: { color: env.ambient ? env.ambient.color : '#000000', intensity: env.ambient ? env.ambient.intensity : 0 },
    sun: env.sun ? { color: env.sun.color, intensity: env.sun.intensity } : null,
    grain: env.grain === undefined ? 0.03 : env.grain,
    vignette: env.vignette === undefined ? 0.55 : env.vignette
  };
}

// Where a beat aims: `from` (the live pieces) or the room's own (`base`),
// with the beat's pieces laid over it.
export function envAim(from, beat, baseEnv) {
  const to = envPieces(beat.base && baseEnv ? baseEnv : from);
  if (beat.fog) Object.assign(to.fog, beat.fog);
  if (beat.background) to.background = beat.background;
  if (beat.exposure !== undefined) to.exposure = beat.exposure;
  if (beat.ambient) Object.assign(to.ambient, beat.ambient);
  if (beat.sun && to.sun) Object.assign(to.sun, beat.sun);
  if (beat.grain !== undefined) to.grain = beat.grain;
  if (beat.vignette !== undefined) to.vignette = beat.vignette;
  // a fog's colour is the background's unless the beat says otherwise
  if (beat.fog && beat.fog.color && !beat.background) to.background = beat.fog.color;
  return to;
}

// Writes a..b at t into `out` (pieces from envPieces) without allocating
// objects: the lerp runs every frame while it lasts.
export function envLerpInto(out, a, b, t) {
  out.fog.color = mixColor(a.fog.color, b.fog.color, t);
  out.fog.near = mix(a.fog.near, b.fog.near, t);
  out.fog.far = mix(a.fog.far, b.fog.far, t);
  out.background = mixColor(a.background, b.background, t);
  out.exposure = mix(a.exposure, b.exposure, t);
  out.ambient.color = mixColor(a.ambient.color, b.ambient.color, t);
  out.ambient.intensity = mix(a.ambient.intensity, b.ambient.intensity, t);
  if (out.sun && a.sun && b.sun) {
    out.sun.color = mixColor(a.sun.color, b.sun.color, t);
    out.sun.intensity = mix(a.sun.intensity, b.sun.intensity, t);
  }
  out.grain = mix(a.grain, b.grain, t);
  out.vignette = mix(a.vignette, b.vignette, t);
  return out;
}

// t = 0 -> a, t = 1 -> b. Missing pieces blend from/to nothing.
export function blendEnv(a, b, t) {
  if (!a) return b;
  if (!b || t <= 0) return a;
  if (t >= 1) return b;
  const fa = fogOf(a), fb = fogOf(b);
  const ha = a.hemisphere || { sky: '#000000', ground: '#000000', intensity: 0 };
  const hb = b.hemisphere || { sky: '#000000', ground: '#000000', intensity: 0 };
  const sa = a.sun || { color: '#000000', intensity: 0 };
  const sb = b.sun || { color: '#000000', intensity: 0 };
  const da = a.sunDir || [0, -1, 0], db = b.sunDir || [0, -1, 0];
  const d = [mix(da[0], db[0], t), mix(da[1], db[1], t), mix(da[2], db[2], t)];
  const dl = Math.hypot(d[0], d[1], d[2]) || 1;
  return {
    ambient: { color: mixColor(a.ambient.color, b.ambient.color, t), intensity: mix(a.ambient.intensity, b.ambient.intensity, t) },
    hemisphere: { sky: mixColor(ha.sky, hb.sky, t), ground: mixColor(ha.ground, hb.ground, t), intensity: mix(ha.intensity, hb.intensity, t) },
    sun: { color: mixColor(sa.color, sb.color, t), intensity: mix(sa.intensity, sb.intensity, t) },
    sunDir: [d[0] / dl, d[1] / dl, d[2] / dl],
    fog: { color: mixColor(fa.color, fb.color, t), near: mix(fa.near, fb.near, t), far: mix(fa.far, fb.far, t) },
    background: mixColor(a.background, b.background, t),
    exposure: mix(a.exposure, b.exposure, t),
    grain: mix(a.grain, b.grain, t),
    vignette: mix(a.vignette, b.vignette, t),
    shadowExtent: mix(a.shadowExtent || 12, b.shadowExtent || 12, t)
  };
}
