// The continuous building. Every room the player can stand in -- a scene's
// set, a connector between two sets -- is an INSTANCE: a room built by
// room.js, placed in one shared world space by a matrix (src/world/
// anchors.js). There are no cuts: when a threshold is committed the next
// set is joined behind the exit door through a connector, the player walks
// through, the door seals behind him and the room he left is dropped.
//
// What the world owns:
//   - building (and pre-building) rooms, keyed by the base set an alias
//     points at, so S2_C and S1_C are one room, not two;
//   - placing, moving and dropping instances;
//   - the colliders of everything live, for controls.js;
//   - which instance the player is standing in;
//   - the atmosphere (env.js): one room's, or two blended across a
//     connector by how far along it the player is; an env beat (setEnv)
//     moves one live room's own, and the blend reads it live;
//   - the light pool (lights.js), fed with every live instance's lights,
//     and the props whose glow follows one of them (a light's `sync`).

import * as THREE from '../../vendor/three/three.module.js';
import { buildRoom } from '../walk/room.js';
import { attachMatrix, anchorToWorld, interiorBox, poseToWorld } from './anchors.js';
import { blendEnv, BLACK_ENV, envPieces, envAim, envLerpInto } from './env.js';
import { createLightRig, liveLevel } from './lights.js';

const LIBRARY_WAIT_MS = 6000; // a room builds with box fallbacks if the library is slower than this

export function resolveRecord(rooms, key) {
  const rec = rooms && rooms.rooms[key];
  if (!rec) return null;
  if (rec.alias) return { ...rooms.rooms[rec.alias], ...rec, id: key, base: rec.alias };
  return { ...rec, id: key, base: key };
}

const smooth = (t) => t * t * (3 - 2 * t);

