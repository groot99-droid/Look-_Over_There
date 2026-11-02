// Trampoline Park — The Macro-Structure. "I fell through a vent and landed here. It goes
// on forever." A vast indoor trampoline park: a grid of black beds edged in yellow, set in
// orange padded frames with pale pads between, a bare concrete apron where you land,
// orange-padded columns down the left, a dark steel truss ceiling with a lattice of small
// LED panels, angled trampoline walls at the edges. From the log: the ground repeats, the
// same scuff mark passes under your feet, you are on a treadmill, trapped in a loop. So the
// park is one cell repeated four times and the player is wrapped back onto it. After enough
// walking a digital chime sounds and a single red glow appears on the horizon: the anomaly
// (the next loading clip's radar finds it). Head for it.
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, createBuilder, repeat, stutter } from '../build.js';

export const meta = {
  id: 'trampoline',
  objective: 'KEEP MOVING',
  arrive: 'IT IS HERE',
  start: { x: 0.4, z: 2.2, yaw: 0.0 },
  // this room's chapter: what script.js shows around the walk (see walk.js chapters())
  chapter: {
    id: 'F',
    room: 'Trampoline Park',
    epithet: 'The Macro-Structure',
    audio: 'F.mp3',
    load: 'f.MP4',
    video: 'F.mp4',
    rot: '0.9deg',
    caption: 'I fell through a vent and landed here. It goes on forever. A playground for no one. The silence is so heavy it’s pressing against my eardrums. I have to keep moving.',
    stamp: 'DISTANCE: NaN',
    log: 'I didn’t hit the ground, I just... landed. I’m in a massive room covered in orange and black trampoline padding. No walls. No ceiling. The ground repeats. The exact same scuff mark passes under my feet every hundred steps. I am on a treadmill. The geometry is a sphere. I’m trapped in a loop.',
  },
};

const BED_X = 1.6, BED_Z = 2.4, FRAME = 0.42;
const PX = BED_X + FRAME, PZ = BED_Z + FRAME;   // pitch
const COLS = 7, ROWS = 10;
const CELL = ROWS * PZ;                        // 28.2 m along z
const HALF_W = COLS * PX / 2;                  // 7.07 m
const CEIL = 8.2;
const CHIME_AT = 110;                          // metres walked before the anomaly appears
const LED_I = 5;                               // the LED panels' glow; the clip has them pulsing
// padded columns stand among the beds, on frame intersections: (column index, row) per cell
const COLUMNS = [[1, 2], [5, 2], [1, 7], [5, 7]];

