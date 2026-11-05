// The Dining Room — The Anchor. Built to match the room video: cream walls, green shag
// carpet, a round maple table with four arrow-back chairs, a sideboard with a green
// ceramic lamp, a wall of family photographs, sheer curtains on the right, and the
// dark, steep, green-carpeted stairwell in the back wall that the player has to reach.
//
// "They said to wait in the dining room": someone was getting ready for guests. The good
// china is stacked in crooked towers against the right wall, between the curtains and the front
// wall, with the folded tablecloths, and a short stack waits on the sideboard. The bonus game (it
// never touches the stairs): when the lamp clicks off, one of the photographs on the wall changes,
// and stays changed until it is found; the next changes at the first lamp-off after that.
//
// Coordinates: three.js metres, y up. The player starts at the front of the room
// (positive z) looking down -z at the stairs.
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, sphere, lathe, createBuilder, cycle } from '../build.js';
import { stack, rng } from '../piles.js';

export const meta = {
  id: 'dining',
  objective: 'FIND THE STAIRS',
  arrive: 'GO UP',
  // where the player stands and looks at the start
  start: { x: 0.25, z: 2.35, yaw: 0.04 },
  // this room's chapter: what script.js shows around the walk (see walk.js chapters())
  chapter: {
    id: 'A',
    room: 'The Dining Room',
    epithet: 'The Anchor',
    audio: 'A.mp3',
    load: 'a.MP4',
    video: 'A.mp4',
    rot: '-1.2deg',
    caption: 'They said to wait in the dining room, but the house feels quiet. Too quiet. I don’t remember those stairs being so steep, or so dark. I think I have to go up.',
    stamp: '14:32',
    log: 'I shouldn’t have come down here. The carpet on these stairs smells like old ozone and dust, but I’ve been walking for what feels like hours. I look up, and the top of the stairwell is gone. It just loops. I have to keep going. There’s no other way.',
  },
};

const ROOM = { w: 5.4, d: 6.4, h: 2.45 };            // x: ±2.7, z: ±3.2
// The room video is still for 4.35 of its 5 seconds, then the lamp clicks off. Stretched to
// the walk: every LAMP_PERIOD seconds the lamp goes dark for LAMP_OFF seconds and clicks back.
const LAMP_PERIOD = 28, LAMP_OFF_AT = 0.87, LAMP_OFF = 3;
const STAIR = { x0: -0.55, x1: 0.45, rise: 0.185, run: 0.25, steps: 14, z0: -3.2 };