export function createWorld({ scene, mats, library, rooms, lightPool = {} }) {
  const rig = createLightRig(scene, lightPool);
  const pool = new Map();      // base key -> { promise, room } built, not placed
  const instances = [];        // live instances
  let nextId = 1;
  let current = null;          // the instance the player is in
  let env = BLACK_ENV;
  let envTarget = BLACK_ENV;
  const listeners = new Set();

  function record(key) {
    const rec = resolveRecord(rooms, key);
    if (!rec) throw new Error(`world: no room ${key}`);
    return rec;
  }
  function baseOf(key) { const r = resolveRecord(rooms, key); return r ? r.base : key; }

  async function waitLibrary(rec) {
    const needsLib = (rec.props || []).some((p) => p.type === 'glb');
    if (needsLib && library && !library.loaded() && !library.failed()) {
      await Promise.race([library.ready, new Promise((r) => setTimeout(r, LIBRARY_WAIT_MS))]);
    }
  }

  function buildNow(rec) {
    return buildRoom(mats, rec, { library });
  }

  // Build a room ahead of time (geometry, procedural textures, catalog
  // clones) without putting it in the scene. Connectors are never pooled:
  // each join gets its own.
  function prebuild(key) {
    const rec = record(key);
    if (rec.connector) return Promise.resolve(null);
    const base = rec.base;
    if (pool.has(base)) return pool.get(base).promise;
    const entry = { room: null, promise: null, taken: false };
    entry.promise = (async () => {
      await waitLibrary(rec);
      // yield to the frame loop so a build never lands in the middle of one
      await new Promise((r) => setTimeout(r, 0));
      if (entry.taken) return entry.room;
      entry.room = buildNow(rec);
      return entry.room;
    })();
    pool.set(base, entry);
    return entry.promise;
  }

  function isBuilt(key) {
    const rec = record(key);
    const e = pool.get(rec.base);
    return !!(e && e.room);
  }

  function takeBuilt(rec) {
    const e = pool.get(rec.base);
    if (e && e.room) { pool.delete(rec.base); return e.room; }
    if (e) { e.taken = true; pool.delete(rec.base); }
    return buildNow(rec);
  }

  function derive(inst) {
    const m = inst.matrix;
    inst.group.matrix.copy(m);
    inst.group.matrixWorld.copy(m);
    inst.group.updateMatrixWorld(true);
    inst.inv.copy(m).invert();
    const rot = new THREE.Matrix4().extractRotation(m);
    const room = inst.room;
    inst.anchorsWorld = {};
    for (const [k, a] of Object.entries(room.anchors)) inst.anchorsWorld[k] = anchorToWorld(m, a);
    inst.zonesWorld = room.zones.map((z) => {
      const y = z.pos.length === 3 ? z.pos[1] : (inst.rec.floorY || 0);
      const zz = z.pos.length === 3 ? z.pos[2] : z.pos[1];
      const p = new THREE.Vector3(z.pos[0], y, zz).applyMatrix4(m);
      const la = z.labelAt ? new THREE.Vector3(...z.labelAt).applyMatrix4(m) : p.clone().setY(p.y + 1.9);
      const out = { ...z, world: [p.x, p.y, p.z], labelWorld: [la.x, la.y, la.z] };
      if (z.seat) {
        // the chair this zone stands in front of: where he sits, which way he faces
        const fy = inst.rec.floorY || 0;
        const [sx, sz] = z.seat.pos, [fx, fz] = z.seat.face;
        const sp = new THREE.Vector3(sx, fy, sz).applyMatrix4(m);
        const sl = new THREE.Vector3(sx + fx * 3, fy, sz + fz * 3).applyMatrix4(m);
        out.seatWorld = { pos: [sp.x, sp.y, sp.z], look: [sl.x, sl.y, sl.z] };
      }
      return out;
    });
    for (const s of inst.lights) {
      const p = new THREE.Vector3(...s.pos).applyMatrix4(m);
      s.world = [p.x, p.y, p.z];
      if (s.target) { const t = new THREE.Vector3(...s.target).applyMatrix4(m); s.worldTarget = [t.x, t.y, t.z]; }
    }
    const e = room.env;
    let sunDir = [0, -1, 0];
    if (e.sun) {
      const d = new THREE.Vector3(e.sun.core[0] - e.sun.from[0], e.sun.core[1] - e.sun.from[1], e.sun.core[2] - e.sun.from[2]).normalize().applyMatrix4(rot);
      sunDir = [d.x, d.y, d.z];
    }
    // the same object for the instance's life (a link's `fromEnv` holds it),
    // with an env beat's pieces laid back over it after a move (the cab
    // moves every frame of its ride)
    inst.env = Object.assign(inst.env || {}, e, { sunDir });
    if (inst.envLive) applyEnvLive(inst);
    const c = new THREE.Vector3().applyMatrix4(m);
    inst.center = [c.x, c.y, c.z];
  }

  // ---- env beat: one live room's own atmosphere ------------------------------
  //
  // director.js `env` beat -> setEnv(inst, {fog, background, exposure,
  // ambient, sun, grain, vignette, base, seconds}) (env.js ENV_BEAT_KEYS).
  // The lerp is the instance's: it runs whether or not he is in the room,
  // a move keeps it, and the connector blend reads inst.env, so a room
  // joined or left mid-lerp blends from or into its live atmosphere.
  function applyEnvLive(inst) {
    const L = inst.envLive, env = inst.env;
    env.fog = L.fog;
    env.background = L.background;
    env.exposure = L.exposure;
    env.ambient = L.ambient;
    if (L.sun && env.sun) env.sun = L.sun;
    env.grain = L.grain;
    env.vignette = L.vignette;
  }
  function stepEnv(inst, dt) {
    const fx = inst.envFx;
    fx.t = fx.seconds > 0 ? Math.min(1, fx.t + dt / fx.seconds) : 1;
    envLerpInto(inst.envLive, fx.from, fx.to, smooth(fx.t));
    applyEnvLive(inst);
    if (fx.t >= 1) inst.envFx = null;
  }
  function setEnv(inst, beat) {
    if (!inst || !beat) return;
    const from = envPieces(inst.env);
    if (!inst.envLive) inst.envLive = envPieces(inst.env); // its own objects, never the record's
    inst.envFx = { from, to: envAim(from, beat, inst.room.env), t: 0, seconds: beat.seconds || 0 };
    stepEnv(inst, 0);
  }

  // ---- light sync: a prop's glow follows a light ------------------------------
  //
  // A light spec's `sync` (rooms.json: a prop name, or a list of them) ties
  // that named prop's glow to the light's live level -- its flicker, its
  // pattern, a light beat switching or ramping it, the room's light level
  // (lights.js liveLevel) -- every frame, so the two can never drift apart.
  // A builder that knows how its glow is made sets `userData.lightSync(k)`
  // on the prop's group (props.js entersign, dustmotes); for any other prop
  // the glowing materials (emissive, or an additive glow plate) are cloned
  // for it here, scaled, and freed with the instance.
  function glowFollower(g, clones) {
    const seen = new Map();
    const parts = [];
    g.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      const m = o.material;
      const emissive = m.emissive && m.emissiveIntensity > 0 && (m.emissive.r + m.emissive.g + m.emissive.b) > 0;
      const additive = m.blending === THREE.AdditiveBlending;
      if (!emissive && !additive) return;
      if (!seen.has(m)) {
        const c = m.clone();
        // three's clone() drops the per-material shader hook (the PS1 snap)
        c.onBeforeCompile = m.onBeforeCompile;
        c.customProgramCacheKey = m.customProgramCacheKey;
        clones.push(c);
        // a material the room owned is no longer on any of its meshes, so
        // room.dispose() would miss it: freed with the clones instead
        if (m.userData && m.userData.owned) clones.push(m);
        seen.set(m, c);
        parts.push({ mat: c, key: emissive ? 'emissiveIntensity' : 'opacity', base: emissive ? m.emissiveIntensity : m.opacity });
      }
      o.material = seen.get(m);
    });
    if (!parts.length) return null;
    return (k) => { for (const p of parts) p.mat[p.key] = p.base * k; };
  }
  function bindSyncs(inst) {
    const out = [];
    for (const s of inst.lights) {
      if (!s.sync) continue;
      for (const name of [].concat(s.sync)) {
        const g = inst.room.named.get(name);
        const fn = g && (g.userData.lightSync || glowFollower(g, inst.syncClones));
        if (fn) out.push({ spec: s, fn });
        else console.warn(`world: ${inst.key}: light sync names ${name}, no glowing prop of that name`);
      }
    }
    return out;
  }

  function spawn(key, matrix = new THREE.Matrix4(), { role = 'room' } = {}) {
    const rec = record(key);
    const room = takeBuilt(rec);
    const group = room.group;
    group.matrixAutoUpdate = false;
    const inst = {
      id: nextId++,
      key,
      base: rec.base,
      rec,
      room,
      group,
      role: rec.connector ? 'connector' : role,
      matrix: matrix.clone(),
      inv: new THREE.Matrix4(),
      box: interiorBox(rec),
      lights: room.lightSpecs.map((s) => ({ ...s })),
      lightLevel: 1,
      lightTarget: 1,
      link: null,
      envLive: null,   // an env beat's pieces (setEnv)
      envFx: null,     // its lerp, while it runs
      syncs: null,     // [{spec, fn}]: props following a light (bindSyncs)
      syncClones: []   // materials cloned for them (and owned ones they replace), freed in remove()
    };
    inst.syncs = bindSyncs(inst);
    derive(inst);
    scene.add(group);
    if (room.fixed) {
      // the room's fixed parts (room.js): placed with it, here, once --
      // move() never touches them, so they keep this world position
      room.fixed.matrixAutoUpdate = false;
      room.fixed.matrix.copy(inst.matrix);
      room.fixed.matrixWorld.copy(inst.matrix);
      room.fixed.updateMatrixWorld(true);
      scene.add(room.fixed);
    }
    instances.push(inst);
    return inst;
  }

  // Join `toKey` behind `fromInst`'s anchor `exitName`, entering through its
  // `entry` anchor (default: the record's own `entry`).
  function attach(fromInst, exitName, toKey, { entry = null, vertical = null } = {}) {
    const exit = fromInst.room.anchors[exitName];
    if (!exit) throw new Error(`world: ${fromInst.key} has no anchor "${exitName}"`);
    const rec = record(toKey);
    const entryName = entry || rec.entry;
    // the entry anchor is known from the record before the build: doors are data
    const tmp = takeBuiltPeek(rec);
    const entryAnchor = tmp.anchors[entryName];
    if (!entryAnchor) throw new Error(`world: ${toKey} has no entry anchor "${entryName}"`);
    const isVertical = vertical === null ? !!(exit.vertical || entryAnchor.vertical) : vertical;
    const m = attachMatrix(fromInst.matrix, exit, entryAnchor, { vertical: isVertical });
    const inst = spawn(toKey, m);
    inst.entryName = entryName;
    return inst;
  }
  // Anchors of a record without consuming its pooled build.
  function takeBuiltPeek(rec) {
    const e = pool.get(rec.base);
    if (e && e.room) return e.room;
    // build it now (a commit that outran its prebuild); spawn() will take it
    const room = buildNow(rec);
    pool.set(rec.base, { room, promise: Promise.resolve(room), taken: false });
    return room;
  }

  // Moves an instance (the cab's ride). Its fixed parts stay where spawn()
  // put them.
  function move(inst, matrix) {
    inst.matrix.copy(matrix);
    derive(inst);
  }

  function remove(inst) {
    const i = instances.indexOf(inst);
    if (i === -1) return;
    instances.splice(i, 1);
    scene.remove(inst.group);
    if (inst.room.fixed) scene.remove(inst.room.fixed);
    for (const m of inst.syncClones) m.dispose();
    inst.room.dispose();
    if (current === inst) current = null;
    for (const o of instances) if (o.link && (o.link.from === inst || o.link.to === inst)) {
      if (o.link.from === inst) o.link.from = null;
      if (o.link.to === inst) o.link.to = null;
    }
  }

  const _p = new THREE.Vector3();
  function contains(inst, pos) {
    _p.set(pos[0], pos[1], pos[2]).applyMatrix4(inst.inv);
    return inst.box.containsPoint(_p);
  }
  function locate(pos) {
    // connectors first: they sit inside nobody, but the reveal overlaps
    let best = null;
    for (const inst of instances) {
      if (!inst.group.visible) continue;
      if (contains(inst, pos)) {
        if (!best || (inst.role === 'connector' && best.role !== 'connector')) best = inst;
      }
    }
    return best;
  }

  // Progress 0..1 along a connector, from its entry anchor to its exit.
  function progress(inst, pos) {
    if (!inst || inst.role !== 'connector') return null;
    const a = inst.anchorsWorld.entry, b = inst.anchorsWorld.exit;
    if (!a || !b) return null;
    const ax = a.pos[0], az = a.pos[2], bx = b.pos[0], bz = b.pos[2];
    const len2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = ((pos[0] - ax) * (bx - ax) + (pos[2] - az) * (bz - az)) / len2;
    return Math.min(1, Math.max(0, t));
  }

  function collidables() {
    const walls = [], floors = [];
    for (const inst of instances) {
      if (!inst.group.visible) continue;
      for (const w of inst.room.blocking()) walls.push(w);
      for (const f of inst.room.floors) floors.push(f);
    }
    return { walls, floors };
  }

  function emit(type, payload) { for (const fn of listeners) fn(type, payload); }

  function update(dt, t, playerPos) {
    for (const inst of instances) {
      inst.room.update(dt, t);
      if (inst.envFx) stepEnv(inst, dt);
    }
    // where the player is
    const here = playerPos ? locate(playerPos) : current;
    if (here && here !== current) {
      const prev = current;
      current = here;
      emit('enter', { inst: here, prev });
    }
    // atmosphere: the current room's, blended across a connector
    if (current) {
      const p = progress(current, playerPos || current.center);
      if (p !== null && current.link) {
        // once the room behind is dropped the corridor keeps its atmosphere
        // (openWay records it), instead of the connector's own dark env
        const from = current.link.from ? current.link.from.env : (current.link.fromEnv || current.env);
        const to = current.link.to ? current.link.to.env : current.env;
        envTarget = blendEnv(from, to, smooth(p));
      } else envTarget = current.env;
    }
    env = blendEnv(env, envTarget, Math.min(1, dt * 5));
    // lights: the current room first, then its links, then the nearest
    const specs = [];
    for (const inst of instances) {
      inst.lightLevel += (inst.lightTarget - inst.lightLevel) * Math.min(1, dt * 3);
      if (!inst.group.visible || inst.lightLevel < 0.01) continue;
      const tier = inst === current ? 0 : (current && current.link && (current.link.from === inst || current.link.to === inst)) || (inst.link && inst.link.from === current) ? 1 : 2;
      for (const s of inst.lights) {
        if (s.off && !(s.lvl > 0)) { s.lvl = 0; continue; } // a dark lamp holds no slot (and fades up from dark)
        s.scale = inst.lightLevel;
        const d = playerPos ? Math.hypot(s.world[0] - playerPos[0], s.world[1] - playerPos[1], s.world[2] - playerPos[2]) : 0;
        s.rank = tier * 10000 + d;
        specs.push(s);
      }
    }
    specs.sort((a, b) => a.rank - b.rank);
    // keep point slots for the room being joined: a current room that could
    // fill the whole pool by itself (S6 H lights 16) gives up its farthest
    // lamps to a linked room's (they rank after the link, before the rest),
    // or the next room would stay dark until this one is dropped
    const NP = rig.pointCount || 16;
    let n1 = 0, n0 = 0;
    for (const s of specs) if (s.type !== 'spot') { if (s.rank < 10000) n0++; else if (s.rank < 20000) n1++; }
    const cap = NP - Math.min(n1, 6);
    if (n0 > cap) {
      let k = 0;
      for (const s of specs) if (s.type !== 'spot' && s.rank < 10000 && ++k > cap) s.rank += 15000;
      specs.sort((a, b) => a.rank - b.rank);
    }
    const ext = env.shadowExtent || 14;
    const center = current && current.box ? (Math.max(current.rec.size[0], current.rec.size[2]) * 0.75 <= 26 ? current.center : playerPos || current.center) : (playerPos || [0, 0, 0]);
    rig.update({ env: { ...env, shadowExtent: ext }, specs, center, dt, t });
    // after the rig: a synced prop shows the level its light was just given
    for (const inst of instances) {
      if (!inst.syncs.length || !inst.group.visible) continue;
      for (const y of inst.syncs) y.fn(liveLevel(y.spec, t, inst.lightLevel));
    }
    return env;
  }

  return {
    record,
    baseOf,
    prebuild,
    isBuilt,
    spawn,
    attach,
    move,
    remove,
    locate,
    progress,
    collidables,
    update,
    setEnv,
    poseToWorld: (inst, pose) => poseToWorld(inst.matrix, pose),
    current: () => current,
    setCurrent(inst) { current = inst; env = inst.env; envTarget = inst.env; },
    instances: () => instances.slice(),
    env: () => env,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    rig,
    clear() { for (const inst of instances.slice()) remove(inst); for (const e of pool.values()) if (e.room) e.room.dispose(); pool.clear(); },
    _debug() { return { instances: instances.map((i) => ({ id: i.id, key: i.key, role: i.role, visible: i.group.visible })), current: current ? current.key : null, pooled: [...pool.keys()], rig: rig._debug() }; }
  };
}
