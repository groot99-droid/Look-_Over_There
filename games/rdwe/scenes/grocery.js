// Grocery Store — The Anomaly. A vast stripped big-box supermarket: glossy speckled vinyl
// tile, a suspended acoustic-tile ceiling with continuous rows of fluorescent strips (the
// left row flickers), square cream columns, empty grey gondola shelving, and in the middle
// a single red shopping cart roped off by sagging caution tape between chrome stanchions.
// From the log: a digital chime, a single red glow, the only thing that isn't supposed to
// be here. Here the shelving is a maze of aisles: the entrance doors behind you are locked,
// the roped-off cart stands in a clearing at the heart of it, and a lit EXIT sign shows over
// the shelves on the far wall. Find the way. The exit closes the loop.
//
// The shelves were stripped, but not everything left: what is left has been pushed into the
// dead ends of the aisles, pyramids of identical unlabelled tins with flats of cardboard
// beside them. In three of the pyramids one tin is red, the red of the cart. The bonus game
// (it never touches the exit): take the three red tins and put them in the cart.
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, sphere, createBuilder, mirrorY, cycle } from '../build.js';
import { pyramid, stack, rng } from '../piles.js';

export const meta = {
  id: 'grocery',
  objective: 'FIND THE EXIT',
  arrive: 'EXIT',
  start: { x: 0, z: 0, yaw: 0 },  // filled in from the maze below
  // this room's chapter: what script.js shows around the walk (see walk.js chapters())
  chapter: {
    id: 'G',
    room: 'Grocery Store',
    epithet: 'The Anomaly',
    audio: 'G.mp3',
    load: 'g.MP4',
    video: 'G.mp4',
    rot: '-1.7deg',
    caption: 'A grocery store, completely stripped. But right in the middle... a monument. Who roped off the cart? Am I following someone, or is the room trying to show me something?',
    stamp: 'PING_DETECTED_0x8F',
    log: 'Wait. Something changed. I heard a noise—a digital chime. I looked up and there is a single, bright red glow on the horizon. Out here? It’s an anomaly. It’s the only thing that isn’t supposed to be here. I’m heading for it.',
  },
};

const CELL = 2.0;
const COLS = 19, ROWS = 23;              // odd: corridors on odd indices, shelving on even
const W = COLS * CELL, D = ROWS * CELL;  // 38 x 46 m
const HGT = 4.0;
const SHELF_H = 1.85;
const SHELF_LOW = 1.4;                   // the perimeter gondolas along the walls are lower
// The clip's rows breathe, with a hard dip at 3.3 s and a smaller one at 4.6 s of its five.
// Stretched to the walk: a ROW_PERIOD loop with the two dips at the same proportions.
const ROW_PERIOD = 9, DIP_A = 3.3 / 5 * 9, DIP_B = 4.6 / 5 * 9, STRIP_I = 3.2;

// A perfect maze on the odd cells (recursive backtracker, seeded), then a few extra
// openings so there are loops, a clearing in the middle for the cart, the entrance at the
// front and the exit at the back right.
function makeMaze(seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const wall = [];
  for (let r = 0; r < ROWS; r++) { wall.push(new Array(COLS).fill(true)); }
  const stack = [[1, 1]];
  wall[1][1] = false;
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const opts = [];
    for (const [dr, dc] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
      const nr = r + dr, nc = c + dc;
      if (nr > 0 && nr < ROWS - 1 && nc > 0 && nc < COLS - 1 && wall[nr][nc]) opts.push([nr, nc, r + dr / 2, c + dc / 2]);
    }
    if (!opts.length) { stack.pop(); continue; }
    const [nr, nc, wr, wc] = opts[Math.floor(rnd() * opts.length)];
    wall[wr][wc] = false;
    wall[nr][nc] = false;
    stack.push([nr, nc]);
  }
  // loops: knock out some interior walls between corridors
  for (let k = 0; k < 26; k++) {
    const r = 1 + Math.floor(rnd() * (ROWS - 2)), c = 1 + Math.floor(rnd() * (COLS - 2));
    if (wall[r][c] && ((r % 2 === 0 && c % 2 === 1) || (r % 2 === 1 && c % 2 === 0))) wall[r][c] = false;
  }
  // the clearing for the cart
  const cr = Math.floor(ROWS / 2), cc = Math.floor(COLS / 2);
  for (let r = cr - 2; r <= cr + 2; r++) for (let c = cc - 2; c <= cc + 2; c++) wall[r][c] = false;
  // the entrance (front, centre) and the exit (back, right) cut through the perimeter shelving
  const entC = cc;
  wall[ROWS - 1][entC] = false;
  const exitC = COLS - 4;
  wall[0][exitC] = false;
  wall[1][exitC] = false;
  return { wall, entC, exitC, cr, cc };
}

