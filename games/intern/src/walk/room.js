// Builds one walkable room from a data/rooms.json record, the way the
// Earth_Worldbuild museum builds galleries from museum-layout.json: no GLB,
// no Blender export -- the building is boxes with world-tiled procedural
// textures, the company's things are low-poly props (props.js), and the
// record decides sizes, surfaces, lights, spawn. tools/build_rooms.py
// writes the records; this file only reads them.
//
// Coordinate convention: origin on the floor at the room's centre, +x right,
// +y up, +z toward the entrance (where the player spawns), -z toward the
// building's core. Canon C2 -- every shadow falls toward the core -- is
// enforced here, not per room: the one shadow-casting light always sits on
// the entrance side and aims at the core, whatever the room's own fixtures
// are doing.
//
// Record keys beyond the shell (all optional):
//   skirt   {mat, h, t}          a band low on every closed wall (painted
//                                concrete, wainscot, a rubber kick)
//   cornice {mat, h, t}          the same band up at the ceiling
//   beams   {axis, every, w, h,  ceiling beams / soffits under the slab,
//            mat, offset}         running along `axis` ('x' or 'z')
//   lights[].flicker  0..1       a sodium/fluorescent buzz on that light
//   lights[].sync     name|[names] named props whose glow follows that
//                                light's live level (src/world/world.js)
//   exposure, grain, vignette    read by the stage's composite pass
//   doors   [{name, wall, x, y,  doorways cut out of the shell (doors.js builds
//            w, h, kind, ...}]    the frame and leaf); each also yields an
//                                outward anchor of the same name
//   anchors {name: {pos, yaw}}   extra join points (the dive's water surface)
//   entry   'doorName'           the doorway a connector arrives through
//   zones   [{name, pos, r,      threshold zones (src/director.js reads them)
//            ring, label, ...}]
//   floorY  number               the floor's height when it is not 0 (stairs)
//   boxes[].fixed, props[].fixed  stays put in the world when the room is
//                                moved (world.move: the cab's shaft)
//
// The room no longer creates THREE lights itself: it returns light SPECS
// (positions in its own frame) and an `env` (ambient, hemisphere, sun, fog,
// exposure ...). src/world/lights.js keeps one fixed pool of real lights
// for the whole building and hands them to the nearest specs, so the light
// count -- and with it every compiled shader -- never changes as rooms are
// joined and dropped.

import * as THREE from '../../vendor/three/three.module.js';
import { applyWorldUV } from './materials.js';
import { buildProp } from './props.js';
import { buildDoor } from './doors.js';
import { doorAnchor } from '../world/anchors.js';

const WALL_T = 0.3;
const FLOOR_T = 0.2;

function archBox(mats, slot, min, max, tile, { collide = true, castShadow = true, receiveShadow = true, pitch = 0 } = {}) {
  const w = max[0] - min[0], h = max[1] - min[1], d = max[2] - min[2];
  const geo = new THREE.BoxGeometry(w, h, d);
  if (pitch) geo.rotateX(THREE.MathUtils.degToRad(pitch)); // a ramp slab, tilted about its own centre
  geo.translate(min[0] + w / 2, min[1] + h / 2, min[2] + d / 2); // world-space geometry so UVs tile across boxes
  applyWorldUV(geo, tile);
  const mesh = new THREE.Mesh(geo, mats.get(slot));
  mesh.castShadow = castShadow && !mats.isGlow(slot);
  mesh.receiveShadow = receiveShadow;
  mesh.userData.collide = collide;
  return mesh;
}

// Deterministic per-light phase so a row of fixtures never flickers in
// unison.
function hash01(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }

export function buildRoom(mats, rec, ctx = null) {
  const group = new THREE.Group();
  const named = new Map(); // prop name -> group (actors, the terminal screen, the hands)
  const animated = []; // { group, spec }: curtains that swing
  group.name = rec.id || rec.name || 'room';
  const walls = [];
  const floors = [];
  const [W, H, D] = rec.size;
  const Y0 = rec.floorY || 0;
  const tile = Object.assign({ floor: 2, wall: 2, ceiling: 2, box: 2 }, rec.tile || {});
  const open = new Set(rec.open || []);
  const doorSpecs = rec.doors || [];

  // Shell
  const floor = archBox(mats, rec.floor || 'concrete', [-W / 2, Y0 - FLOOR_T, -D / 2], [W / 2, Y0, D / 2], tile.floor, { collide: false, castShadow: false });
  floor.userData.surface = rec.floor || 'concrete';
  if (!rec.noFloor) { group.add(floor); floors.push(floor); }
  if (!rec.noCeiling) {
    group.add(archBox(mats, rec.ceiling || rec.wall || 'plaster', [-W / 2, H, -D / 2], [W / 2, H + FLOOR_T, D / 2], tile.ceiling, { collide: false, castShadow: false }));
  }
  const wallMat = rec.wall || 'plaster';
  // Each wall as a run along one axis: N/S along x, E/W along z.
  const runs = {
    N: { a: -W / 2 - WALL_T, b: W / 2 + WALL_T, box: (s0, s1, y0, y1) => [[s0, y0, -D / 2 - WALL_T], [s1, y1, -D / 2]] },
    S: { a: -W / 2 - WALL_T, b: W / 2 + WALL_T, box: (s0, s1, y0, y1) => [[s0, y0, D / 2], [s1, y1, D / 2 + WALL_T]] },
    E: { a: -D / 2, b: D / 2, box: (s0, s1, y0, y1) => [[W / 2, y0, s0], [W / 2 + WALL_T, y1, s1]] },
    W: { a: -D / 2, b: D / 2, box: (s0, s1, y0, y1) => [[-W / 2 - WALL_T, y0, s0], [-W / 2, y1, s1]] }
  };
  // Inner face of each wall, for the skirt / cornice bands.
  const inner = {
    N: (s0, s1, y0, y1, t) => [[s0, y0, -D / 2], [s1, y1, -D / 2 + t]],
    S: (s0, s1, y0, y1, t) => [[s0, y0, D / 2 - t], [s1, y1, D / 2]],
    E: (s0, s1, y0, y1, t) => [[W / 2 - t, y0, s0], [W / 2, y1, s1]],
    W: (s0, s1, y0, y1, t) => [[-W / 2, y0, s0], [-W / 2 + t, y1, s1]]
  };
  const innerSpan = { N: [-W / 2, W / 2], S: [-W / 2, W / 2], E: [-D / 2, D / 2], W: [-D / 2, D / 2] };
  for (const side of Object.keys(runs)) {
    if (open.has(side) || rec.noWalls) continue;
    const run = runs[side];
    const holes = doorSpecs.filter((d) => d.wall === side).map((d) => ({ s0: (d.x || 0) - (d.w || 1.2) / 2, s1: (d.x || 0) + (d.w || 1.2) / 2, y: d.y === undefined ? Y0 : d.y, h: d.h || 2.2 })).sort((p, q) => p.s0 - q.s0);
    // full-height pieces between the holes, a lintel over each, a sill under a raised one
    let cursor = run.a;
    const pieces = [];
    for (const hole of holes) {
      if (hole.s0 > cursor + 1e-3) pieces.push([cursor, hole.s0, Y0, H]);
      if (hole.y + hole.h < H - 1e-3) pieces.push([hole.s0, hole.s1, hole.y + hole.h, H]);
      if (hole.y > Y0 + 1e-3) pieces.push([hole.s0, hole.s1, Y0, hole.y]);
      cursor = Math.max(cursor, hole.s1);
    }
    if (run.b > cursor + 1e-3) pieces.push([cursor, run.b, Y0, H]);
    for (const [s0, s1, y0, y1] of pieces) {
      const [a, b] = run.box(s0, s1, y0, y1);
      const m = archBox(mats, wallMat, a, b, tile.wall);
      group.add(m);
      walls.push(m);
    }
    // bands, broken across the openings
    const bands = [];
    if (rec.skirt) bands.push({ spec: rec.skirt, y0: Y0, y1: Y0 + (rec.skirt.h || 0.9), t: rec.skirt.t || 0.03, mat: rec.skirt.mat || 'plaster_dark' });
    if (rec.cornice) bands.push({ spec: rec.cornice, y0: H - (rec.cornice.h || 0.3), y1: H, t: rec.cornice.t || 0.06, mat: rec.cornice.mat || wallMat });
    for (const band of bands) {
      let c = innerSpan[side][0];
      const segs = [];
      for (const hole of holes) {
        const cuts = band.y0 < hole.y + hole.h && band.y1 > hole.y;
        if (!cuts) continue;
        if (hole.s0 > c) segs.push([c, hole.s0]);
        c = Math.max(c, hole.s1);
      }
      if (innerSpan[side][1] > c) segs.push([c, innerSpan[side][1]]);
      for (const [s0, s1] of segs) {
        const [a, b] = inner[side](s0, s1, band.y0, band.y1, band.t);
        group.add(archBox(mats, band.mat, a, b, band.spec.tile || tile.wall, { collide: false, castShadow: false }));
      }
    }
  }

  // Doorways: frame, leaf, blocking body, and the outward anchor.
  const doors = new Map();
  const anchors = {};
  for (const d of doorSpecs) {
    const door = buildDoor(mats, d, { wallT: WALL_T, wallMat, skirt: rec.skirt || null });
    const y = d.y === undefined ? Y0 : d.y;
    const x = d.x || 0;
    switch (d.wall) {
      case 'N': door.group.position.set(x, y, -D / 2 - WALL_T / 2); door.group.rotation.y = 0; break;
      case 'S': door.group.position.set(x, y, D / 2 + WALL_T / 2); door.group.rotation.y = Math.PI; break;
      case 'E': door.group.position.set(W / 2 + WALL_T / 2, y, x); door.group.rotation.y = -Math.PI / 2; break;
      case 'W': door.group.position.set(-W / 2 - WALL_T / 2, y, x); door.group.rotation.y = Math.PI / 2; break;
      default: throw new Error(`room ${rec.id}: door ${d.name} on unknown wall ${d.wall}`);
    }
    group.add(door.group);
    door.alignToWall(tile); // a jib leaf (doors.js) tiles on from the wall round it
    walls.push(door.body);
    doors.set(d.name, door);
    anchors[d.name] = doorAnchor(rec.size, { ...d, y }, WALL_T);
    // a floor across the reveal so the threshold is walkable
    const reveal = { N: [[x - (d.w || 1.2) / 2, y - FLOOR_T, -D / 2 - WALL_T], [x + (d.w || 1.2) / 2, y, -D / 2]], S: [[x - (d.w || 1.2) / 2, y - FLOOR_T, D / 2], [x + (d.w || 1.2) / 2, y, D / 2 + WALL_T]], E: [[W / 2, y - FLOOR_T, x - (d.w || 1.2) / 2], [W / 2 + WALL_T, y, x + (d.w || 1.2) / 2]], W: [[-W / 2 - WALL_T, y - FLOOR_T, x - (d.w || 1.2) / 2], [-W / 2, y, x + (d.w || 1.2) / 2]] }[d.wall];
    const sill = archBox(mats, d.sill || rec.floor || 'concrete', reveal[0], reveal[1], tile.floor, { collide: false, castShadow: false });
    sill.userData.surface = d.sill || rec.floor || 'concrete';
    group.add(sill);
    floors.push(sill);
  }
  for (const [name, a] of Object.entries(rec.anchors || {})) anchors[name] = { pos: a.pos.slice(), yaw: a.yaw || 0, vertical: !!a.vertical };

  // Ceiling beams / soffits: the slab reads as poured, not as a lid.
  if (rec.beams && !rec.noCeiling) {
    const bm = rec.beams;
    const bw = bm.w || 0.5, bh = bm.h || 0.6, every = bm.every || 8, off = bm.offset || 0;
    const mat = bm.mat || rec.ceiling || 'concrete';
    if (bm.axis === 'z') {
      for (let x = -W / 2 + off; x <= W / 2 + 1e-6; x += every) {
        group.add(archBox(mats, mat, [x - bw / 2, H - bh, -D / 2], [x + bw / 2, H, D / 2], bm.tile || tile.ceiling, { collide: false, castShadow: false }));
      }
    } else {
      for (let z = -D / 2 + off; z <= D / 2 + 1e-6; z += every) {
        group.add(archBox(mats, mat, [-W / 2, H - bh, z - bw / 2], [W / 2, H, z + bw / 2], bm.tile || tile.ceiling, { collide: false, castShadow: false }));
      }
    }
    // perimeter downstand so the beams land on something -- not across an
    // open side (the edge room's slab just stops there)
    const pw = bw * 0.8;
    const perimeter = {
      N: [[-W / 2, H - bh, -D / 2], [W / 2, H, -D / 2 + pw]], S: [[-W / 2, H - bh, D / 2 - pw], [W / 2, H, D / 2]],
      W: [[-W / 2, H - bh, -D / 2], [-W / 2 + pw, H, D / 2]], E: [[W / 2 - pw, H - bh, -D / 2], [W / 2, H, D / 2]]
    };
    for (const side of Object.keys(perimeter)) {
      if (open.has(side)) continue;
      const [a, b] = perimeter[side];
      group.add(archBox(mats, mat, a, b, bm.tile || tile.ceiling, { collide: false, castShadow: false }));
    }
  }

  // Fixed parts (`fixed: true` on a box or a prop): built into a group of
  // their own, which world.js places with the room and then leaves where it
  // is when the room is moved -- S7 C's shaft stays put as the cab goes
  // down it. Scenery only: a fixed box never collides and is never floor,
  // and a fixed prop's colliders are not walls (the room moves away from
  // them). Names, show/hide and dispose() cover them like the rest.
  const fixedGroup = new THREE.Group();
  fixedGroup.name = `${group.name}:fixed`;

  // Extra architecture (pillars, counters, water, ledges, barriers, treads).
  const boxesById = new Map();
  for (const b of rec.boxes || []) {
    const m = archBox(mats, b.mat || 'concrete', b.min, b.max, b.tile || tile.box, { collide: b.collide !== false && !b.floor && !b.fixed, castShadow: b.shadow !== false, pitch: b.pitch || 0 });
    if (b.invisible) m.visible = false;
    if (b.floor && !b.fixed) { m.userData.surface = b.surface || b.mat || 'concrete'; floors.push(m); }
    if (b.id) { m.name = b.id; boxesById.set(b.id, m); }
    if (b.hidden) m.visible = false;
    (b.fixed ? fixedGroup : group).add(m);
    if (m.userData.collide) walls.push(m);
  }

  // Company property.
  for (const p of rec.props || []) {
    const g = buildProp(mats, p, ctx);
    if (!g) continue;
    (p.fixed ? fixedGroup : group).add(g);
    g.updateMatrixWorld(true);
    if (!p.fixed) g.traverse((o) => { if (o.userData && o.userData.collide) walls.push(o); });
    if (p.name) named.set(p.name, g);
    if (p.hidden) g.visible = false;
    // a named prop's colliders block only while it is shown (blocking()):
    // a beat shows it or hides it, and it is there exactly when it is seen
    // (S4 C's aisle closing up behind him is no invisible wall before)
    if (p.name) g.traverse((o) => { if (o.userData && o.userData.collide) o.userData.shownWith = g; });
    if (p.swing) animated.push({ group: g, spec: p, base: g.position.clone(), baseRot: g.rotation.clone() });
  }
  // Actors: named props with a path the director drives (S4 C's manager
  // walks the aisle toward the candidate). t=0 is the first point, t=1 the last.
  const actors = {};
  for (const [name, a] of Object.entries(rec.actors || {})) {
    const g = named.get(name);
    if (!g || !a.path || a.path.length < 2) continue;
    const carry = (a.carry || []).map((n) => named.get(n)).filter(Boolean);
    const offsets = carry.map((c) => c.position.clone().sub(g.position));
    let segLens = [];
    for (let i = 0; i < a.path.length - 1; i++) segLens.push(Math.hypot(a.path[i + 1][0] - a.path[i][0], a.path[i + 1][1] - a.path[i][1]));
    const total = segLens.reduce((p, q) => p + q, 0) || 1;
    actors[name] = {
      length: total,
      group: g,
      // `drive` {by, lead, ratchet, to, footsteps}: the director walks him
      // by the candidate's progress along `path` (director.js startDrives)
      path: a.path,
      drive: a.drive || null,
      set(t) {
        const u = Math.min(1, Math.max(0, t)) * (a.path.length - 1);
        const i = Math.min(a.path.length - 2, Math.floor(u));
        const f = u - i;
        const [x0, z0] = a.path[i], [x1, z1] = a.path[i + 1];
        g.position.x = x0 + (x1 - x0) * f;
        g.position.z = z0 + (z1 - z0) * f;
        if (a.face !== false && (x1 !== x0 || z1 !== z0)) g.rotation.y = Math.atan2(-(x1 - x0), -(z1 - z0));
        carry.forEach((c, k) => { c.position.x = g.position.x + offsets[k].x; c.position.z = g.position.z + offsets[k].z; });
      },
      // local [x, z] where the actor stands now
      at() { return [g.position.x, g.position.z]; }
    };
  }

  // Light specs (room-local) and the room's atmosphere. lights.js lights them.
  const amb = rec.ambient || { color: '#ffffff', intensity: 0.3 };
  const sunRec = rec.sun || { intensity: 0.9, color: '#ffffff' };
  const env = {
    ambient: { color: amb.color, intensity: amb.intensity },
    hemisphere: rec.hemisphere ? { sky: rec.hemisphere.sky, ground: rec.hemisphere.ground, intensity: rec.hemisphere.intensity || 0.4 } : null,
    // C2: the sun sits on the entrance side and aims at the core, whatever
    // the room's own fixtures are doing.
    sun: sunRec.intensity > 0 ? {
      from: sunRec.from || [W * 0.15, H * 1.6, D * 0.6],
      core: rec.core || [0, 0, -D / 2],
      color: sunRec.color || '#ffffff',
      intensity: sunRec.intensity
    } : null,
    fog: rec.fog || null,
    background: rec.background || (rec.fog && rec.fog.color) || '#000000',
    exposure: rec.exposure || 1.0,
    grain: rec.grain === undefined ? 0.03 : rec.grain,
    vignette: rec.vignette === undefined ? 0.55 : rec.vignette,
    shadowExtent: Math.min(26, Math.max(W, D) * 0.75)
  };
  const lightSpecs = (rec.lights || []).map((l, i) => ({
    type: l.type === 'spot' ? 'spot' : 'point',
    pos: l.pos.slice(),
    target: l.type === 'spot' ? (l.target || [l.pos[0], 0, l.pos[2]]) : null,
    color: l.color || '#ffffff',
    intensity: l.intensity || (l.type === 'spot' ? 20 : 10),
    distance: l.distance || (l.type === 'spot' ? 15 : 12),
    decay: l.decay === undefined ? 1.5 : l.decay,
    angle: l.angle || 40,
    penumbra: l.penumbra || 0.5,
    flicker: l.flicker || 0,
    pattern: l.pattern || null,
    phase: hash01(i + 1) * 100,
    rate: 6 + hash01(i + 7) * 6,
    id: l.id || null,
    off: !!l.off,
    sync: l.sync || null // a named prop (or several) whose glow follows this light (world.js bindSyncs)
  }));

  const spawn = rec.spawn || [0, D / 2 - 1.5, 0];
  return {
    group,
    walls,
    floors,
    lightSpecs,
    env,
    doors,
    anchors,
    zones: (rec.zones || []).map((z) => ({ ...z })),
    entry: rec.entry || null,
    boxesById,
    spawn: { x: spawn[0], z: spawn[1], yaw: spawn[2] || 0 },
    fog: rec.fog || null,
    background: env.background,
    footstep: rec.footstep || null,
    named,
    actors,
    // the fixed parts' group (null when the room has none): world.js adds
    // it to the scene at the room's placement and leaves it there on move()
    fixed: fixedGroup.children.length ? fixedGroup : null,
    // Per-frame: curtains sway, doors swing.
    update(dt, t) {
      for (const a of animated) {
        if (a.spec.swing) a.group.rotation.x = a.baseRot.x + Math.sin(t * 1.3) * 0.05 * Math.exp(-t * 0.03);
      }
      for (const d of doors.values()) d.update(dt);
    },
    // Colliders that currently block: every wall, minus any door body that
    // stands open and any named prop that is hidden.
    blocking() {
      return walls.filter((m) => !(m.userData.doorBody && !doors.get(m.userData.doorBody).blocks()) && !(m.userData.shownWith && !m.userData.shownWith.visible));
    },
    dispose() {
      // the fixed parts are freed with the rest (out of the scene first)
      fixedGroup.removeFromParent();
      group.add(fixedGroup);
      group.traverse((o) => {
        // catalog clones share their geometry with library.glb (library.js);
        // only what this room made is ours to free
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material && o.material.userData && o.material.userData.owned) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      fixedGroup.clear();
      group.clear();
    }
  };
}
