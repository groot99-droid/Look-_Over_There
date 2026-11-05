// The Hallway — The Descent. Built to the room video: you stand on a lower landing at the
// foot of a short carpeted flight (two wide low treads, then five steps) that climbs into a
// long, narrow corridor. Pale grey-beige walls with a faint printed plaid, a worn tan carpet
// with a lattice of dark diamonds, a smooth ceiling with surface-mounted twin-tube
// fluorescents that flicker one at a time, and at the far end an amber-lit opening whose
// ceiling is stacked with light bars. Under that opening the stairwell of mossy pixel-block
// stone goes DOWN, into the shaft of the next loading clip. "The hum of the lights is
// getting louder."
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, createBuilder, stutter } from '../build.js';

export const meta = {
  id: 'hallway',
  objective: 'WALK TO THE END',
  arrive: 'GO DOWN',
  start: { x: -2.1, z: 0, yaw: -Math.PI / 2, pitch: 0.04 }, // on the landing, looking up the flight (+x)
  // this room's chapter: what script.js shows around the walk (see walk.js chapters())
  chapter: {
    id: 'B',
    room: 'The Hallway',
    epithet: 'The Descent',
    audio: 'B.mp3',
    load: 'b.MP4',
    video: 'B.mp4',
    rot: '1.1deg',
    caption: 'The stairs didn’t lead to the second floor. I’ve been walking down this hall for what feels like hours. The hum of the lights is getting louder. I just need to find a door.',
    stamp: '18:15',
    log: 'Found a hallway. The doors don’t feel right. I touched the wood on one of them and my hand tingled, like static electricity. For a second, the grain on the wood just... disappeared into gray lines. I’m so tired. I just need to find a room to catch my breath.',
  },
};

const LEN = 36;                       // x of the end wall: the corridor floor is y = 0 from the top step to here
const WID = 2.4, HGT = 2.6;
const LAND = { x0: -3.6, y: -1.1 };   // the lower landing you start on
const RUNS = [0.95, 0.95, 0.3, 0.3, 0.3, 0.3, 0.3]; // treads: two deep, then five
const STEP_END = RUNS.reduce((a, b) => a + b, 0);  // x where the corridor floor begins (3.4)
const RISE = -LAND.y / RUNS.length;
// the amber vestibule beyond the end wall, and the stairwell down from its far edge
const VEST = { d: 1.3, w: 1.6, h: 2.3 };
const WELL = { w: 1.4, h: 1.9, rise: 0.2, run: 0.28, steps: 16, landing: 1.2 };
const FIXTURES = 9;
const FIX_X0 = 5.2, FIX_DX = 3.5;      // the first fixture over the top of the flight, then every 3.5 m

// Eye height above the corridor floor along the flight: a smooth ramp (the head bob reads
// as the steps), the landing level before it, the corridor level after.
export function floorY(x) {
  if (x <= 0) return LAND.y;
  if (x >= STEP_END) return 0;
  return LAND.y * (1 - x / STEP_END);
}