const cx = (c) => -W / 2 + (c + 0.5) * CELL;
const cz = (r) => -D / 2 + (r + 0.5) * CELL;

export async function build({ quality, yieldFrame }) {
  const S = quality.texSize;
  const s = Math.max(256, S / 2);
  const vinyl = T.tiles(S, { cols: 4, rows: 4, a: '#e2d9c4', b: '#dcd2bc', grout: '#d2c8b4', groutW: 0.012, seed: 221, tile: 1.2, gloss: 0.1, speckle: 0.02 });
  await yieldFrame();
  const acoustic = T.tiles(s, { cols: 4, rows: 4, a: '#dcd2bf', b: '#d5cab6', grout: '#b7ad9a', groutW: 0.03, seed: 222, tile: 2.4, gloss: 0.9, speckle: 0.05, relief: 0.4 });
  await yieldFrame();
  const paint = T.plaster(s, { color: '#d9d0bf', seed: 223, tile: 3.0, relief: 0.2 });
  await yieldFrame();
  const tape = T.cautionTape();
  const exitTex = T.exitSign();

  const M = {
    floor: pbr(vinyl, { name: 'vinyl', roughness: 0.06, env: 1.9, normalScale: 0.12, transparent: true, opacity: 0.82, castShadow: false }),
    ceiling: pbr(acoustic, { name: 'acoustic', roughness: 0.95, env: 0.15, normalScale: 0.5, castShadow: false }),
    wall: pbr(paint, { name: 'wall', roughness: 0.9, env: 0.2, normalScale: 0.3 }),
    column: pbr(paint, { name: 'column', color: '#f0ebe0', roughness: 0.85, env: 0.25, normalScale: 0.3 }),
    strip: pbr(null, { name: 'strip', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#ffefd4', emissiveIntensity: STRIP_I, castShadow: false }),
    stripFlicker: pbr(null, { name: 'strip_flicker', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#ffefd4', emissiveIntensity: STRIP_I, castShadow: false }),
    stripHousing: pbr(null, { name: 'strip_housing', color: '#d5d2c8', roughness: 0.5, env: 0.3, castShadow: false }),
    gondola: pbr(null, { name: 'gondola', color: '#b9b8b2', roughness: 0.5, metalness: 0.4, env: 0.7 }),
    gondolaBack: pbr(null, { name: 'gondola_back', color: '#a3a29c', roughness: 0.7, metalness: 0.2, env: 0.4 }),
    kick: pbr(null, { name: 'kick', color: '#55544f', roughness: 0.7, env: 0.3 }),
    chrome: pbr(null, { name: 'chrome', color: '#d8dade', roughness: 0.2, metalness: 1, env: 1.4 }),
    cart: pbr(null, { name: 'cart_red', color: '#c8202a', roughness: 0.45, env: 0.6, emissive: '#5a0008', emissiveIntensity: 0.4 }),
    wheel: pbr(null, { name: 'wheel', color: '#151515', roughness: 0.8, env: 0.2 }),
    tape: pbr({ map: tape, tile: 1 }, { name: 'caution', roughness: 0.6, env: 0.3, side: THREE.DoubleSide, worldUV: false, castShadow: false }),
    exit: pbr({ map: exitTex, emissiveMap: exitTex, tile: 1 }, { name: 'exit_sign', color: '#ffffff', roughness: 0.6, env: 0, emissive: '#ffffff', emissiveIntensity: 2.2, worldUV: false, castShadow: false }),
    door: pbr(null, { name: 'exit_door', color: '#8d8f8a', roughness: 0.5, metalness: 0.3, env: 0.5 }),
    glass: pbr(null, { name: 'entrance_glass', color: '#0a0c10', roughness: 0.1, metalness: 0.2, env: 1.2 }),
    void: pbr(null, { name: 'void', color: '#000000', roughness: 1, env: 0, castShadow: false }),
    alarm: pbr(null, { name: 'alarm', color: '#d01818', roughness: 0.5, env: 0.3 }),
    tin: pbr(null, { name: 'tin', color: '#c9c8c2', roughness: 0.3, metalness: 0.75, env: 1.3 }),
    band: pbr(null, { name: 'tin_band', color: '#d9d0b9', roughness: 0.8, env: 0.25 }),
    cardboard: pbr(null, { name: 'cardboard', color: '#a7855a', roughness: 0.9, env: 0.2 }),
    // the odd tins: the cart's red, pulsing with it
    redBand: pbr(null, { name: 'tin_band_red', color: '#c8202a', roughness: 0.5, env: 0.5, emissive: '#5a0008', emissiveIntensity: 0.4, castShadow: false }),
    redTin: pbr(null, { name: 'tin_red', color: '#c9c8c2', roughness: 0.3, metalness: 0.75, env: 1.3, castShadow: false }),
  };

  const maze = makeMaze(20261);
  const { wall, entC, exitC, cr, cc } = maze;
  meta.start.x = cx(entC);
  meta.start.z = cz(ROWS - 1) + 0.3;
  const EXIT_X = cx(exitC), EXIT_Z = -D / 2;

  const R = createBuilder();   // mirrored under the floor
  const F = createBuilder();   // the floor itself and what stands in the water-like gloss
  const hw = W / 2, hd = D / 2, TH = 0.15;

  // --- the box: walls, ceiling, entrance glass, exit door -----------------------------------
  R.add(box(TH, HGT, D + 2 * TH), M.wall, place(-hw - TH / 2, HGT / 2, 0));
  R.add(box(TH, HGT, D + 2 * TH), M.wall, place(hw + TH / 2, HGT / 2, 0));
  // back wall with the exit door
  const DW = 1.1, DH = 2.15;
  R.add(box(EXIT_X - DW / 2 + hw, HGT, TH), M.wall, place(-hw + (EXIT_X - DW / 2 + hw) / 2, HGT / 2, -hd - TH / 2));
  R.add(box(hw - EXIT_X - DW / 2, HGT, TH), M.wall, place(hw - (hw - EXIT_X - DW / 2) / 2, HGT / 2, -hd - TH / 2));
  R.add(box(DW, HGT - DH, TH), M.wall, place(EXIT_X, DH + (HGT - DH) / 2, -hd - TH / 2));
  R.add(box(DW - 0.04, DH - 0.02, 0.06), M.door, place(EXIT_X, DH / 2, -hd - 0.02));
  R.add(box(0.8, 0.06, 0.06), M.chrome, place(EXIT_X, 1.0, -hd + 0.06));           // push bar
  R.add(box(0.94, 0.38, 0.06), M.kick, place(EXIT_X, DH + 0.35, -hd + 0.03));       // the sign box, proud of the wall
  R.mesh(new THREE.PlaneGeometry(0.9, 0.34), M.exit, place(EXIT_X, DH + 0.35, -hd + 0.065));
  R.add(box(DW + 2, HGT, 1.2), M.void, place(EXIT_X, HGT / 2, -hd - TH - 0.6));   // beyond the door
  // front wall: the entrance, black glass doors that will not open
  const EW = 4.0, EX = cx(entC);
  R.add(box(EX - EW / 2 + hw, HGT, TH), M.wall, place(-hw + (EX - EW / 2 + hw) / 2, HGT / 2, hd + TH / 2));
  R.add(box(hw - EX - EW / 2, HGT, TH), M.wall, place(hw - (hw - EX - EW / 2) / 2, HGT / 2, hd + TH / 2));
  R.add(box(EW, HGT - 2.4, TH), M.wall, place(EX, 2.4 + (HGT - 2.4) / 2, hd + TH / 2));
  R.add(box(EW, 2.4, 0.05), M.glass, place(EX, 1.2, hd + 0.05));
  // the chrome frame stands 2 mm proud of the wall, so its front no longer lies in the wall's face
  for (const dx of [-EW / 2, -EW / 4, 0, EW / 4, EW / 2]) R.add(box(0.06, 2.4, 0.08), M.chrome, place(EX + dx, 1.2, hd + 0.038));
  R.add(box(EW, 0.06, 0.08), M.chrome, place(EX, 2.4, hd + 0.038));
  // ceiling and the fluorescent rows (along z, one every 4 m), the leftmost flickers
  R.add(box(W + 2 * TH, TH, D + 2 * TH), M.ceiling, place(0, HGT + TH / 2, 0));
  const rows = [];
  for (let x = -16; x <= 16; x += 4) {
    R.add(box(0.3, 0.06, D - 1), M.stripHousing, place(x, HGT - 0.02, 0));
    R.add(box(0.22, 0.03, D - 1.2), x === -16 ? M.stripFlicker : M.strip, place(x, HGT - 0.05, 0));
    rows.push(x);
  }
  // columns on an 8 m grid (kept out of the aisles: they sit inside shelving cells)
  for (let c = 2; c < COLS - 1; c += 4) {
    for (let r = 2; r < ROWS - 1; r += 4) {
      if (Math.abs(r - cr) <= 2 && Math.abs(c - cc) <= 2) continue;
      wall[r][c] = true; // a column stands in a shelving cell; the maze routes around it
      R.add(box(0.5, HGT, 0.5), M.column, place(cx(c), HGT / 2, cz(r)));
      if (c === COLS - 3 && r === 2) R.add(box(0.12, 0.16, 0.05), M.alarm, place(cx(c) + 0.19, 1.5, cz(r) + 0.28));
    }
  }

  // --- the shelving maze ---------------------------------------------------------------------
  const colliders = [];
  const unit = (x, z, alongZ, len, H = SHELF_H) => {
    const L = len, Dp = 1.2;
    const rot = alongZ ? Math.PI / 2 : 0;
    const at = (lx, ly, lz) => place(x, ly, z, rot).multiply(place(lx, 0, lz));
    // the kick, the back panel and the shelf boards stop 3 mm inside the side panels (and the kick
    // 3 mm behind their front edges), so no two faces share a plane at an exposed end of a run
    R.add(box(L - 0.006, 0.12, Dp - 0.006), M.kick, at(0, 0.06, 0));
    R.add(box(L - 0.006, H, 0.06), M.gondolaBack, at(0, H / 2, 0));
    for (let k = 0; k * 0.4 + 0.16 < H - 0.1; k++) R.add(box(L - 0.006, 0.03, Dp), M.gondola, at(0, 0.16 + k * 0.4, 0));
    R.add(box(0.04, H, Dp), M.gondola, at(-L / 2 + 0.02, H / 2, 0));
    R.add(box(0.04, H, Dp), M.gondola, at(L / 2 - 0.02, H / 2, 0));
    R.add(box(L, 0.05, Dp), M.gondola, at(0, H + 0.02, 0));
  };
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!wall[r][c]) continue;
      const isColumn = c % 4 === 2 && r % 4 === 2 && !(Math.abs(r - cr) <= 2 && Math.abs(c - cc) <= 2) && c >= 2 && c < COLS - 1 && r >= 2 && r < ROWS - 1;
      colliders.push({ minX: cx(c) - CELL / 2, maxX: cx(c) + CELL / 2, minZ: cz(r) - CELL / 2, maxZ: cz(r) + CELL / 2 });
      if (isColumn) continue;
      const n = r > 0 && wall[r - 1][c], sth = r < ROWS - 1 && wall[r + 1][c];
      const e = c < COLS - 1 && wall[r][c + 1], w = c > 0 && wall[r][c - 1];
      const alongZ = (n || sth) && !(e || w) ? true : (e || w) && !(n || sth) ? false : (r === 0 || r === ROWS - 1) ? false : (c === 0 || c === COLS - 1);
      const perimeter = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
      unit(cx(c), cz(r), alongZ, CELL, perimeter ? SHELF_LOW : SHELF_H);
    }
  }

  // --- what is left: tins in the dead ends --------------------------------------------------------
  // A dead end is an aisle cell with one way in. A pile at its closed end blocks nothing (there
  // is nothing beyond it), so the maze stays solvable whatever the piles do.
  const TIN_R = 0.045, TIN_H = 0.125, TIN_GAP = 0.003;
  // The red tins (drawn on their own, below) are whole cans. A pile tin is an open body and a lid:
  // it only ever stands on the floor or on the lids below it, so it has no bottom to lie in the
  // glossy floor or on another lid. Body and lid are both tin, so they merge into one draw call.
  const tinBody = cyl(TIN_R, TIN_R, TIN_H, 8);
  const tinBand = cyl(TIN_R + 0.002, TIN_R + 0.002, TIN_H * 0.62, 8, true);
  const pileSide = cyl(TIN_R, TIN_R, TIN_H, 8, true);
  const pileTop = new THREE.CircleGeometry(TIN_R, 8).rotateX(-Math.PI / 2).translate(0, TIN_H / 2, 0);
  const TIN = [[pileSide, M.tin, null], [pileTop, M.tin, null], [tinBand, M.band, null]];
  // a red tin, as it is drawn (on its own, below), for the tests' record of the piles
  const RED = [[tinBody, M.redTin, null], [tinBand, M.redBand, null]];
  // The most a pyramid of `cols` can reach either side of its middle: piles.js spaces the tins by
  // the band's width plus the gap and keeps the jitter to 0.8 of the gap. It only makes room for
  // the trays before the pyramid is built; the trays are then set from what the pyramid drew.
  const pyramidHalf = (cols) => ((cols - 1) * (2 * (TIN_R + 0.002) + TIN_GAP) + 0.8 * TIN_GAP) / 2 + TIN_R + 0.002;
  // The flats: 0.42 x 0.3 trays, each turned by its stack's yaw plus up to TRAY_TWIST, and
  // drifting up to TRAY_JITTER. trayReach(base) is the most a stack turned by `base` from its pile
  // can reach from its centre, along the pile's own x (u) and z (v).
  const tray = box(0.42, 0.07, 0.3);
  const TRAY = [[tray, M.cardboard, null]];
  const TRAY_TWIST = 0.25, TRAY_JITTER = 0.03;
  const trayReach = (base) => {
    let u = 0, v = 0;
    for (let k = 0; k <= 32; k++) {
      const t = base + TRAY_TWIST * (k / 16 - 1), c = Math.abs(Math.cos(t)), sn = Math.abs(Math.sin(t));
      u = Math.max(u, 0.21 * c + 0.15 * sn);
      v = Math.max(v, 0.21 * sn + 0.15 * c);
    }
    const drift = TRAY_JITTER * Math.SQRT1_2 + 0.002;
    return { u: u + drift, v: v + drift };
  };
  const CLEAR_TIN = 0.03;    // between the trays and the tins
  const CLEAR_SHELF = 0.02;  // between anything in a dead end and the shelving cells around it
  const deadEnds = [];
  for (let r = 1; r < ROWS - 1; r += 2) {
    for (let c = 1; c < COLS - 1; c += 2) {
      if (wall[r][c] || (Math.abs(r - cr) <= 2 && Math.abs(c - cc) <= 2)) continue;
      if ((r === ROWS - 2 && c === entC) || (r === 1 && c === exitC)) continue;
      const open = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) => !wall[r + dr][c + dc]);
      if (open.length === 1) deadEnds.push({ r, c, open: open[0] });
    }
  }
  // spread them out: a seeded pick from each third of the store in turn, the first from each
  // third holding a red tin
  const pr = rng(4417);
  const thirds = [[], [], []];
  for (const d of deadEnds) thirds[Math.min(2, Math.floor((d.r / ROWS) * 3))].push(d);
  for (const t of thirds) for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(pr() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  const chosen = [];
  for (let round = 0; chosen.length < 8 && thirds.some((t) => t.length > round); round++) {
    for (const t of thirds) if (t[round] && chosen.length < 8) chosen.push({ ...t[round], game: round === 0 });
  }
  // fewer than three thirds with a dead end: make up the red tins from the rest
  for (const d of chosen) if (chosen.filter((e) => e.game).length < 3 && !d.game) d.game = true;
  const piles = [];
  const redAt = [];
  const pileItems = [];   // every pile as drawn, for the tests: { name, y, collider, pieces: [[matrix, item]] }
  chosen.forEach((d, i) => {
    const [dr, dc] = d.open;
    // The pile's back to the closed end, its face to the way in. In the pile's own frame u runs
    // across the dead end (the world's (ax, az)) and v toward the way in (the world's (dc, dr)).
    // About the pyramid's usual place, 0.65 m short of the cell's middle, the cell spans u -1..1.
    const ry = Math.atan2(dc, dr);
    const ax = Math.cos(ry), az = -Math.sin(ry);
    const cols = 9 + Math.floor(pr() * 4), rows = 3 + Math.floor(pr() * 2);
    // a few flats of cardboard to one side
    const side = pr() < 0.5 ? -1 : 1;
    const turn = (pr() - 0.5) * 0.4, count = 2 + Math.floor(pr() * 4);
    const reach = trayReach(turn);
    // The pyramid, the clearance and the trays must fit across the cell, short of the shelving;
    // where they would not, the pyramid moves over, away from the trays.
    const over = Math.max(0, pyramidHalf(cols) + CLEAR_TIN + 2 * reach.u - (CELL / 2 - CLEAR_SHELF));
    const x = cx(d.c) - dc * 0.65 - ax * side * over, z = cz(d.r) - dr * 0.65 - az * side * over;
    const p = pyramid(R, TIN, {
      x, z, ry, cols, rows, layers: rows, gap: TIN_GAP, jitter: 0.008, seed: 900 + i * 13, hold: d.game ? 1 : 0,
    });
    if (d.game) redAt.push(p.held[0]);
    // The trays stand CLEAR_TIN off the side of the tins as drawn, level with the pyramid's middle
    // and 5 cm toward the way in. The first rests on the floor; the stack is solid as drawn.
    const tu = side * ((side > 0 ? p.bounds.maxX : -p.bounds.minX) + CLEAR_TIN + reach.u);
    const tv = (p.bounds.minZ + p.bounds.maxZ) / 2 + 0.05;
    const trays = stack(R, TRAY, {
      x: x + ax * tu + dc * tv, z: z + az * tu + dr * tv, ry: ry + turn, count, h: 0.07,
      twist: TRAY_TWIST, jitter: TRAY_JITTER, seed: 950 + i, collide: true,
    });
    piles.push({ r: d.r, c: d.c, game: !!d.game, collider: p.collider, trays: trays.collider });
    pileItems.push({ name: `tins ${i}`, y: 0, collider: p.collider, pieces: [...p.items.map((m) => [m, TIN]), ...p.held.map((m) => [m, RED])] });
    pileItems.push({ name: `trays ${i}`, y: 0, collider: trays.collider, pieces: trays.items.map((m) => [m, TRAY]) });
  });
  // the red tins: drawn on their own (two instanced draw calls), three in the piles and three
  // more waiting, hidden, to be put in the cart
  const NT = redAt.length;
  const redBodies = new THREE.InstancedMesh(tinBody, M.redTin, NT * 2);
  const redBands = new THREE.InstancedMesh(tinBand, M.redBand, NT * 2);
  redBodies.frustumCulled = redBands.frustumCulled = false;
  redBodies.castShadow = redBands.castShadow = false;
  const HIDDEN = new THREE.Matrix4().makeTranslation(0, -20, 0);
  const tins = redAt.map((m, i) => {
    redBodies.setMatrixAt(i, m);
    redBands.setMatrixAt(i, m);
    redBodies.setMatrixAt(NT + i, HIDDEN);
    redBands.setMatrixAt(NT + i, HIDDEN);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    return { x: pos.x, y: pos.y, z: pos.z, taken: false };
  });
  redBodies.instanceMatrix.needsUpdate = redBands.instanceMatrix.needsUpdate = true;

  // --- the monument: the red cart, roped off ---------------------------------------------------
  const CX = cx(cc), CZ = cz(cr);
  {
    const bx = CX, bz = CZ;
    const basketW = 0.55, basketL = 0.9, basketH = 0.42, y0 = 0.62;
    // basket: rails and thin bars
    for (const dy of [0, basketH]) {
      R.add(box(basketL, 0.02, 0.02), M.cart, place(bx, y0 + dy, bz - basketW / 2));
      R.add(box(basketL, 0.02, 0.02), M.cart, place(bx, y0 + dy, bz + basketW / 2));
      R.add(box(0.02, 0.02, basketW), M.cart, place(bx - basketL / 2, y0 + dy, bz));
      R.add(box(0.02, 0.02, basketW), M.cart, place(bx + basketL / 2, y0 + dy, bz));
    }
    for (let i = 0; i <= 8; i++) {
      const lx = -basketL / 2 + i * (basketL / 8);
      R.add(box(0.012, basketH, 0.012), M.cart, place(bx + lx, y0 + basketH / 2, bz - basketW / 2));
      R.add(box(0.012, basketH, 0.012), M.cart, place(bx + lx, y0 + basketH / 2, bz + basketW / 2));
    }
    for (let i = 0; i <= 4; i++) {
      const lz = -basketW / 2 + i * (basketW / 4);
      R.add(box(0.012, basketH, 0.012), M.cart, place(bx - basketL / 2, y0 + basketH / 2, bz + lz));
      R.add(box(0.012, basketH, 0.012), M.cart, place(bx + basketL / 2, y0 + basketH / 2, bz + lz));
    }
    R.add(box(basketL, 0.012, basketW), M.cart, place(bx, y0, bz));
    R.add(box(0.04, 0.03, basketW + 0.1), M.cart, place(bx - basketL / 2 - 0.05, y0 + basketH + 0.1, bz));       // handle
    R.add(box(0.03, 0.14, 0.03), M.cart, place(bx - basketL / 2 - 0.03, y0 + basketH + 0.03, bz - basketW / 2));
    R.add(box(0.03, 0.14, 0.03), M.cart, place(bx - basketL / 2 - 0.03, y0 + basketH + 0.03, bz + basketW / 2));
    // chrome chassis and four wheels
    R.add(box(basketL + 0.1, 0.03, 0.03), M.chrome, place(bx, 0.2, bz - basketW / 2 + 0.05));
    R.add(box(basketL + 0.1, 0.03, 0.03), M.chrome, place(bx, 0.2, bz + basketW / 2 - 0.05));
    for (const [dx, dz] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.22], [0.4, 0.22]]) {
      R.add(cyl(0.03, 0.03, y0 - 0.2, 6), M.chrome, place(bx + dx, (y0 + 0.2) / 2, bz + dz));
      R.add(cyl(0.05, 0.05, 0.03, 10), M.wheel, place(bx + dx, 0.05, bz + dz, 0, Math.PI / 2));
    }
    colliders.push({ minX: bx - 0.55, maxX: bx + 0.55, minZ: bz - 0.4, maxZ: bz + 0.4 });
    // roped off as in the clip: a chrome railing on the left, two stanchions on the right,
    // and one length of caution tape sagging from the railing past the cart to the posts
    const post = (px, pz, h = 0.95) => {
      R.add(cyl(0.02, 0.02, h, 8), M.chrome, place(px, h / 2, pz));
      R.add(cyl(0.16, 0.18, 0.03, 12), M.chrome, place(px, 0.015, pz));
      R.add(sphere(0.035, 8, 6), M.chrome, place(px, h + 0.03, pz));
      colliders.push({ minX: px - 0.15, maxX: px + 0.15, minZ: pz - 0.15, maxZ: pz + 0.15 });
    };
    const railA = [bx - 2.4, bz + 1.9], railB = [bx - 2.4, bz + 0.3];
    post(railA[0], railA[1], 1.0); post(railB[0], railB[1], 1.0);
    for (const y of [0.55, 0.98]) R.add(cyl(0.016, 0.016, railA[1] - railB[1], 8), M.chrome, place(railA[0], y, (railA[1] + railB[1]) / 2, 0, Math.PI / 2));
    colliders.push({ minX: railA[0] - 0.08, maxX: railA[0] + 0.08, minZ: railB[1], maxZ: railA[1] });
    const postA = [bx + 1.3, bz + 1.9], postB = [bx + 2.7, bz + 1.1];
    post(postA[0], postA[1]); post(postB[0], postB[1]);
    const tapeRun = [[railA, postA, 0.9, 0.2], [postA, postB, 0.85, 0.1]];
    for (const [[ax, az], [bx2, bz2], y, sag] of tapeRun) {
      const len = Math.hypot(bx2 - ax, bz2 - az);
      const g = new THREE.PlaneGeometry(len, 0.07, 14, 1);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) { const u = pos.getX(k) / len + 0.5; pos.setY(k, pos.getY(k) - sag * (1 - Math.pow(2 * u - 1, 2))); }
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (len / 0.75), uv.getY(k));
      const ang = Math.atan2(-(bz2 - az), bx2 - ax);
      R.mesh(g, M.tape, place((ax + bx2) / 2, y, (az + bz2) / 2, ang));
    }
  }

  // --- floor (glossy, over the mirrored store) -------------------------------------------------
  const floorMesh = F.mesh(new THREE.PlaneGeometry(W + 2 * TH, D + 2 * TH), M.floor, place(0, 0, 0, 0, -Math.PI / 2));
  floorMesh.renderOrder = 2;
  F.add(box(W + 2 * TH, 0.5, D + 2 * TH), M.void, place(0, -HGT - 1, 0));
  F.object(redBodies);
  F.object(redBands);

  const roomOut = R.finish();
  const floorOut = F.finish();
  const group = new THREE.Group();
  group.add(roomOut.group);
  group.add(mirrorY(roomOut.group, 0));
  group.add(floorOut.group);
  colliders.push(...roomOut.colliders, ...floorOut.colliders);
  colliders.push({ minX: EX - EW / 2, maxX: EX + EW / 2, minZ: hd - 0.2, maxZ: hd + 1 });

  // --- lights ------------------------------------------------------------------------------------
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xf8e4c6, 0x9c8c74, 1.0)); // the ground tone also lights the ceiling's underside
  const POOL_I = 30;
  const pool = [];
  for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffe9cc, POOL_I, 20, 2); lights.add(l); pool.push(l); }
  const flickerLight = new THREE.PointLight(0xfff1dc, 20, 16, 2);
  flickerLight.position.set(-16, HGT - 0.4, 0);
  lights.add(flickerLight);
  const anomaly = new THREE.PointLight(0xff2020, 6, 8, 2);
  anomaly.position.set(CX, 1.2, CZ);
  lights.add(anomaly);

  // --- the goal: the EXIT door ---------------------------------------------------------------------
  const trigger = { minX: EXIT_X - 0.6, maxX: EXIT_X + 0.6, minZ: EXIT_Z - 0.2, maxZ: EXIT_Z + 0.55 };
  const nearGoal = { minX: EXIT_X - 2.5, maxX: EXIT_X + 2.5, minZ: EXIT_Z - 0.2, maxZ: EXIT_Z + 4 };

  // --- the bonus: three red tins for the cart --------------------------------------------------------
  const game = { tins, piles, held: 0, delivered: false, done: false };
  const tally = () => (game.delivered ? `RED TINS ${NT}/${NT}  ·  LIST COMPLETE`
    : game.held === NT ? `RED TINS ${NT}/${NT}  ·  TAKE THEM TO THE CART`
      : `RED TINS ${game.held}/${NT}`);
  const interact = tins.map((t, i) => ({
    x: t.x, y: t.y, z: t.z, reach: 1.9, size: 0.1, label: 'TAKE THE RED TIN',
    enabled: () => !t.taken,
    use(ctx) {
      t.taken = true;
      game.held++;
      redBodies.setMatrixAt(i, HIDDEN);
      redBands.setMatrixAt(i, HIDDEN);
      redBodies.instanceMatrix.needsUpdate = redBands.instanceMatrix.needsUpdate = true;
      ctx.sound.pickup();
      ctx.setTally(tally());
    },
  }));
  // in the basket: three red tins lying on its floor
  const BASKET_Y = 0.62 + TIN_R + 0.012;
  interact.push({
    x: CX, y: 0.85, z: CZ, reach: 2.3, size: 0.5, label: 'PUT THEM IN THE CART',
    enabled: () => game.held === NT && !game.delivered,
    use(ctx) {
      game.delivered = game.done = true;
      for (let i = 0; i < NT; i++) {
        const m = place(CX - 0.2 + i * 0.16, BASKET_Y, CZ + (i % 2 ? 0.08 : -0.06), 0, 0, Math.PI / 2);
        redBodies.setMatrixAt(NT + i, m);
        redBands.setMatrixAt(NT + i, m);
      }
      redBodies.instanceMatrix.needsUpdate = redBands.instanceMatrix.needsUpdate = true;
      ctx.sound.win();
      ctx.setReadout('PING_ACKNOWLEDGED');
      ctx.setTally(tally());
    },
  });

  let elapsed = 0, pinged = false, flickT = 0, flickState = 1, rowLevel = 1, tallySet = false;
  function update(p, dt, camera, ctx) {
    if (dt === undefined) return;
    elapsed += dt;
    if (!tallySet) { tallySet = true; ctx.setTally(tally()); }
    // every row breathes, and twice a loop the whole store dips (the clip's two beats)
    const rp = cycle(elapsed, ROW_PERIOD) * ROW_PERIOD;
    rowLevel = 1 + 0.04 * Math.sin(elapsed * 0.9);
    if (!ctx.reduced) {
      if (rp > DIP_A && rp < DIP_A + 0.15) rowLevel *= 0.4;
      else if (rp > DIP_B && rp < DIP_B + 0.1) rowLevel *= 0.7;
    }
    M.strip.emissiveIntensity = STRIP_I * rowLevel;
    // four strip lights follow the player along the rows
    const near = rows.slice().sort((a, b) => Math.abs(a - p.x) - Math.abs(b - p.x));
    const zz = Math.round(p.z / 4) * 4;
    pool[0].position.set(near[0], HGT - 0.4, zz);
    pool[1].position.set(near[0], HGT - 0.4, zz + (p.z > zz ? 4 : -4));
    pool[2].position.set(near[1], HGT - 0.4, zz);
    pool[3].position.set(near[1], HGT - 0.4, zz + (p.z > zz ? 4 : -4));
    for (const l of pool) l.intensity = POOL_I * rowLevel;
    flickerLight.position.z = zz;
    // the left row flickers: a hash-driven stutter every few seconds
    flickT += dt;
    const phase = elapsed % 9;
    if (phase > 6.2 && phase < 7.4 && !game.delivered) {
      const k = Math.floor(elapsed * 22);
      const on = ((k * 2654435761) >>> 0) % 7 < 4;
      flickState = on ? 1 : 0.1;
    } else flickState = 1;
    M.stripFlicker.emissiveIntensity = STRIP_I * flickState * rowLevel;
    flickerLight.intensity = 20 * flickState * rowLevel;
    // the anomaly pulses; a chime the first time you come near it
    const dCart = Math.hypot(p.x - CX, p.z - CZ);
    // ... until it has its tins back: then it holds steady, and so does the left row
    const pulse = game.delivered ? 0.6 : Math.sin(elapsed * 2.2);
    anomaly.intensity = 5 + 3 * pulse;
    M.cart.emissiveIntensity = 0.35 + 0.25 * pulse;
    M.redBand.emissiveIntensity = 0.45 + 0.35 * pulse;
    if (!pinged && dCart < 7) { pinged = true; ctx.sound.chime(); ctx.setReadout('PING_DETECTED_0x8F'); }
    if (pinged && !game.delivered && dCart < 4 && Math.floor(elapsed * 0.7) !== Math.floor((elapsed - dt) * 0.7)) ctx.sound.ping();
  }

  return {
    meta, group, lights, colliders, update, interact,
    bounds: { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd },
    trigger, nearGoal,
    exitPath: [new THREE.Vector3(EXIT_X, 1.62, EXIT_Z - 0.2), new THREE.Vector3(EXIT_X, 1.62, EXIT_Z - 1.1)],
    exitLookAt: new THREE.Vector3(EXIT_X, 1.5, EXIT_Z - 6),
    exitDuration: 2.0, exitFadeStart: 0.3,
    fog: new THREE.FogExp2(0xb9aa90, 0.014),
    background: 0xb9aa90,
    far: 120,
    exposure: 1.0,
    debug: { maze, stripFlicker: M.stripFlicker, strip: M.strip, get rowLevel() { return rowLevel; }, ROW_PERIOD, DIP_A, cart: { x: CX, z: CZ }, exit: { x: EXIT_X, z: EXIT_Z }, cellToWorld: (r, c) => [cx(c), cz(r)], CELL, game, redBodies, pileItems },
  };
}