export async function build({ quality, yieldFrame }) {
  const S = quality.texSize;   // 1024 desktop / 512 phone
  const s = Math.max(256, S / 2);

  // --- textures (generated; yield between the big ones so the video keeps playing) ----
  const carpet = T.carpet(S, { color: '#4a7a3e', shade: '#2a4a25', light: '#6f9c5a', seed: 11, tile: 1.1 });
  await yieldFrame();
  const stairCarpet = T.carpet(s, { color: '#3a6e36', shade: '#1d3a1b', light: '#569a4c', seed: 12, tile: 0.7 });
  await yieldFrame();
  const wall = T.plaster(S, { color: '#e7dcc4', seed: 21, tile: 2.2, relief: 0.35 });
  await yieldFrame();
  const ceiling = T.plaster(s, { color: '#f1ece1', seed: 22, tile: 2.6, relief: 0.2 });
  await yieldFrame();
  const maple = T.wood(S, { color: '#a5733f', dark: '#7e5330', seed: 31, tile: 0.9, rings: 9, gloss: 0.42 });
  await yieldFrame();
  const oak = T.wood(s, { color: '#98682e', dark: '#6e4620', seed: 32, tile: 0.8, rings: 14, gloss: 0.5 });
  await yieldFrame();
  const sheer = T.curtain(s, { color: '#f0eadc', seed: 41, pleats: 10 });
  const shade = T.lampshade(256, { seed: 51 });
  await yieldFrame();

  // --- materials ---------------------------------------------------------------------
  const M = {
    carpet: pbr(carpet, { name: 'carpet', roughness: 1, env: 0.12, normalScale: 0.9, castShadow: false }),
    stairCarpet: pbr(stairCarpet, { name: 'stair_carpet', roughness: 1, env: 0.08, normalScale: 0.8 }),
    wall: pbr(wall, { name: 'wall', roughness: 0.95, env: 0.2, normalScale: 0.3 }),
    wallDark: pbr(wall, { name: 'stair_wall', color: '#b9ad97', roughness: 0.95, env: 0.05, normalScale: 0.3 }),
    ceiling: pbr(ceiling, { name: 'ceiling', roughness: 1, env: 0.15, normalScale: 0.12, castShadow: false }),
    trim: pbr(null, { name: 'trim', color: '#efe7d6', roughness: 0.55, env: 0.3 }),
    maple: pbr(maple, { name: 'maple', roughness: 0.5, env: 0.5, normalScale: 0.5, worldUV: false }),
    mapleTop: pbr(maple, { name: 'maple_top', roughness: 0.34, env: 0.8, normalScale: 0.25, worldUV: true, tile: 1.6 }),
    oak: pbr(oak, { name: 'oak', roughness: 0.55, env: 0.45, normalScale: 0.5, worldUV: true, tile: 0.8 }),
    oakTurned: pbr(oak, { name: 'oak_turned', roughness: 0.5, env: 0.45, normalScale: 0.5, worldUV: false }),
    frame: pbr(null, { name: 'photo_frame', color: '#2b1c12', roughness: 0.45, env: 0.5 }),
    frameGilt: pbr(null, { name: 'photo_frame_gilt', color: '#b08a3c', roughness: 0.35, metalness: 0.8, env: 1.0 }),
    matBoard: pbr(null, { name: 'mat_board', color: '#efe8da', roughness: 0.9, env: 0.2 }),
    ceramic: pbr(null, { name: 'ceramic', color: '#2f6b46', roughness: 0.22, env: 1.1 }),
    brass: pbr(null, { name: 'brass', color: '#c9a35a', roughness: 0.35, metalness: 1, env: 1.2 }),
    shade: pbr(shade, { name: 'lampshade', color: '#fff3dc', roughness: 0.9, env: 0.1, emissive: '#ffcf8a', emissiveIntensity: 0.55, side: THREE.DoubleSide, worldUV: false, castShadow: false }),
    bulb: pbr(null, { name: 'bulb', color: '#fff6e4', roughness: 1, env: 0, emissive: '#ffd9a4', emissiveIntensity: 3.5, castShadow: false }),
    curtain: pbr(sheer, { name: 'curtain', roughness: 0.85, env: 0.25, normalScale: 1.0, side: THREE.DoubleSide, worldUV: false, castShadow: false }),
    rod: pbr(null, { name: 'curtain_rod', color: '#d8d2c4', roughness: 0.5, env: 0.4 }),
    switchPlate: pbr(null, { name: 'switch', color: '#efe9dc', roughness: 0.6, env: 0.3 }),
    domeLight: pbr(null, { name: 'dome_light', color: '#fff8ea', roughness: 0.6, env: 0.2, emissive: '#fff1d6', emissiveIntensity: 1.4, castShadow: false }),
    door: pbr(oak, { name: 'top_door', color: '#5a4630', roughness: 0.6, env: 0.15, worldUV: true, tile: 0.8 }),
    dark: pbr(null, { name: 'void', color: '#050505', roughness: 1, env: 0, castShadow: false }),
    china: pbr(null, { name: 'china', color: '#f3efe6', roughness: 0.16, env: 1.2 }),
    linen: pbr(null, { name: 'linen', color: '#ece3cf', roughness: 0.95, env: 0.12 }),
    damask: pbr(null, { name: 'damask', color: '#d8c7a4', roughness: 0.9, env: 0.15 }),
  };

  const B = createBuilder();
  const { w, d, h } = ROOM;
  const hx = w / 2, hz = d / 2;
  const TH = 0.12; // wall thickness

  // --- shell --------------------------------------------------------------------
  B.add(box(w + 2 * TH, TH, d + 2 * TH), M.carpet, place(0, -TH / 2, 0));
  B.add(box(w + 2 * TH, TH, d + 2 * TH), M.ceiling, place(0, h + TH / 2, 0));
  B.add(box(TH, h, d + 2 * TH), M.wall, place(-hx - TH / 2, h / 2, 0));       // left
  B.add(box(TH, h, d + 2 * TH), M.wall, place(hx + TH / 2, h / 2, 0));        // right
  B.add(box(w, h, TH), M.wall, place(0, h / 2, hz + TH / 2));                  // front (behind the player)
  // back wall with the stair opening
  const openW = STAIR.x1 - STAIR.x0, openH = 2.03;
  const leftW = STAIR.x0 + hx, rightW = hx - STAIR.x1;
  B.add(box(leftW, h, TH), M.wall, place(-hx + leftW / 2, h / 2, -hz - TH / 2));
  B.add(box(rightW, h, TH), M.wall, place(hx - rightW / 2, h / 2, -hz - TH / 2));
  B.add(box(openW, h - openH, TH), M.wall, place((STAIR.x0 + STAIR.x1) / 2, openH + (h - openH) / 2, -hz - TH / 2));
  // door casing around the opening
  const cas = 0.07;
  B.add(box(cas, openH + cas, 0.03), M.trim, place(STAIR.x0 - cas / 2, (openH + cas) / 2, -hz + 0.015));
  B.add(box(cas, openH + cas, 0.03), M.trim, place(STAIR.x1 + cas / 2, (openH + cas) / 2, -hz + 0.015));
  B.add(box(openW + 2 * cas, cas, 0.03), M.trim, place((STAIR.x0 + STAIR.x1) / 2, openH + cas / 2, -hz + 0.015));

  // baseboards
  const bb = 0.1, bt = 0.016;
  B.add(box(bt, bb, d), M.trim, place(-hx + bt / 2, bb / 2, 0));
  B.add(box(bt, bb, d), M.trim, place(hx - bt / 2, bb / 2, 0));
  B.add(box(w, bb, bt), M.trim, place(0, bb / 2, hz - bt / 2));
  B.add(box(leftW, bb, bt), M.trim, place(-hx + leftW / 2, bb / 2, -hz + bt / 2));
  B.add(box(rightW, bb, bt), M.trim, place(hx - rightW / 2, bb / 2, -hz + bt / 2));

  // --- stairwell ------------------------------------------------------------------
  const runTotal = STAIR.run * STAIR.steps;
  const topY = STAIR.rise * STAIR.steps;
  const zEnd = STAIR.z0 - runTotal;
  const landD = 0.9;
  const sx = (STAIR.x0 + STAIR.x1) / 2;
  for (let i = 0; i < STAIR.steps; i++) {
    const zc = STAIR.z0 - (i + 0.5) * STAIR.run;
    const top = (i + 1) * STAIR.rise;
    // each step is a full box down to the floor: risers and treads both carpeted
    B.add(box(openW, top, STAIR.run), M.stairCarpet, place(sx, top / 2, zc));
  }
  B.add(box(openW, topY, landD), M.stairCarpet, place(sx, topY / 2, zEnd - landD / 2));
  // stairwell walls, sloped ceiling and the dark door at the top
  const wallLen = runTotal + landD + TH;
  const wallH = topY + 2.15;
  // set 2 mm back from the opening's reveals and from the back wall's room face, so no face of
  // theirs lies in one of the back wall's: the back wall's face is the one that shows
  B.add(box(TH, wallH, wallLen - 0.002), M.wallDark, place(STAIR.x0 - TH / 2 - 0.002, wallH / 2, STAIR.z0 - 0.002 - (wallLen - 0.002) / 2));
  B.add(box(TH, wallH, wallLen - 0.002), M.wallDark, place(STAIR.x1 + TH / 2 + 0.002, wallH / 2, STAIR.z0 - 0.002 - (wallLen - 0.002) / 2));
  const slope = Math.atan2(topY, runTotal);
  const ceilLen = Math.hypot(topY, runTotal) + 0.3;
  B.add(box(openW + 2 * TH, TH, ceilLen), M.wallDark,
    place(sx, openH + 0.25 + topY / 2, STAIR.z0 - runTotal / 2, 0, slope));
  B.add(box(openW + 2 * TH, TH, landD + TH), M.wallDark, place(sx, topY + 2.15, zEnd - landD / 2));
  // stringer boards along both sides
  const strLen = Math.hypot(topY, runTotal);
  B.add(box(0.03, 0.26, strLen), M.oak, place(STAIR.x1 - 0.015, topY / 2 + 0.12, STAIR.z0 - runTotal / 2, 0, slope));
  B.add(box(0.03, 0.26, strLen), M.oak, place(STAIR.x0 + 0.015, topY / 2 + 0.12, STAIR.z0 - runTotal / 2, 0, slope));
  // handrail on the right, on two brackets
  B.add(cyl(0.02, 0.02, strLen, 8), M.oakTurned, place(STAIR.x1 - 0.06, topY / 2 + 0.9, STAIR.z0 - runTotal / 2, 0, slope + Math.PI / 2));
  // the door at the top: a dark panel with a hair of light around it
  B.add(box(0.9, 2.0, 0.05), M.door, place(sx, topY + 1.0, zEnd - landD + 0.03));
  B.add(box(1.0, 2.08, 0.02), M.bulb, place(sx, topY + 1.04, zEnd - landD + 0.005));
  // the black past the door: its sides stop 4 mm inside the landing ceiling's sides, buried in the
  // stairwell walls
  B.add(box(openW + 2 * TH - 0.008, wallH, TH), M.dark, place(sx, wallH / 2, zEnd - landD - TH / 2));

  // --- table -----------------------------------------------------------------------
  const TX = 0.15, TZ = -0.55, TR = 0.62, TH_TOP = 0.74;
  B.add(lathe([[0, TH_TOP - 0.04], [TR - 0.03, TH_TOP - 0.04], [TR, TH_TOP - 0.02], [TR, TH_TOP - 0.005], [TR - 0.01, TH_TOP], [0, TH_TOP]], 40), M.mapleTop, place(TX, 0, TZ));
  B.add(cyl(TR - 0.1, TR - 0.1, 0.07, 32, true), M.mapleTop, place(TX, TH_TOP - 0.075, TZ)); // apron ring
  const legProfile = [[0.03, 0], [0.035, 0.02], [0.028, 0.08], [0.045, 0.16], [0.03, 0.24], [0.05, 0.3], [0.038, 0.4], [0.05, 0.48], [0.032, 0.56], [0.045, 0.62], [0.04, 0.69]];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    B.add(lathe(legProfile, 14), M.maple, place(TX + Math.cos(a) * 0.42, 0, TZ + Math.sin(a) * 0.42), { uvScale: [0.3, 0.6] });
  }
  B.collider(TX, TZ, 1.28, 1.28);

  // --- chairs ------------------------------------------------------------------------
  function chair(x, z, ry) {
    const at = (lx, ly, lz, rx = 0, rz = 0) => {
      const c = Math.cos(ry), s2 = Math.sin(ry);
      return place(x + lx * c + lz * s2, ly, z - lx * s2 + lz * c, ry, rx, rz);
    };
    const seatY = 0.45;
    B.add(box(0.42, 0.035, 0.40), M.oak, at(0, seatY, 0));
    const leg = [[0.018, 0], [0.022, 0.02], [0.016, 0.1], [0.026, 0.16], [0.018, 0.24], [0.028, 0.3], [0.02, 0.38], [0.024, seatY - 0.02]];
    for (const [lx, lz] of [[-0.17, -0.16], [0.17, -0.16], [-0.17, 0.16], [0.17, 0.16]]) B.add(lathe(leg, 10), M.oakTurned, at(lx, 0, lz), { uvScale: [1, 0.4] });
    // stretchers
    B.add(cyl(0.011, 0.011, 0.32, 8), M.oakTurned, at(-0.17, 0.16, 0, Math.PI / 2, 0));
    B.add(cyl(0.011, 0.011, 0.32, 8), M.oakTurned, at(0.17, 0.16, 0, Math.PI / 2, 0));
    B.add(cyl(0.011, 0.011, 0.34, 8), M.oakTurned, at(0, 0.2, 0, 0, Math.PI / 2));
    // back posts, arrow-back slats and crest rail
    const post = [[0.016, seatY], [0.02, seatY + 0.06], [0.014, seatY + 0.2], [0.02, seatY + 0.3], [0.014, seatY + 0.42], [0.018, 0.96]];
    B.add(lathe(post, 10), M.oakTurned, at(-0.19, 0, -0.17), { uvScale: [1, 0.5] });
    B.add(lathe(post, 10), M.oakTurned, at(0.19, 0, -0.17), { uvScale: [1, 0.5] });
    for (const lx of [-0.1, -0.033, 0.033, 0.1]) B.add(box(0.03, 0.42, 0.012), M.oak, at(lx, seatY + 0.245, -0.17));
    B.add(box(0.44, 0.1, 0.035), M.oak, at(0, 0.94, -0.17));
    B.collider(x, z, 0.46, 0.46);
  }
  chair(TX, TZ - 0.98, 0);              // far side, back to the stairs
  chair(TX, TZ + 0.98, Math.PI);        // near side
  chair(TX + 0.98, TZ, Math.PI / 2);    // right
  chair(TX - 0.98, TZ, -Math.PI / 2);   // left

  // --- sideboard + lamp ----------------------------------------------------------------
  const SBX = -hx + 0.25, SBZ = -0.95, SBW = 0.48, SBD = 1.34, SBH = 0.78;
  B.add(box(SBW, SBH - 0.1, SBD), M.oak, place(SBX, 0.1 + (SBH - 0.1) / 2, SBZ));
  B.add(box(SBW + 0.03, 0.03, SBD + 0.03), M.oak, place(SBX, SBH - 0.015, SBZ));
  B.add(box(SBW - 0.06, 0.1, SBD - 0.08), M.frame, place(SBX, 0.05, SBZ)); // toe kick
  // drawer fronts and doors (proud of the carcass on the room-facing side)
  const face = SBX + SBW / 2;
  for (const dz of [-0.33, 0.33]) {
    B.add(box(0.012, 0.16, 0.6), M.oak, place(face + 0.006, SBH - 0.13, SBZ + dz));
    B.add(box(0.012, 0.42, 0.6), M.oak, place(face + 0.006, 0.33, SBZ + dz));
    B.add(sphere(0.014, 8, 6), M.brass, place(face + 0.025, SBH - 0.13, SBZ + dz));
    B.add(sphere(0.014, 8, 6), M.brass, place(face + 0.025, 0.45, SBZ + dz + (dz < 0 ? 0.22 : -0.22)));
  }
  B.collider(SBX, SBZ, SBW + 0.04, SBD + 0.04);
  // lamp
  const LX = SBX, LZ = SBZ - 0.32, LY = SBH;
  const lampBase = [[0.085, 0], [0.09, 0.015], [0.07, 0.03], [0.12, 0.1], [0.135, 0.17], [0.12, 0.25], [0.075, 0.31], [0.05, 0.34], [0.045, 0.4], [0.03, 0.42]];
  B.add(lathe(lampBase, 24), M.ceramic, place(LX, LY, LZ));
  B.add(cyl(0.008, 0.008, 0.2, 8), M.brass, place(LX, LY + 0.5, LZ));
  B.add(sphere(0.03, 12, 8), M.bulb, place(LX, LY + 0.58, LZ));
  B.add(cyl(0.12, 0.19, 0.26, 32, true), M.shade, place(LX, LY + 0.6, LZ), { uvScale: [3, 1] });
  B.collider(LX, LZ, 0.4, 0.4);

  // --- photo wall -------------------------------------------------------------------
  const PZ = -hz + 0.012;
  const prints = [];  // the photographs, for the game: mesh, material, its own print, size
  const photos = [
    [-2.3, 1.72, 0.2, 0.26, 'dark'], [-2.02, 1.86, 0.17, 0.2, 'gilt'], [-1.72, 1.78, 0.26, 0.3, 'dark'],
    [-2.28, 1.42, 0.16, 0.2, 'gilt'], [-2.0, 1.5, 0.22, 0.26, 'dark'], [-1.68, 1.44, 0.18, 0.22, 'gilt'],
    [-1.4, 1.64, 0.2, 0.24, 'dark'], [-1.42, 1.32, 0.17, 0.2, 'dark'], [-1.14, 1.5, 0.24, 0.3, 'gilt'],
  ];
  photos.forEach(([px, py, pw, ph, kind], i) => {
    const fm = kind === 'gilt' ? M.frameGilt : M.frame;
    B.add(box(pw + 0.04, ph + 0.04, 0.025), fm, place(px, py, PZ + 0.0125));
    B.add(box(pw + 0.01, ph + 0.01, 0.004), M.matBoard, place(px, py, PZ + 0.027));
    const tex = T.photo(Math.max(128, S / 4), { seed: 100 + i * 7, warm: i % 3 !== 1 });
    const pm = pbr(tex, { name: 'photo_' + i, roughness: 0.55, env: 0.6, worldUV: false, castShadow: false });
    const mesh = B.mesh(new THREE.PlaneGeometry(pw - 0.03, ph - 0.03), pm, place(px, py, PZ + 0.0305));
    prints.push({ mesh, mat: pm, map: pm.map, x: px, y: py, z: PZ + 0.0305, size: Math.max(pw, ph) / 2 });
  });
  // light switch by the stairs
  B.add(box(0.075, 0.12, 0.008), M.switchPlate, place(-0.78, 1.22, PZ + 0.004));
  B.add(box(0.012, 0.028, 0.012), M.switchPlate, place(-0.78, 1.225, PZ + 0.012));

  // --- curtains on the right wall --------------------------------------------------------
  const CX = hx - 0.09, CZ0 = -2.55, CZ1 = -0.35, CY0 = 0.06, CY1 = 2.3;
  const curtainGeo = new THREE.PlaneGeometry(CZ1 - CZ0, CY1 - CY0, 48, 1);
  {
    const pos = curtainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) / (CZ1 - CZ0)) + 0.5;
      pos.setZ(i, Math.sin(u * Math.PI * 2 * 10) * 0.028 + Math.sin(u * Math.PI * 2 * 2.3) * 0.02);
    }
    curtainGeo.computeVertexNormals();
    const uv = curtainGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.2, uv.getY(i));
  }
  B.mesh(curtainGeo, M.curtain, place(CX, (CY0 + CY1) / 2, (CZ0 + CZ1) / 2, -Math.PI / 2));
  B.add(cyl(0.012, 0.012, CZ1 - CZ0 + 0.2, 8), M.rod, place(CX + 0.02, CY1 + 0.04, (CZ0 + CZ1) / 2, 0, Math.PI / 2));
  B.add(sphere(0.025, 8, 6), M.rod, place(CX + 0.02, CY1 + 0.04, CZ0 - 0.1));
  B.add(sphere(0.025, 8, 6), M.rod, place(CX + 0.02, CY1 + 0.04, CZ1 + 0.1));

  // --- the good china: crooked towers and folded tablecloths against the right wall, between the
  // curtains and the front wall -----------------------------------------------------------------
  // Each plate stands 17 mm over the one below it, a few millimetres clear of its well (stack()
  // measures the plate, so it never comes lower than resting in it), and each cloth lies on the floor
  // or on the cloth below. The towers stand apart, and the damask is folded thinner than the linen
  // beside it, so where two stacks come close their layers never share a height.
  const plate = lathe([[0, 0], [0.075, 0], [0.1, 0.011], [0.125, 0.02], [0.12, 0.023], [0.08, 0.01], [0, 0.009]], 14);
  const PLATE = [[plate, M.china, null]];
  const LINEN = [[box(0.36, 0.045, 0.27), M.linen, null]], DAMASK = [[box(0.36, 0.04, 0.27), M.damask, null]];
  const towers = [
    ['china 0', PLATE, { x: 2.3, z: 0.42, count: 19, h: 0.017, lean: 0.06, twist: 0.3, jitter: 0.006, seed: 61 }],
    ['china 1', PLATE, { x: 2.0, z: 0.72, count: 13, h: 0.017, lean: -0.05, twist: 0.3, jitter: 0.006, seed: 62 }],
    ['china 2', PLATE, { x: 2.33, z: 0.98, ry: 0.5, count: 24, h: 0.017, lean: 0.08, twist: 0.3, jitter: 0.006, seed: 63 }],
    ['linen', LINEN, { x: 2.28, z: 1.42, ry: 0.25, count: 8, twist: 0.12, jitter: 0.02, seed: 64 }],
    ['damask', DAMASK, { x: 1.85, z: 1.3, ry: 0.1, count: 5, twist: 0.12, jitter: 0.02, seed: 65 }],
  ].map(([name, item, o]) => ({ name, item, pile: stack(B, item, o) }));
  // one collider round them all: the box of everything drawn there
  const cb = towers.reduce((b, { pile: p }) => ({
    minX: Math.min(b.minX, p.aabb.minX), maxX: Math.max(b.maxX, p.aabb.maxX),
    minZ: Math.min(b.minZ, p.aabb.minZ), maxZ: Math.max(b.maxZ, p.aabb.maxZ),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  B.collider((cb.minX + cb.maxX) / 2, (cb.minZ + cb.maxZ) / 2, cb.maxX - cb.minX, cb.maxZ - cb.minZ);
  const chinaPile = B.colliders[B.colliders.length - 1];
  // and a short stack on the sideboard, ready to be laid: the first plate stands on its top
  const ready = stack(B, PLATE, { x: SBX + 0.02, z: SBZ + 0.38, y: SBH, count: 9, h: 0.017, lean: 0.01, twist: 0.3, jitter: 0.004, seed: 66 });
  // every pile as drawn, for the tests: { name, y, collider, pieces: [[matrix, item]] }
  const pileItems = [
    ...towers.map(({ name, item, pile }) => ({ name, y: 0, collider: chinaPile, pieces: pile.items.map((m) => [m, item]) })),
    { name: 'sideboard china', y: SBH, collider: null, pieces: ready.items.map((m) => [m, PLATE]) },
  ];

  // --- ceiling fixture --------------------------------------------------------------------
  B.add(sphere(0.19, 20, 10), M.domeLight, place(TX, h + 0.03, TZ + 0.1));
  B.add(cyl(0.22, 0.22, 0.02, 20), M.trim, place(TX, h - 0.01, TZ + 0.1));

  // back wall segments and the stairwell walls block; the opening itself is walkable
  B.collider(-hx + leftW / 2, -hz - TH / 2, leftW, TH);
  B.collider(hx - rightW / 2, -hz - TH / 2, rightW, TH);
  B.collider(STAIR.x0 - TH / 2, STAIR.z0 - 1.0, TH, 2.0);
  B.collider(STAIR.x1 + TH / 2, STAIR.z0 - 1.0, TH, 2.0);

  const { group, colliders } = B.finish();

  // --- lights ----------------------------------------------------------------------------
  const lights = new THREE.Group();
  const hemi = new THREE.HemisphereLight(0xfff2dc, 0x2f4a2a, 0.55);
  lights.add(hemi);
  const ceilingLight = new THREE.PointLight(0xffe4bf, 26, 11, 2);
  ceilingLight.position.set(TX, h - 0.28, TZ + 0.1);
  ceilingLight.castShadow = quality.shadows;
  ceilingLight.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  ceilingLight.shadow.bias = -0.004;
  ceilingLight.shadow.normalBias = 0.02;
  lights.add(ceilingLight);
  const lamp = new THREE.PointLight(0xffc27a, 7, 6, 2);
  lamp.position.set(LX, LY + 0.58, LZ);
  lamp.castShadow = quality.shadows;
  lamp.shadow.mapSize.set(quality.shadowMap / 2, quality.shadowMap / 2);
  lamp.shadow.bias = -0.004;
  lamp.shadow.normalBias = 0.02;
  lights.add(lamp);
  // a cold sliver from under the door at the top of the stairs
  const stairTop = new THREE.PointLight(0xa9c4ff, 1.6, 4.5, 2);
  stairTop.position.set(sx, topY + 0.6, zEnd - 0.2);
  lights.add(stairTop);
  // faint spill into the well so the first treads read
  const stairFoot = new THREE.PointLight(0xffe4bf, 2.4, 3.2, 2);
  stairFoot.position.set(sx, 1.9, STAIR.z0 - 0.35);
  lights.add(stairFoot);
  // a small picture light, for the game: dark until the prompt points at a photograph, then on
  // that one from just above it (hover(), below). It is in the room from the start, so lighting a
  // print only moves it and turns it up: the room keeps its number of lights, and nothing recompiles.
  const pictureLight = new THREE.SpotLight(0xffe6c4, 0, 1.4, 0.3, 0.35, 2);
  lights.add(pictureLight, pictureLight.target);

  // --- the goal --------------------------------------------------------------------------
  const trigger = { minX: STAIR.x0, maxX: STAIR.x1, minZ: STAIR.z0 - 0.45, maxZ: STAIR.z0 + 0.15 };
  const nearGoal = { minX: STAIR.x0 - 0.6, maxX: STAIR.x1 + 0.6, minZ: STAIR.z0 - 0.5, maxZ: STAIR.z0 + 1.2 };
  // the climb the camera takes once the player reaches the foot of the stairs
  const exitPath = [
    new THREE.Vector3(sx, 1.62, STAIR.z0 - 0.1),
    new THREE.Vector3(sx, 1.62 + topY * 0.55, STAIR.z0 - runTotal * 0.55),
    new THREE.Vector3(sx, 1.62 + topY, zEnd - 0.25),
  ];

  // --- the bonus: when the lamp clicks off, a photograph changes until it is found ---------------
  // Turned upside down, gone to grey lines (the log: the grain "disappeared into gray lines"),
  // or gone dark. It stays changed through later lamp-offs until it is found, and the next one
  // changes at the first lamp-off after that. Every photo is a target while a change is waiting,
  // so the prompt gives nothing away; the picture light shows which one it points at (the same
  // light on every print, so that gives nothing away either). Three found and the lamp stays on.
  const greyLines = T.canvasTexture(64, 64, (g, w, hh) => {
    g.fillStyle = '#8c8b87';
    g.fillRect(0, 0, w, hh);
    for (let y = 0; y < hh; y += 2) { g.fillStyle = (y / 2) % 2 ? '#6d6c68' : '#a8a7a2'; g.fillRect(0, y, w, 1); }
  });
  const KINDS = ['upside down', 'grey lines', 'dark'];
  const order = prints.map((_, i) => i);
  { const r = rng(77); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
  const game = { photos: prints, changed: -1, kind: null, round: 0, found: 0, done: false, misses: 0 };
  const WANT = 3;
  // where the picture light hangs off the print it lights (metres above and out from the wall)
  const PICTURE = { up: 0.28, out: 0.5, intensity: 2 };
  let litPrint = -1;
  function change(i, kind) {
    const w = prints[i];
    if (kind === 'upside down') w.mesh.rotation.z = Math.PI;
    else if (kind === 'grey lines') w.mat.map = greyLines;
    else w.mat.color.set('#1b1815');
  }
  function restore(i) {
    const w = prints[i];
    w.mesh.rotation.z = 0;
    w.mat.map = w.map;
    w.mat.color.set('#ffffff');
  }
  const interact = prints.map((w, i) => ({
    x: w.x, y: w.y, z: w.z, reach: 2.2, size: w.size, label: 'THAT ONE?',
    enabled: () => game.changed >= 0,
    // the print the prompt points at is under the picture light (play.js calls this as the pick
    // changes, the old pick off before the new one on). Light, not the print's material, which
    // only change() and restore() touch: a darkened or lined print is lit as it is.
    hover(on) {
      if (on) {
        pictureLight.position.set(w.x, w.y + PICTURE.up, w.z + PICTURE.out);
        pictureLight.target.position.set(w.x, w.y, w.z);
        pictureLight.angle = Math.atan((w.size + 0.03) / Math.hypot(PICTURE.up, PICTURE.out));
        pictureLight.intensity = PICTURE.intensity;
        litPrint = i;
      } else if (litPrint === i) {
        pictureLight.intensity = 0;
        litPrint = -1;
      }
    },
    use(ctx) {
      if (i !== game.changed) {
        game.misses++;
        ctx.sound.wrong();
        ctx.setTally(`NOT THAT ONE  ·  ${game.found}/${WANT}`);
        return;
      }
      restore(i);
      game.changed = -1;
      game.kind = null;
      game.found++;
      if (game.found >= WANT) {
        game.done = true;
        ctx.sound.win();
        ctx.setTally(`FOUND ${game.found}/${WANT}  ·  THE ROOM HOLDS STILL`);
      } else {
        ctx.sound.pickup();
        ctx.setTally(`FOUND ${game.found}/${WANT}  ·  WAIT FOR THE LAMP`);
      }
    },
  }));

  // --- the lamp clicks off, as in the clip ----------------------------------------------
  const shadeGlow = M.shade.emissiveIntensity, bulbGlow = M.bulb.emissiveIntensity, lampPower = lamp.intensity;
  const shadeColor = M.shade.color.clone();
  let elapsed = 0, lampLevel = 1, lampOn = true, tallySet = false;
  function update(p, dt, camera, ctx) {
    if (dt === undefined) return;
    elapsed += dt;
    // the score line from the first frame, so the room says it has a game before the first lamp-off
    if (!tallySet) { tallySet = true; ctx.setTally(`WATCH THE PHOTOGRAPHS  ·  0/${WANT}`); }
    const ph = cycle(elapsed, LAMP_PERIOD);
    // once the three are found the room is anchored: the lamp stays on
    const wantOn = game.done || !(ph > LAMP_OFF_AT && ph < LAMP_OFF_AT + LAMP_OFF / LAMP_PERIOD);
    if (wantOn !== lampOn) {
      lampOn = wantOn;
      ctx.sound.click();
      // (not once the climb has begun: the game can no longer be played)
      if (!lampOn && !game.done && game.changed < 0 && !ctx.exiting) {
        game.changed = order[game.round % order.length];
        game.kind = KINDS[game.round % KINDS.length];
        game.round++;
        change(game.changed, game.kind);
        ctx.setTally(`SOMETHING ON THE WALL CHANGED  ·  ${game.found}/${WANT}`);
      }
    }
    // a switch is instant; under reduced motion the lamp fades over a second instead
    const target = lampOn ? 1 : 0;
    lampLevel = ctx.reduced ? lampLevel + (target - lampLevel) * Math.min(1, dt * 3) : target;
    M.shade.emissiveIntensity = shadeGlow * lampLevel;
    M.bulb.emissiveIntensity = bulbGlow * lampLevel;
    M.shade.color.copy(shadeColor).multiplyScalar(0.55 + 0.45 * lampLevel);
    lamp.intensity = lampPower * lampLevel;
  }

  // put a changed photo back before the room is freed, so its own print is disposed with it
  function dispose() {
    if (game.changed >= 0) restore(game.changed);
    greyLines.dispose();
  }

  return {
    meta,
    group, lights, colliders, update, interact, dispose,
    bounds: { minX: -hx, maxX: hx, minZ: STAIR.z0 - 0.9, maxZ: hz },
    trigger, nearGoal, exitPath, exitLookAt: new THREE.Vector3(sx, topY + 1.1, zEnd - landD),
    fog: new THREE.FogExp2(0x030303, 0.045),
    background: 0x000000,
    exposure: 1.05,
    debug: { lamp, get lampLevel() { return lampLevel; }, get elapsed() { return elapsed; }, LAMP_PERIOD, LAMP_OFF_AT, game, pictureLight, pile: chinaPile, pileItems, stair: { x0: STAIR.x0, x1: STAIR.x1 } },
  };
}