export async function build({ quality, yieldFrame }) {
  const S = quality.texSize;
  const s = Math.max(256, S / 2);

  const carpet = T.diamondCarpet(S, { seed: 67, tile: 1.0 });
  await yieldFrame();
  const wall = T.plaidWall(S, { seed: 66, tile: 1.5 });
  await yieldFrame();
  const ceiling = T.plaster(s, { color: '#ece7dc', seed: 68, tile: 2.6, relief: 0.15 });
  await yieldFrame();
  const amberWall = T.plaster(s, { color: '#d8a862', seed: 69, tile: 2.0, relief: 0.2 });
  await yieldFrame();
  const moss = T.mossBlock(s, { seed: 71, tile: 2.0 });
  await yieldFrame();

  const M = {
    carpet: pbr(carpet, { name: 'carpet', roughness: 1, env: 0.1, normalScale: 0.7, castShadow: false }),
    wall: pbr(wall, { name: 'wall', roughness: 0.9, env: 0.2, normalScale: 0.5 }),
    ceiling: pbr(ceiling, { name: 'ceiling', roughness: 1, env: 0.15, normalScale: 0.1, castShadow: false }),
    trim: pbr(null, { name: 'trim', color: '#8c847a', roughness: 0.7, env: 0.2 }),
    housing: pbr(null, { name: 'fixture', color: '#e8e6e0', roughness: 0.5, env: 0.3, castShadow: false }),
    tubes: [],   // one emissive material per fixture, so each can flicker on its own
    amber: pbr(amberWall, { name: 'amber_wall', roughness: 0.85, env: 0.3, normalScale: 0.3 }),
    bars: pbr(null, { name: 'amber_bars', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#ffd9a0', emissiveIntensity: 2.8, castShadow: false }),
    moss: pbr(moss, { name: 'moss_block', roughness: 0.95, env: 0.05, normalScale: 0.8 }),
    void: pbr(null, { name: 'void', color: '#000000', roughness: 1, env: 0, castShadow: false }),
  };
  for (let i = 0; i < FIXTURES; i++) {
    M.tubes.push(pbr(null, { name: 'tube_' + i, color: '#ffffff', roughness: 0.6, env: 0, emissive: '#f4f8ff', emissiveIntensity: 4.2, castShadow: false }));
  }

  const B = createBuilder();
  const TH = 0.12;
  const hw = WID / 2;

  // --- the landing and the flight up ------------------------------------------------------------
  const landW = -LAND.x0;
  B.add(box(landW, TH, WID + 2 * TH), M.carpet, place(LAND.x0 + landW / 2, LAND.y - TH / 2, 0));
  B.add(box(TH, HGT + 0.4, WID + 2 * TH), M.wall, place(LAND.x0 - TH / 2, LAND.y + (HGT + 0.4) / 2, 0)); // wall behind you
  let xs = 0;
  for (let i = 0; i < RUNS.length; i++) {
    const top = LAND.y + (i + 1) * RISE;
    const h = top - LAND.y + 0.3;                  // solid down to below the landing
    B.add(box(RUNS[i], h, WID), M.carpet, place(xs + RUNS[i] / 2, top - h / 2, 0));
    xs += RUNS[i];
  }
  // the corridor floor and ceiling
  B.add(box(LEN - STEP_END + TH, TH, WID + 2 * TH), M.carpet, place(STEP_END + (LEN - STEP_END + TH) / 2, -TH / 2, 0));
  B.add(box(LEN - LAND.x0 + 2 * TH, TH, WID + 2 * TH), M.ceiling, place((LAND.x0 + LEN) / 2, HGT + TH / 2, 0));
  // side walls: full height from the landing floor all the way to the end
  const wallLen = LEN - LAND.x0 + 2 * TH;
  const wallH = HGT - LAND.y;
  for (const side of [1, -1]) {
    B.add(box(wallLen, wallH, TH), M.wall, place((LAND.x0 + LEN) / 2, LAND.y + wallH / 2, side * (hw + TH / 2)));
    // a dark baseboard along the corridor, and a sloped one up the flight
    B.add(box(LEN - STEP_END, 0.09, 0.014), M.trim, place(STEP_END + (LEN - STEP_END) / 2, 0.045, side * (hw - 0.007)));
    B.add(box(landW, 0.09, 0.014), M.trim, place(LAND.x0 + landW / 2, LAND.y + 0.045, side * (hw - 0.007)));
    const slope = Math.atan2(-LAND.y, STEP_END);
    B.add(box(Math.hypot(STEP_END, LAND.y), 0.09, 0.014), M.trim, place(STEP_END / 2, LAND.y / 2 + 0.06, side * (hw - 0.007), 0, 0, slope));
  }

  // --- the end wall: an opening into the amber vestibule ---------------------------------------------
  const stubW = (WID - VEST.w) / 2 + TH;
  B.add(box(TH, HGT, stubW), M.wall, place(LEN + TH / 2, HGT / 2, VEST.w / 2 + stubW / 2));
  B.add(box(TH, HGT, stubW), M.wall, place(LEN + TH / 2, HGT / 2, -VEST.w / 2 - stubW / 2));
  B.add(box(TH, HGT - VEST.h, VEST.w), M.wall, place(LEN + TH / 2, VEST.h + (HGT - VEST.h) / 2, 0));
  B.collider(LEN + TH / 2, VEST.w / 2 + stubW / 2, TH, stubW);
  B.collider(LEN + TH / 2, -VEST.w / 2 - stubW / 2, TH, stubW);
  // the vestibule: a short amber-walled landing at corridor level, its ceiling stacked with bars
  const VX0 = LEN + TH, VX1 = VX0 + VEST.d;
  B.add(box(VEST.d, TH, VEST.w + 2 * TH), M.carpet, place(VX0 + VEST.d / 2, -TH / 2, 0));
  const shaftRun = WELL.run * WELL.steps, depth = WELL.rise * WELL.steps;
  const shaftLen = VEST.d + shaftRun + WELL.landing + TH;
  const shaftH = depth + VEST.h + 0.6;
  for (const side of [1, -1]) {
    B.add(box(VEST.d + 0.1, VEST.h + 0.2, TH), M.amber, place(VX0 + VEST.d / 2, VEST.h / 2, side * (VEST.w / 2 + TH / 2)));
    B.add(box(shaftLen - VEST.d, shaftH, TH), M.moss, place(VX1 + (shaftLen - VEST.d) / 2, VEST.h - shaftH / 2, side * (VEST.w / 2 + TH / 2)));
    B.collider(VX0 + shaftLen / 2, side * (VEST.w / 2 + TH / 2), shaftLen, TH);
  }
  B.add(box(shaftLen + TH, TH, VEST.w + 2 * TH), M.amber, place(VX0 + shaftLen / 2, VEST.h + TH / 2, 0));
  for (let i = 0; i < 6; i++) {
    B.add(box(0.14, 0.03, VEST.w - 0.2), M.bars, place(VX0 + 0.25 + i * 0.5, VEST.h - 0.02, 0));
  }
  // the stairwell: block steps going down into the mossy shaft, then a landing and black
  for (let i = 0; i < WELL.steps; i++) {
    const top = -i * WELL.rise;
    const h = depth + 0.6 + top;
    B.add(box(WELL.run, h, VEST.w), M.moss, place(VX1 + (i + 0.5) * WELL.run, top - h / 2, 0));
  }
  const landX = VX1 + shaftRun;
  B.add(box(WELL.landing, 0.6, VEST.w), M.moss, place(landX + WELL.landing / 2, -depth - 0.3, 0));
  B.add(box(TH, shaftH, VEST.w + 2 * TH), M.void, place(landX + WELL.landing + TH / 2, VEST.h - shaftH / 2, 0));
  B.add(box(2, 0.4, VEST.w + 2 * TH), M.void, place(landX + WELL.landing + 1, -depth - 1.2, 0));

  // --- the fixtures: surface-mounted twin tubes, one material each ----------------------------------
  const fixtures = [];
  for (let i = 0; i < FIXTURES; i++) {
    const x = FIX_X0 + i * FIX_DX;
    B.add(box(1.25, 0.07, 0.32), M.housing, place(x, HGT - 0.035, 0));
    for (const dz of [-0.075, 0.075]) B.add(cyl(0.02, 0.02, 1.18, 8), M.tubes[i], place(x, HGT - 0.09, dz, 0, 0, Math.PI / 2));
    B.add(box(1.22, 0.012, 0.22), M.tubes[i], place(x, HGT - 0.105, 0));
    fixtures.push(new THREE.Vector3(x, HGT - 0.5, 0));
  }

  const { group, colliders } = B.finish();

  // --- lights: a pool of three that re-park on the nearest fixtures, a warm end, a green well ---
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xfff1d8, 0x5e5446, 0.62));
  const POOL_I = 13;
  const pool = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xeef3ff, POOL_I, 12, 2);
    l.position.copy(fixtures[i]);
    l.userData.fixture = i;
    lights.add(l);
    pool.push(l);
  }
  const landingLight = new THREE.PointLight(0xfff0dc, 5, 7, 2);
  landingLight.position.set(-1.2, HGT - 0.4, 0);
  lights.add(landingLight);
  const amber = new THREE.PointLight(0xffc27a, 9, 7, 2);
  amber.position.set(VX0 + 0.7, VEST.h - 0.4, 0);
  lights.add(amber);
  const glow = new THREE.PointLight(0x7fd06a, 3.0, 6, 2);
  glow.position.set(VX1 + 0.8, 1.2, 0);
  lights.add(glow);

  // --- the tubes flicker one at a time, the buzz rises down the hall ---------------------------------
  const levels = new Array(FIXTURES).fill(1);
  let elapsed = 0;
  function update(p, dt, camera, ctx) {
    if (dt === undefined) return;
    elapsed += dt;
    // the eye follows the floor: down on the landing, up the flight, level in the corridor
    ctx.controls.setEyeOffset(floorY(p.x));
    // one of the nine fixtures stutters every second or so; which one, and when, is hashed
    for (let i = 0; i < FIXTURES; i++) {
      let level = 1;
      if (ctx.reduced) level = 0.96 + 0.04 * Math.sin(elapsed * 0.7 + i);
      else if (stutter(i, elapsed, 8) < 0.012) level = stutter(i + 100, elapsed, 40) > 0.5 ? 0.15 : 0.45;
      levels[i] = level;
      M.tubes[i].emissiveIntensity = 4.2 * level;
      M.tubes[i].color.setScalar(0.5 + 0.5 * level);
    }
    const sorted = fixtures.map((f, i) => i).sort((a, b) => Math.abs(fixtures[a].x - p.x) - Math.abs(fixtures[b].x - p.x));
    for (let i = 0; i < pool.length; i++) {
      pool[i].position.copy(fixtures[sorted[i]]);
      pool[i].intensity = POOL_I * (0.25 + 0.75 * levels[sorted[i]]);
    }
    // the amber bars breathe
    M.bars.emissiveIntensity = 2.8 + 0.5 * Math.sin(elapsed * 1.3);
    amber.intensity = 9 + 1.5 * Math.sin(elapsed * 1.3);
    // the buzz of the lights gets louder the further you walk
    const along = Math.max(0, Math.min(1, (p.x - STEP_END) / (LEN - STEP_END)));
    ctx.sound.buzz(0.12 + 0.7 * along);
  }

  // the exit: step onto the top of the well, and the camera walks the first treads down
  const trigger = { minX: VX1 - 0.35, maxX: VX1 + 0.6, minZ: -WELL.w / 2, maxZ: WELL.w / 2 };
  const nearGoal = { minX: LEN - 5, maxX: VX1 + 0.6, minZ: -hw, maxZ: hw };
  const exitPath = [
    new THREE.Vector3(VX1 + 0.5, 1.62 - 0.2, 0),
    new THREE.Vector3(VX1 + 1.6, 1.62 - 1.0, 0),
    new THREE.Vector3(VX1 + 2.8, 1.62 - 1.9, 0),
  ];

  return {
    meta,
    group, lights, colliders, update,
    bounds: { minX: LAND.x0 + 0.1, maxX: VX1 + 0.6, minZ: -hw, maxZ: hw },
    trigger, nearGoal, exitPath, exitLookAt: new THREE.Vector3(VX1 + 4.5, -2.2, 0),
    exitFadeStart: 0.55,
    fog: new THREE.FogExp2(0x1a1612, 0.03),
    background: 0x1a1612,
    exposure: 1.0,
    debug: { tubes: M.tubes, levels, fixtures, LEN, STEP_END, floorY },
  };
}