export async function build({ quality, yieldFrame }) {
  const S = quality.texSize;
  const s = Math.max(256, S / 2);
  const pad = T.plaster(s, { color: '#f59a4a', seed: 201, tile: 1.4, relief: 0.35 });
  await yieldFrame();
  const padPale = T.plaster(s, { color: '#ece0a6', seed: 202, tile: 1.4, relief: 0.35 });
  await yieldFrame();
  const bed = T.weave(s, { color: '#1d1d20', seed: 203, tile: 0.5 });
  await yieldFrame();
  const concrete = T.plaster(S, { color: '#8e8a82', seed: 204, tile: 3.0, relief: 0.5 });
  await yieldFrame();
  const scuff = T.scuff(128);
  const glow = T.glowSprite(128);

  const M = {
    pad: pbr(pad, { name: 'pad_orange', roughness: 0.55, env: 0.35, normalScale: 0.5 }),
    padPale: pbr(padPale, { name: 'pad_pale', roughness: 0.55, env: 0.35, normalScale: 0.5 }),
    bed: pbr(bed, { name: 'bed', roughness: 0.7, env: 0.25, normalScale: 0.6, castShadow: false }),
    edge: pbr(null, { name: 'edge_yellow', color: '#f6dc4a', roughness: 0.6, env: 0.3, emissive: '#6a5a10', emissiveIntensity: 0.6, castShadow: false }),
    pit: pbr(null, { name: 'pit', color: '#0a0a0b', roughness: 1, env: 0, castShadow: false }),
    concrete: pbr(concrete, { name: 'concrete', roughness: 0.85, env: 0.2, normalScale: 0.4, castShadow: false }),
    truss: pbr(null, { name: 'truss', color: '#2a2622', roughness: 0.6, metalness: 0.5, env: 0.4, castShadow: false }),
    deck: pbr(null, { name: 'deck', color: '#1b1815', roughness: 0.9, env: 0.08, castShadow: false }),
    led: pbr(null, { name: 'led', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#fff2dc', emissiveIntensity: LED_I, castShadow: false }),
    column: pbr(pad, { name: 'column_pad', roughness: 0.55, env: 0.35, normalScale: 0.5, worldUV: false }),
    band: pbr(null, { name: 'column_band', color: '#e2d38c', roughness: 0.6, env: 0.3 }),
    wallMesh: pbr(bed, { name: 'wall_mesh', color: '#2a2a2e', roughness: 0.75, env: 0.2, normalScale: 0.4, castShadow: false }),
    far: pbr(null, { name: 'far_wall', color: '#6f6a60', roughness: 0.95, env: 0.1, castShadow: false }),
    scuff: pbr({ map: scuff, tile: 1 }, { name: 'scuff', color: '#ffffff', roughness: 0.9, env: 0, transparent: true, opacity: 0.9, worldUV: false, castShadow: false }),
    beacon: pbr(null, { name: 'beacon', color: '#3a0000', roughness: 0.4, env: 0, emissive: '#ff1010', emissiveIntensity: 1.6, castShadow: false }),
  };

  // --- one cell of the park: z from -CELL to 0 -------------------------------------------
  const C = createBuilder();
  C.add(box(HALF_W * 2 + 2, 0.06, CELL), M.pit, place(0, -0.03, -CELL / 2));
  for (let r = 0; r < ROWS; r++) {
    const zc = -(r + 0.5) * PZ;
    for (let c = 0; c < COLS; c++) {
      const xc = -HALF_W + (c + 0.5) * PX;
      C.add(box(BED_X, 0.02, BED_Z), M.bed, place(xc, 0.05, zc));
      // yellow edge strips
      C.add(box(BED_X + 0.12, 0.012, 0.07), M.edge, place(xc, 0.062, zc - BED_Z / 2 - 0.035));
      C.add(box(BED_X + 0.12, 0.012, 0.07), M.edge, place(xc, 0.062, zc + BED_Z / 2 + 0.035));
      C.add(box(0.07, 0.012, BED_Z), M.edge, place(xc - BED_X / 2 - 0.035, 0.062, zc));
      C.add(box(0.07, 0.012, BED_Z), M.edge, place(xc + BED_X / 2 + 0.035, 0.062, zc));
      // frame pads: the x-running pad of this row (pale yellow every other row, as in the
      // clip's end pads) and the z-running pad
      const pale = r % 2 === 1;
      C.add(box(PX, 0.16, FRAME), pale ? M.padPale : M.pad, place(xc, 0.12, zc - PZ / 2));
      C.add(box(FRAME, 0.16, BED_Z), M.pad, place(xc - PX / 2, 0.12, zc));
    }
    C.add(box(FRAME, 0.16, BED_Z), M.pad, place(HALF_W, 0.12, zc));
  }
  C.add(box(HALF_W * 2 + FRAME, 0.22, 0.5), M.pad, place(0, 0.14, 0.04));
  // the same scuff mark on one pad of every cell
  C.mesh(new THREE.PlaneGeometry(0.9, 0.5), M.scuff, place(-HALF_W + 2.5 * PX, 0.205, -3 * PZ, 0.3, -Math.PI / 2));
  // padded columns among the beds (on the frame pads, as in the clip), and angled
  // trampoline walls at both edges
  for (const [k, r] of COLUMNS) {
    const xc = -HALF_W + k * PX, zc = -r * PZ;
    C.add(cyl(0.3, 0.3, 2.6, 12, true), M.column, place(xc, 1.3, zc), { uvScale: [3, 2] });
    C.add(cyl(0.32, 0.32, 0.35, 12, true), M.band, place(xc, 2.2, zc), { uvScale: [1, 1] });
    C.add(box(0.2, CEIL - 2.6, 0.2), M.truss, place(xc, 2.6 + (CEIL - 2.6) / 2, zc)); // the bare post above the padding
    C.collider(xc, zc, 0.7, 0.7);
  }
  for (const side of [1, -1]) {
    const x = side * (HALF_W + 0.35);
    C.add(box(0.06, 3.2, CELL), M.wallMesh, place(x + side * 0.9, 1.5, -CELL / 2, 0, 0, -side * 0.45));
    C.add(box(0.5, 0.2, CELL), M.pad, place(x + side * 1.75, 2.85, -CELL / 2));
    C.add(box(0.5, 0.2, CELL), M.pad, place(x + side * 0.1, 0.12, -CELL / 2));
    // the warehouse wall beyond the angled beds
    C.add(box(0.3, CEIL + 1, CELL), M.far, place(x + side * 4.0, CEIL / 2, -CELL / 2));
  }
  // truss ceiling: beams across every 4.7 m, purlins along, a black deck, LED panels
  for (let k = 0; k < 6; k++) {
    const zc = -(k + 0.5) * (CELL / 6);
    C.add(box(HALF_W * 2 + 6, 0.35, 0.3), M.truss, place(0, CEIL - 0.6, zc));
    for (let i = 0; i < 5; i++) C.add(box(0.06, 0.55, 0.06), M.truss, place(-HALF_W + i * (HALF_W / 2), CEIL - 0.3, zc + (i % 2 ? 0.7 : -0.7), 0, 0, 0.6));
  }
  for (let i = 0; i < 4; i++) C.add(box(0.2, 0.2, CELL), M.truss, place(-HALF_W + 1 + i * (HALF_W * 2 / 3.6), CEIL - 0.15, -CELL / 2));
  C.add(box(HALF_W * 2 + 8, 0.05, CELL), M.deck, place(0, CEIL + 0.05, -CELL / 2));
  const LED_X = 3.5, LED_Z = 4.7;
  for (let k = 0; k < 6; k++) {
    for (let i = -2; i <= 2; i++) C.add(box(0.45, 0.04, 0.45), M.led, place(i * LED_X, CEIL - 0.9, -(k + 0.5) * LED_Z));
  }
  const cell = C.finish();
  const offsets = [1, 0, -1, -2];
  const park = repeat(cell.group, offsets.map((k) => place(0, 0, k * CELL)));
  const colliders = [];
  for (const k of offsets) for (const c of cell.colliders) colliders.push({ minX: c.minX, maxX: c.maxX, minZ: c.minZ + k * CELL, maxZ: c.maxZ + k * CELL });

  // --- what is not repeated: the concrete apron you land on, the far walls, the beacon -----
  const B = createBuilder();
  B.add(box(HALF_W * 2 + 3, 0.3, 4.5), M.concrete, place(0, 0.15, 2.25));
  B.add(box(HALF_W * 2 + 8, CEIL + 1, 0.3), M.far, place(0, CEIL / 2, 4.6));
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), M.beacon);
  beacon.visible = false;
  B.object(beacon);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff1a10, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sprite.scale.set(14, 14, 1);
  sprite.visible = false;
  B.object(sprite);
  const fixed = B.finish();
  const group = new THREE.Group();
  group.add(park);
  group.add(fixed.group);
  colliders.push(...fixed.colliders);

  // --- lights: a dim warm hall, two panel lights that follow, the anomaly's red ----------------
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xffe9cf, 0x4a3218, 1.45));
  const POOL_I = 55;
  const pool = [];
  for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffe4bd, POOL_I, 30, 2); lights.add(l); pool.push(l); }
  const red = new THREE.PointLight(0xff2020, 0, 30, 2);
  lights.add(red);

  // --- the loop -------------------------------------------------------------------------------
  const trigger = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const nearGoal = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  let goalOn = false;
  const shiftables = [beacon, sprite, red];
  function shiftWorld(d) {
    for (const o of shiftables) o.position.z += d;
    for (const c of colliders) { c.minZ += d; c.maxZ += d; }
    for (const b of [trigger, nearGoal]) { b.minZ += d; b.maxZ += d; }
    prev.z += d;
  }
  function wrap(p) {
    if (p.z < -1.5 * CELL) { p.z += CELL; shiftWorld(CELL); return true; }
    if (p.z > 0.5 * CELL + 2) { p.z -= CELL; shiftWorld(-CELL); return true; }
    return false;
  }

  const prev = new THREE.Vector3(meta.start.x, 0, meta.start.z);
  const fwd = new THREE.Vector3();
  let travelled = 0, wrapped = false, readT = 0, elapsed = 0, ledLevel = 1;
  function update(p, dt, camera, ctx) {
    if (dt === undefined) return;
    elapsed += dt;
    travelled += Math.hypot(p.x - prev.x, p.z - prev.z);
    // the LED panels pulse, and now and then the whole lattice stutters (the clip's flicker)
    ledLevel = 0.91 + 0.09 * Math.sin(elapsed * (Math.PI * 2 / 2.3));
    if (!ctx.reduced && stutter(3, elapsed, 10) < 0.03) ledLevel *= 0.55;
    M.led.emissiveIntensity = LED_I * ledLevel;
    pool[0].intensity = pool[1].intensity = POOL_I * (0.7 + 0.3 * ledLevel);
    prev.set(p.x, 0, p.z);
    // the nearest LED panels light you
    const gx = Math.round(p.x / LED_X) * LED_X;
    const gz = Math.round((p.z + LED_Z / 2) / LED_Z) * LED_Z - LED_Z / 2;
    pool[0].position.set(gx, CEIL - 1.2, gz);
    pool[1].position.set(gx + (p.x > gx ? LED_X : -LED_X), CEIL - 1.2, gz + (p.z > gz ? LED_Z : -LED_Z));
    // beds bounce, frames don't
    const onFrame = p.z > 0 || ((p.x + HALF_W) % PX) < FRAME || ((-p.z) % PZ) < FRAME;
    ctx.controls.setBobScale(onFrame ? 1 : 2.4);
    readT += dt;
    if (readT > 0.25) {
      readT = 0;
      if (p.z < -CELL && !wrapped) wrapped = true;
      ctx.setReadout(wrapped ? 'DISTANCE: NaN' : `DISTANCE: ${travelled.toFixed(0)} m`);
    }
    if (!goalOn && travelled > CHIME_AT) {
      goalOn = true;
      ctx.sound.chime();
      ctx.setObjective('HEAD FOR THE RED');
      camera.getWorldDirection(fwd);
      const dir = fwd.z < 0 ? -1 : 1;
      const bx = Math.max(-HALF_W + 1.5, Math.min(HALF_W - 1.5, p.x + fwd.x * 6));
      const bz = p.z + dir * 34;
      beacon.position.set(bx, 1.1, bz);
      beacon.visible = true;
      sprite.position.set(bx, 1.4, bz);
      sprite.visible = true;
      red.position.set(bx, 1.6, bz);
      Object.assign(trigger, { minX: bx - 1.4, maxX: bx + 1.4, minZ: bz - 1.4, maxZ: bz + 1.4 });
      Object.assign(nearGoal, { minX: bx - 9, maxX: bx + 9, minZ: bz - 9, maxZ: bz + 9 });
    }
    if (goalOn && red.intensity < 40) red.intensity = Math.min(40, red.intensity + dt * 14);
    if (goalOn) { const k = 0.85 + 0.15 * Math.sin(performance.now() * 0.006); M.beacon.emissiveIntensity = 1.6 * k; sprite.material.opacity = 0.45 * k; }
  }

  return {
    meta, group, lights, colliders, update, wrap,
    bounds: { minX: -HALF_W + 0.2, maxX: HALF_W - 0.2, minZ: -1e6, maxZ: 4.2 },
    trigger, nearGoal,
    exitPath: (from) => {
      const b = beacon.position;
      const dx = from.x - b.x, dz = from.z - b.z, l = Math.hypot(dx, dz) || 1;
      return [new THREE.Vector3(b.x + dx / l * 1.6, 1.62, b.z + dz / l * 1.6), new THREE.Vector3(b.x + dx / l * 0.5, 1.4, b.z + dz / l * 0.5)];
    },
    exitLookAt: () => beacon.position.clone(),
    exitDuration: 2.6, exitFadeStart: 0.45,
    fog: new THREE.FogExp2(0x0d0b09, 0.021),
    background: 0x0d0b09,
    far: 120,
    exposure: 1.1,
    debug: { beacon, led: M.led, get ledLevel() { return ledLevel; }, get travelled() { return travelled; }, CELL, get goalOn() { return goalOn; } },
  };
}
