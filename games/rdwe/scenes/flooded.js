// Flooded Corridor — The Decay. A long institutional corridor in one-point perspective:
// white square tile to hip height with a steel handrail each side, a painted sky (blue,
// cumulus, a green hill line) along the whole left upper wall, a row of empty wooden
// frames diminishing down the right, square recessed light panels in a white ceiling, a
// cream tile floor with a yellow tactile strip under a skin of standing water that
// mirrors the lights, and a red-lit door at the far end. From the log: water dripping from
// the ceiling lands as perfect square blue blocks that melt into puddles, a grate that
// feels soft, the corridor groaning. The red door is the lure; the grate in front of it
// gives way, and the next loading clip is the fall down the shaft.
//
// Against the painted sky, heaps of sodden cardboard boxes and wet paper, slumped where the
// water left them. On the first, on the carton at its top, three photographs, still dripping.
// The frames down the right are empty. The bonus game (it never touches the exit): take the
// photographs off the heap and hang them, and the corridor stops groaning for a while and the
// painted sky starts to move (under reduced motion it clears instead, and holds still).
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, createBuilder, mirrorY, cycle, stutter } from '../build.js';
import { heapAsync, saggingBox } from '../piles.js';

export const meta = {
  id: 'flooded',
  objective: 'REACH THE RED DOOR',
  arrive: 'ALMOST THERE',
  start: { x: 1.2, z: 0, yaw: -Math.PI / 2 },
  // this room's chapter: what script.js shows around the walk (see walk.js chapters())
  chapter: {
    id: 'E',
    room: 'Flooded Corridor',
    epithet: 'The Decay',
    audio: 'E.mp3',
    load: 'e.MP4',
    video: 'E.mp4',
    rot: '-1.5deg',
    caption: 'The deeper I go, the more the illusion falls apart. They painted a sky on the wall to make us forget we’re buried. The water is freezing. Whatever is running this place is starting to break down.',
    stamp: 'ERR_CLOCK_NOT_FOUND',
    log: 'I broke through. It’s dark, and everything is wet. The water dripping from the ceiling doesn’t splash—it hits the ground as perfect, square blue blocks before melting into puddles. The environment is failing. I tried to walk across a grate but the metal felt soft. The whole corridor is groaning.',
  },
};

const LEN = 34, WID = 3.2, HGT = 2.9, RAIL_Y = 0.95, DADO = 1.25;
const GRATE_X = LEN - 3.4, GRATE_W = 1.0;
// The clip: the red door is lit for its first half second, dark red-brown until ~3.3 s,
// then stutters on and stays bright. Stretched to the walk, on a DOOR_PERIOD loop.
const DOOR_PERIOD = 30, DOOR_LIT = 3, DOOR_DARK_UNTIL = 21, DOOR_STUTTER = 1.2;

export async function build({ quality, yieldFrame }) {
  const S = quality.texSize;
  const s = Math.max(256, S / 2);

  const wallTile = T.tiles(S, { cols: 8, rows: 8, a: '#f7f7f3', b: '#f1f1eb', grout: '#d3d3cb', groutW: 0.018, seed: 141, tile: 1.2, gloss: 0.26, relief: 0.7 });
  await yieldFrame();
  const floorTile = T.tiles(S, { cols: 3, rows: 3, a: '#efeadc', b: '#e9e3d3', grout: '#d6d0c0', groutW: 0.012, seed: 142, tile: 1.2, gloss: 0.16, speckle: 0.002, relief: 0.6 });
  await yieldFrame();
  const ceiling = T.plaster(s, { color: '#f4f2ec', seed: 143, tile: 2.4, relief: 0.15 });
  await yieldFrame();
  const mural = T.skyMural(quality.phone ? 1024 : 2048, quality.phone ? 256 : 512);
  const steelPanel = T.tiles(s, { cols: 2, rows: 4, a: '#3a3e45', b: '#33373d', grout: '#1c1e22', groutW: 0.02, seed: 144, tile: 2.0, gloss: 0.4, rivets: true });
  await yieldFrame();
  const prints = [0, 1, 2].map((i) => T.photo(Math.max(128, S / 4), { seed: 300 + i * 11, warm: i !== 1 }));
  const tact = T.tactile(256);
  const rippleN = T.ripple(256);
  rippleN.repeat.set(LEN / 2.5, WID / 2.5);
  const rippleN2 = T.ripple(256, { seed: 162 });
  rippleN2.repeat.set(LEN / 1.7, WID / 1.7);
  await yieldFrame();

  const M = {
    wallTile: pbr(wallTile, { name: 'wall_tile', roughness: 0.3, env: 0.9, normalScale: 0.6 }),
    upper: pbr(wallTile, { name: 'wall_tile_upper', color: '#f2f2ee', roughness: 0.35, env: 0.7, normalScale: 0.5 }),
    // its own picture as its emissive map, dark until the photographs are hung under reduced motion
    // (clearSky() below): then only a uniform changes, and no shader is compiled mid-walk
    mural: pbr({ ...mural, emissiveMap: mural.map }, { name: 'mural', roughness: 0.75, env: 0.2, worldUV: false }),
    ceiling: pbr(ceiling, { name: 'ceiling', roughness: 1, env: 0.2, normalScale: 0.1, castShadow: false }),
    floor: pbr(floorTile, { name: 'floor_tile', roughness: 0.08, env: 1.5, normalScale: 0.25, transparent: true, opacity: 0.8, castShadow: false }),
    water: pbr({ normalMap: rippleN, tile: 1 }, { name: 'water', color: '#cfe6ee', roughness: 0.03, env: 2.2, normalScale: 0.35, transparent: true, opacity: 0.26, worldUV: false, castShadow: false }),
    // a second skin with the other ripple map, scrolled the other way: the shimmer of the clip
    water2: pbr({ normalMap: rippleN2, tile: 1 }, { name: 'water2', color: '#dff0f6', roughness: 0.03, env: 2.0, normalScale: 0.3, transparent: true, opacity: 0.16, worldUV: false, castShadow: false }),
    tactile: pbr(tact, { name: 'tactile', roughness: 0.45, env: 0.5, normalScale: 0.8, worldUV: true, tile: 0.3 }),
    rail: pbr(null, { name: 'rail', color: '#c8ccd2', roughness: 0.28, metalness: 1, env: 1.3 }),
    frame: pbr(null, { name: 'frame', color: '#5a3a22', roughness: 0.5, env: 0.4 }),
    frameInner: pbr(null, { name: 'frame_inner', color: '#f3f1ea', roughness: 0.9, env: 0.2 }),
    panel: pbr(null, { name: 'light_panel', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#f4f8ff', emissiveIntensity: 3.6, castShadow: false }),
    panelRim: pbr(null, { name: 'panel_rim', color: '#dcdcd6', roughness: 0.5, env: 0.3, castShadow: false }),
    vent: pbr(null, { name: 'vent', color: '#6a6d72', roughness: 0.6, metalness: 0.6, env: 0.6 }),
    door: pbr(null, { name: 'red_door', color: '#ff3030', roughness: 0.5, env: 0.3, emissive: '#ff1c1c', emissiveIntensity: 0.9 }),
    doorFrame: pbr(null, { name: 'red_door_frame', color: '#8a1a1a', roughness: 0.5, env: 0.3 }),
    grate: pbr(null, { name: 'grate', color: '#4a4d52', roughness: 0.45, metalness: 0.9, env: 0.9 }),
    steel: pbr(steelPanel, { name: 'steel', roughness: 0.45, metalness: 0.7, env: 0.8, normalScale: 0.8 }),
    void: pbr(null, { name: 'void', color: '#000000', roughness: 1, env: 0, castShadow: false }),
    drip: pbr(null, { name: 'drip', color: '#2e6cff', roughness: 0.15, env: 1.2, emissive: '#1a44c0', emissiveIntensity: 0.7, transparent: true, opacity: 0.9, castShadow: false }),
    puddle: pbr(null, { name: 'puddle', color: '#5a86d8', roughness: 0.1, env: 1.6, transparent: true, opacity: 0.5, castShadow: false }),
    // wet cardboard and paper: dark, and glossy where the water sits on them
    cardboard: pbr(null, { name: 'wet_cardboard', color: '#6f583d', roughness: 0.42, env: 0.8 }),
    cardboardLight: pbr(null, { name: 'wet_cardboard_light', color: '#8d7350', roughness: 0.5, env: 0.7 }),
    paper: pbr(null, { name: 'wet_paper', color: '#dcd6c6', roughness: 0.35, env: 0.9, side: THREE.DoubleSide }),
  };

  const hw = WID / 2, TH = 0.12;
  const R = createBuilder();   // the room (mirrored under the floor)
  const F = createBuilder();   // the floor, the water, the grate, the shaft (not mirrored)

  // --- walls ------------------------------------------------------------------------------
  for (const side of [1, -1]) {
    const z = side * (hw + TH / 2);
    R.add(box(LEN + 2 * TH, DADO, TH), M.wallTile, place(LEN / 2, DADO / 2, z));
    if (side === -1) {
      // the painted sky along the left
      R.add(box(LEN + 2 * TH, HGT - DADO, TH), M.upper, place(LEN / 2, DADO + (HGT - DADO) / 2, z));
      const mp = new THREE.PlaneGeometry(LEN, HGT - DADO);
      const uv = mp.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (LEN / 10), uv.getY(i));
      R.add(mp, M.mural, place(LEN / 2, DADO + (HGT - DADO) / 2, -hw + 0.004, 0));
    } else {
      R.add(box(LEN + 2 * TH, HGT - DADO, TH), M.upper, place(LEN / 2, DADO + (HGT - DADO) / 2, z));
      // empty wooden frames, one every 2.4 m, shrinking a little down the hall
      for (let i = 0; i < 13; i++) {
        const x = 3 + i * 2.4, fw = 0.7, fh = 0.9, y = 2.0;
        R.add(box(fw, fh, 0.04), M.frame, place(x, y, hw - 0.02));
        R.add(box(fw - 0.1, fh - 0.1, 0.005), M.frameInner, place(x, y, hw - 0.043));
      }
    }
    // dado cap and handrail on brackets
    R.add(box(LEN, 0.03, 0.03), M.rail, place(LEN / 2, DADO + 0.015, side * (hw - 0.015)));
    R.add(cyl(0.02, 0.02, LEN, 10), M.rail, place(LEN / 2, RAIL_Y, side * (hw - 0.09), 0, 0, Math.PI / 2));
    for (let x = 1.5; x < LEN; x += 1.5) R.add(box(0.04, 0.05, 0.1), M.rail, place(x, RAIL_Y - 0.02, side * (hw - 0.05)));
  }
  R.add(box(TH, HGT, WID + 2 * TH), M.wallTile, place(-TH / 2, HGT / 2, 0));          // behind the player
  // the far end: a red door in the middle of a tiled wall
  const DW = 1.0, DH = 2.1;
  R.add(box(TH, HGT, (WID - DW) / 2 + TH), M.wallTile, place(LEN + TH / 2, HGT / 2, DW / 2 + ((WID - DW) / 2 + TH) / 2));
  R.add(box(TH, HGT, (WID - DW) / 2 + TH), M.wallTile, place(LEN + TH / 2, HGT / 2, -DW / 2 - ((WID - DW) / 2 + TH) / 2));
  R.add(box(TH, HGT - DH, DW), M.wallTile, place(LEN + TH / 2, DH + (HGT - DH) / 2, 0));
  R.add(box(0.06, DH, DW), M.door, place(LEN - 0.03, DH / 2, 0));
  R.add(box(0.08, DH + 0.1, 0.08), M.doorFrame, place(LEN - 0.04, (DH + 0.1) / 2, DW / 2 + 0.04));
  R.add(box(0.08, DH + 0.1, 0.08), M.doorFrame, place(LEN - 0.04, (DH + 0.1) / 2, -DW / 2 - 0.04));
  R.add(box(0.08, 0.08, DW + 0.16), M.doorFrame, place(LEN - 0.04, DH + 0.06, 0));
  R.add(box(0.03, 0.03, 0.14), M.rail, place(LEN - 0.08, 1.0, 0.35));                     // handle
  // ceiling: plaster, square recessed panels down the centre, little vents between them
  R.add(box(LEN + 2 * TH, TH, WID + 2 * TH), M.ceiling, place(LEN / 2, HGT + TH / 2, 0));
  const panels = [];
  for (let x = 2; x < LEN; x += 3.2) {
    R.add(box(0.7, 0.03, 0.7), M.panelRim, place(x, HGT - 0.01, 0));
    R.add(box(0.6, 0.02, 0.6), M.panel, place(x, HGT - 0.03, 0));
    R.add(box(0.3, 0.02, 0.16), M.vent, place(x + 1.6, HGT - 0.012, 0.9));
    panels.push(new THREE.Vector3(x, HGT - 0.45, 0));
  }

  // --- the heaps: sodden boxes and paper under the painted sky ------------------------------
  // Boxes of a few sizes, one half crushed, flattened cardboard and loose wet paper. Each heap is
  // settled piece by piece (piles.js heap()): every piece rests on the floor or on the pieces under
  // it, held up where it touches (steady) and reaching no further past that than it could bear,
  // never inside another. The keep-in boxes hold the heaps 3 mm off the wall tile and leave 2.24 m
  // of the corridor clear; the ceilings keep every piece 15 cm and more under the handrail brackets
  // (they start at RAIL_Y - 0.045 = 0.905). The seeds are chosen. Settling is the slow part (a piece
  // that cannot stay where it fell is tried in up to 32 other places), so the heaps are settled a
  // frame's worth (16 ms) at a time with the page free in between (heapAsync()): neither holds it
  // much longer than that, far less than a texture above does, though together they still add to the
  // room's build time.
  const boxA = saggingBox(0.46, 0.34, 0.38, 0.045);
  const boxB = saggingBox(0.36, 0.26, 0.3, 0.03);
  const boxC = saggingBox(0.5, 0.2, 0.4, 0.06);         // half crushed
  const boxD = saggingBox(0.3, 0.22, 0.24, 0.025);      // small
  const carton = saggingBox(0.46, 0.16, 0.56, 0.04);    // the photographs' carton
  const flat = saggingBox(0.54, 0.03, 0.42, 0);         // trodden flat
  const flap = saggingBox(0.38, 0.025, 0.3, 0);         // a torn-off flap
  const sheet = new THREE.PlaneGeometry(0.22, 0.3).rotateX(-Math.PI / 2);
  // a box with something lying on it is drawn with its lid pressed flat (heap()'s `loaded` item)
  const PIECE = {
    boxA: [boxA, M.cardboard], boxB: [boxB, M.cardboardLight], boxC: [boxC, M.cardboard], boxD: [boxD, M.cardboardLight],
    carton: [carton, M.cardboard], flat: [flat, M.cardboardLight], flap: [flap, M.cardboard], sheet: [sheet, M.paper, place(0, 0.004, 0)],
  };
  const parts = (weights) => Object.entries(weights).map(([k, weight]) => {
    const [g, mat, local = null] = PIECE[k], p = g.parameters;
    return { item: [[g, mat, local]], weight, loaded: g.type === 'BoxGeometry' && p.height > 0.05 ? [[box(p.width, p.height, p.depth), mat, null]] : null };
  });
  // (the carton has weight 0: it is never dropped at random, only put down last as the crown)
  const PHOTO_PARTS = parts({ boxA: 3, boxB: 2, boxC: 2, boxD: 1, sheet: 3, flat: 1, flap: 1, carton: 0 });
  const PAPER_PARTS = parts({ boxA: 1, boxB: 2, boxC: 2, boxD: 2, sheet: 3, flap: 3 });
  const HEAP_MAXZ = hw - 2.24;                           // 2.24 m of the corridor left clear
  const keep = (minX, maxX) => ({ minX, maxX, minZ: -hw + 0.003, maxZ: HEAP_MAXZ });
  // the water's two skins over the floor (below): no flat face of a piece lies within 2 mm of them
  const SKINS = [0.02, 0.028];
  // The one with the photographs, a few steps in. Its pieces stop at 0.55 m, and the carton the
  // photographs were in is put down last, on top (the heap's crown, under 0.75 m and near level):
  // its lid is broader than the prints, so the three lie on it whole, a loose bundle laid by the
  // heap 1.5 mm over what is under each (the lid, or the print before), none crossing another, and
  // the lid under them pressed flat. A print is 0.36 x 0.48, mounted in a frame's 0.6 x 0.8 board.
  // The second, further down, is set dressing: lower, wider and more trodden.
  const PW = 0.36, PH = 0.48;
  const FAN = [[-0.015, 0.02, -0.09], [0.012, -0.004, 0.03], [0, -0.018, 0.11]];   // across, along the lid, turn
  const CROWN = { part: PHOTO_PARTS.length - 1, x: 6.26, z: -1.06, yaw: 1.35, ceiling: 0.75, tilt: 0.1, lay: FAN.map(([u, v, turn]) => [PW, PH, u, v, turn]) };
  await yieldFrame();
  // and wet paper over the bare lids round it, so it reads sodden from the corridor too
  const STREW = { count: 3, size: [[0.22, 0.3], [0.15, 0.19]], item: [[new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), M.paper, null]] };
  const photoHeap = await heapAsync(R, PHOTO_PARTS, { x: 6.4, z: -1.12, rx: 0.55, rz: 0.32, count: 28, seed: 200, ceiling: 0.55, keep: keep(5.45, 7.35), steady: true, crown: CROWN, skins: SKINS, strew: STREW }, yieldFrame);
  const paperHeap = await heapAsync(R, PAPER_PARTS, { x: 19.2, z: -1.12, ry: 0.2, rx: 0.62, rz: 0.34, count: 30, seed: 224, ceiling: 0.62, keep: keep(18.15, 20.25), steady: true, skins: SKINS }, yieldFrame);
  await yieldFrame();
  // where the top print lies: what the player reaches for
  const TOP = new THREE.Vector3().setFromMatrixPosition(photoHeap.laid[photoHeap.laid.length - 1]);

  // --- floor, water, strip ------------------------------------------------------------------
  const floorPlane = new THREE.PlaneGeometry(LEN + 2 * TH, WID + 2 * TH);
  const floorMesh = F.mesh(floorPlane, M.floor, place(LEN / 2, 0, 0, 0, -Math.PI / 2));
  floorMesh.renderOrder = 2;
  const water = F.mesh(new THREE.PlaneGeometry(LEN, WID), M.water, place(LEN / 2, SKINS[0], 0, 0, -Math.PI / 2));
  water.renderOrder = 3;
  const water2 = F.mesh(new THREE.PlaneGeometry(LEN, WID), M.water2, place(LEN / 2, SKINS[1], 0, 0, -Math.PI / 2));
  water2.renderOrder = 4;
  F.add(box(LEN - GRATE_W - 0.2, 0.012, 0.3), M.tactile, place((GRATE_X - GRATE_W / 2) / 2, 0.006, 0));
  F.add(box(LEN - GRATE_X - GRATE_W / 2, 0.012, 0.3), M.tactile, place(GRATE_X + GRATE_W / 2 + (LEN - GRATE_X - GRATE_W / 2) / 2, 0.006, 0));
  F.add(box(LEN + 2 * TH, 0.5, WID + 2 * TH), M.void, place(LEN / 2, -3.4, 0)); // under the mirrored room

  // --- the grate and the shaft under it -----------------------------------------------------
  const G = createBuilder();
  for (let i = 0; i <= 30; i++) G.add(box(0.02, 0.05, GRATE_W), M.grate, place(-hw + i * (WID / 30), 0, 0));
  for (let k = 0; k < 5; k++) G.add(box(WID, 0.04, 0.03), M.grate, place(0, -0.005, -GRATE_W / 2 + k * (GRATE_W / 4)));
  const grate = G.finish().group;
  grate.position.set(GRATE_X, -0.02, 0);
  F.object(grate);
  // The steel stands 2 mm clear of every face it would otherwise share: inside the reflected
  // corridor walls, under the floor plane, and (the end walls) behind the reflected rail bracket;
  // the end walls stop 2 mm inside the long walls' backs and 4 mm inside the black at the bottom,
  // and the long walls 18 mm inside the end walls' backs and 2 mm inside the black, so each end is
  // buried in what it meets.
  const SHAFT = 9, SY = -SHAFT / 2 - 0.002;
  F.add(box(GRATE_W + 0.2 - 0.004, SHAFT, TH), M.steel, place(GRATE_X, SY, hw + TH / 2 - 0.002));
  F.add(box(GRATE_W + 0.2 - 0.004, SHAFT, TH), M.steel, place(GRATE_X, SY, -hw - TH / 2 + 0.002));
  F.add(box(TH - 0.004, SHAFT, WID + 2 * TH - 0.008), M.steel, place(GRATE_X - GRATE_W / 2 - TH / 2 + 0.002, SY, 0));
  F.add(box(TH - 0.004, SHAFT, WID + 2 * TH - 0.008), M.steel, place(GRATE_X + GRATE_W / 2 + TH / 2 - 0.002, SY, 0));
  F.add(box(GRATE_W + 0.2, TH, WID + 2 * TH), M.void, place(GRATE_X, -SHAFT, 0));
  // the trench edge: the tile floor stops at the grate (a lip each side)
  F.add(box(0.05, 0.03, WID), M.rail, place(GRATE_X - GRATE_W / 2 - 0.025, 0.015, 0));
  F.add(box(0.05, 0.03, WID), M.rail, place(GRATE_X + GRATE_W / 2 + 0.025, 0.015, 0));

  // --- drips: pooled cubes and puddles ----------------------------------------------------------
  const N = 14;
  const cubes = new THREE.InstancedMesh(box(0.09, 0.09, 0.09), M.drip, N);
  const puddles = new THREE.InstancedMesh(cyl(0.16, 0.16, 0.006, 12), M.puddle, N);
  cubes.frustumCulled = puddles.frustumCulled = false;
  cubes.castShadow = puddles.castShadow = false;
  const drops = [];
  const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  // a drip never lands on a heap: the spot is picked again (up to 8 times) while it falls within
  // 0.2 m of one (half a cube and a puddle's radius), and failing that it moves out into the corridor
  const DRY = [photoHeap.collider, paperHeap.collider].map((c) => ({ minX: c.minX - 0.2, maxX: c.maxX + 0.2, minZ: c.minZ - 0.2, maxZ: c.maxZ + 0.2 }));
  const dry = (x, z) => DRY.find((c) => x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ);
  function respawn(d, px) {
    for (let k = 0; k < 8; k++) {
      d.x = Math.max(1, Math.min(LEN - 1, px + (Math.random() - 0.5) * 22));
      d.z = (Math.random() - 0.5) * (WID - 0.4);
      if (!dry(d.x, d.z)) break;
    }
    const c = dry(d.x, d.z);
    if (c) d.z = c.maxZ + 0.01;
    d.y = HGT - 0.1;
    d.phase = 'fall';
    d.t = 0;
    d.wait = Math.random() * 3;
  }
  for (let i = 0; i < N; i++) { const d = { x: 0, y: 0, z: 0, phase: 'fall', t: 0, wait: 0, puddle: 0 }; respawn(d, 8 + i * 2); d.y = Math.random() * HGT; drops.push(d); }
  F.object(cubes);
  F.object(puddles);

  // --- the photographs: on the carton at the top of the heap, face up ----------------------------
  const FRAME_Y = 2.0, FRAME_Z = hw - 0.05;
  const frameXs = Array.from({ length: 13 }, (_, i) => 3 + i * 2.4);
  const PARKED = new THREE.Vector3(0, -20, 0);
  const photos = prints.map((tex, i) => {
    const mat = pbr(tex, { name: 'print_' + i, roughness: 0.28, env: 0.9, worldUV: false, castShadow: false, side: THREE.DoubleSide });
    // the heap lays a sheet in its XZ plane; the print is an XY plane, turned face up
    const at = photoHeap.laid[i].clone().multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    const m = F.mesh(new THREE.PlaneGeometry(PW, PH), mat, at);
    return { mesh: m, state: 'heap', frame: -1 };
  });

  const roomOut = R.finish();
  const floorOut = F.finish();
  const group = new THREE.Group();
  group.add(roomOut.group);
  group.add(mirrorY(roomOut.group, 0));
  group.add(floorOut.group);
  const colliders = [...roomOut.colliders, ...floorOut.colliders];
  colliders.push({ minX: LEN - 0.3, maxX: LEN + 1, minZ: -hw, maxZ: hw });

  // --- lights ---------------------------------------------------------------------------------
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xe8f0ff, 0x2a3440, 0.55));
  const pool = [];
  for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xeaf2ff, 14, 12, 2); l.position.copy(panels[i]); lights.add(l); pool.push(l); }
  const RED_I = 9;
  const red = new THREE.PointLight(0xff2020, RED_I, 9, 2);
  red.position.set(LEN - 0.6, 1.4, 0);
  lights.add(red);
  const doorLit = new THREE.Color('#ff3030'), doorDark = new THREE.Color('#4a1212');
  let doorLevel = 1;
  function doorAt(t, reduced) {
    const ph = cycle(t, DOOR_PERIOD) * DOOR_PERIOD;
    if (ph < DOOR_LIT) return reduced ? 1 : 1 - Math.max(0, (ph - DOOR_LIT + 0.3) / 0.3);
    if (ph < DOOR_DARK_UNTIL) return reduced ? Math.max(0, 1 - (ph - DOOR_LIT)) : 0;
    if (ph < DOOR_DARK_UNTIL + DOOR_STUTTER) return reduced ? (ph - DOOR_DARK_UNTIL) / DOOR_STUTTER : (stutter(5, ph, 12) > 0.45 ? 1 : 0.08);
    return 0.9 + 0.1 * Math.sin(ph * 2.4);
  }

  // --- the bonus: hang the photographs ------------------------------------------------------------
  const game = { photos, frames: frameXs.map((x) => ({ x, photo: -1 })), heaps: [photoHeap.collider, paperHeap.collider], hung: 0, carrying: -1, done: false };
  const tally = (ctx) => (game.done ? `PHOTOGRAPHS HUNG ${game.hung}/3  ·  ${ctx.reduced ? 'THE SKY CLEARS' : 'THE SKY MOVES'}`
    : game.carrying >= 0 ? `CARRYING A PHOTOGRAPH  ·  HANG IT  ${game.hung}/3`
      : `PHOTOGRAPHS HUNG ${game.hung}/3`);
  let groanQuiet = 0;
  const interact = [{
    x: TOP.x, y: TOP.y, z: TOP.z, reach: 2.0, size: 0.45, label: 'TAKE A PHOTOGRAPH',
    enabled: () => game.carrying < 0 && photos.some((p) => p.state === 'heap'),
    use(ctx) {
      // the top one first
      let i = -1;
      for (let k = photos.length - 1; k >= 0; k--) if (photos[k].state === 'heap') { i = k; break; }
      photos[i].state = 'carried';
      photos[i].mesh.position.copy(PARKED);
      game.carrying = i;
      ctx.sound.pickup();
      ctx.setTally(tally(ctx));
    },
  }];
  game.frames.forEach((f, fi) => interact.push({
    x: f.x, y: FRAME_Y, z: FRAME_Z, reach: 1.9, size: 0.4, label: 'HANG IT',
    enabled: () => game.carrying >= 0 && f.photo < 0,
    use(ctx) {
      const p = photos[game.carrying];
      p.mesh.position.set(f.x, FRAME_Y, FRAME_Z);
      p.mesh.rotation.set(0, Math.PI, 0);
      p.state = 'hung';
      p.frame = fi;
      f.photo = game.carrying;
      game.carrying = -1;
      game.hung++;
      ctx.sound.pickup();
      if (game.hung === photos.length) {
        // the illusion holds again: the corridor stops groaning for a while, and the clouds start
        // to drift for the rest of the visit (update() scrolls them); under reduced motion the sky
        // clears instead, once, and holds still
        game.done = true;
        groanQuiet = 20;
        ctx.sound.win();
        if (ctx.reduced) clearSky();
      }
      ctx.setTally(tally(ctx));
    },
  }));

  // the still reward: the painted sky clears, glowing in its own colours (its emissive map is its
  // picture, and its emissive, black until now, is a uniform: nothing is recompiled)
  function clearSky() { M.mural.emissive.set('#c0c0c0'); }

  // --- the goal ---------------------------------------------------------------------------------
  const trigger = { minX: GRATE_X - 0.18, maxX: GRATE_X + 0.3, minZ: -hw, maxZ: hw };
  const nearGoal = { minX: GRATE_X - 6, maxX: LEN, minZ: -hw, maxZ: hw };
  const softZone = { minX: GRATE_X - GRATE_W / 2 - 0.3, maxX: GRATE_X + GRATE_W / 2 + 0.3 };

  let elapsed = 0, groanT = 6, falling = false, fallT = 0, readoutSet = false;
  function update(p, dt, camera, ctx) {
    if (dt === undefined) return;
    elapsed += dt;
    if (!readoutSet) { readoutSet = true; ctx.setReadout('ERR_CLOCK_NOT_FOUND'); ctx.setTally(tally(ctx)); }
    if (game.done && !ctx.reduced) M.mural.map.offset.x += dt * 0.01;
    // lights follow the player down the hall
    const sorted = panels.slice().sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
    for (let i = 0; i < pool.length; i++) pool[i].position.copy(sorted[i]);
    // the water moves: two skins, scrolled against each other
    rippleN.offset.x += dt * 0.012; rippleN.offset.y += dt * 0.006;
    rippleN2.offset.x -= dt * 0.009; rippleN2.offset.y += dt * 0.014;
    // the red door: lit, then dark for a long while, then it stutters on and stays on
    doorLevel = doorAt(elapsed, ctx.reduced);
    M.door.color.copy(doorDark).lerp(doorLit, doorLevel);
    M.door.emissiveIntensity = 0.05 + 0.85 * doorLevel;
    red.intensity = RED_I * doorLevel;
    // the ceiling panels breathe a little
    M.panel.emissiveIntensity = 3.6 * (1 + 0.03 * Math.sin(elapsed * 1.7));
    // the grate feels soft underfoot
    if (!falling) {
      if (p.x > softZone.minX && p.x < softZone.maxX) {
        const depth = 1 - Math.min(1, Math.abs(p.x - GRATE_X) / (GRATE_W / 2 + 0.3));
        grate.position.y = -0.02 - depth * 0.05;
        ctx.sound.hum(0);
      } else grate.position.y = -0.02;
    } else {
      fallT += dt;
      grate.position.y -= 4.9 * fallT * dt * 2;
      grate.rotation.x += 0.9 * dt;
    }
    groanT -= dt;
    groanQuiet = Math.max(0, groanQuiet - dt);
    if (groanT <= 0) { groanT = 7 + Math.random() * 9; if (!groanQuiet) ctx.sound.groan(); }
    // drips
    for (let i = 0; i < N; i++) {
      const d = drops[i];
      if (d.wait > 0) { d.wait -= dt; }
      else if (d.phase === 'fall') {
        d.y -= dt * 3.2;
        if (d.y <= 0.06) {
          d.y = 0.06; d.phase = 'melt'; d.t = 0; d.puddle = 0;
          if (Math.abs(d.x - p.x) < 9) ctx.sound.drip((d.z - p.z) * 0.5);
        }
      } else {
        d.t += dt;
        if (d.t > 3.2) respawn(d, p.x);
      }
      const melt = d.phase === 'melt' ? Math.min(1, d.t / 0.5) : 0;
      tmpP.set(d.x, d.wait > 0 ? -20 : d.y - melt * 0.04, d.z);
      tmpS.set(1 + melt * 1.6, 1 - melt * 0.96, 1 + melt * 1.6);
      tmpQ.identity();
      tmpM.compose(tmpP, tmpQ, tmpS);
      cubes.setMatrixAt(i, tmpM);
      const pud = d.phase === 'melt' ? (d.t < 0.6 ? d.t / 0.6 : d.t > 2.5 ? Math.max(0, 1 - (d.t - 2.5) / 0.7) : 1) : 0;
      tmpP.set(d.x, pud > 0 ? 0.03 : -20, d.z);
      tmpS.set(pud, 1, pud);
      tmpM.compose(tmpP, tmpQ, tmpS);
      puddles.setMatrixAt(i, tmpM);
    }
    cubes.instanceMatrix.needsUpdate = true;
    puddles.instanceMatrix.needsUpdate = true;
  }

  function onExit(ctx) {
    falling = true;
    ctx.setArrive('THE FLOOR GIVES WAY');
    ctx.sound.groan();
  }

  return {
    meta, group, lights, colliders, update, onExit, interact,
    bounds: { minX: 0, maxX: LEN, minZ: -hw, maxZ: hw },
    trigger, nearGoal,
    exitPath: (from) => [new THREE.Vector3(from.x + 0.05, 1.3, from.z), new THREE.Vector3(from.x + 0.1, -1.4, from.z), new THREE.Vector3(from.x + 0.1, -7.5, from.z)],
    exitLookAt: (from) => new THREE.Vector3(from.x + 0.1, -9, from.z + 0.01),
    exitDuration: 1.7, exitFadeStart: 0.5, exitEase: 'in', exitShake: 0.025, exitTurn: 2.5,
    fog: new THREE.FogExp2(0x0b1016, 0.022),
    background: 0x0b1016,
    exposure: 0.95,
    debug: { game, mural: M.mural, heap: { x: TOP.x, z: TOP.z }, heapTops: [photoHeap.height, paperHeap.height], strewn: photoHeap.strewn.length,
      // (sheets: what is laid on a heap, measured with it: the prints, as the XZ sheets they are laid
      // as, each in its own material, and the wet paper strewn over its bare lids)
      pileItems: [photoHeap, paperHeap].map((h, k) => ({ name: `heap ${k}`, y: 0, collider: h.collider, pieces: h.items.map((m, i) => [m, h.drawn[i]]),
        sheets: [...h.laid.map((m, i) => [m, [[new THREE.PlaneGeometry(PW, PH).rotateX(-Math.PI / 2), photos[i].mesh.material, null]]]),
          ...(h.strewn || []).map((m) => [m, STREW.item])] })),
      cubes, grate, panels, door: M.door, get doorLevel() { return doorLevel; }, DOOR_PERIOD, DOOR_LIT, DOOR_DARK_UNTIL, DOOR_STUTTER },
  };
}
