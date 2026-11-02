// Teal Room, Square Door — The Glitch. The room video: an empty clean teal box with a
// cream ceiling, a coarse brown flecked carpet, an orange angular leather sofa against the
// back wall left of centre, a plain rectangular doorway right of centre that is pitch black,
// and a small blocky plant in the corner. From the log: a watch whose second hand ticks
// backward, a fake window whose sun never moves, and the decision to close your eyes on the
// orange couch, "just for a minute". The goal is the couch; the next loading clip is the
// sleeper on it.
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, sphere, createBuilder, cycle } from '../build.js';
import { tealMaterials, plantSmall, voidDoor } from './teal_common.js';

export const meta = {
  id: 'teal',
  objective: 'FIND SOMEWHERE TO REST',
  arrive: 'CLOSE YOUR EYES',
  start: { x: 0.35, z: 2.7, yaw: 0.02 },
  // this room's chapter: what script.js shows around the walk (see walk.js chapters())
  chapter: {
    id: 'C',
    room: 'Teal Room, Square Door',
    epithet: 'The Glitch',
    audio: 'C.mp3',
    load: 'c.MP4',
    video: 'C.mp4',
    rot: '-0.8deg',
    caption: 'Found a place to rest, but it doesn’t feel real. The air is entirely still. There’s no dust. That doorway... it doesn’t reflect any light. It just swallows it.',
    stamp: '27:81',
    log: 'Found a teal room. The time on my watch doesn’t make sense anymore. The second hand is ticking backward, but the sun outside the fake window never moves. I found an orange couch. I’m going to close my eyes. Just for a minute.',
  },
};

const ROOM = { w: 5.2, d: 7.4, h: 2.5 }; // x: ±2.6, z: ±3.7
// The room video is still until its last second, when the black of the doorway lifts to a
// dark charcoal and settles again. Stretched to the walk: every DOOR_PERIOD seconds.
const DOOR_PERIOD = 24, DOOR_AT = 0.85, DOOR_LIFT = 0.6, DOOR_HOLD = 1.6;

// The clip's sofa is an angular shell: an elongated octagon in side view (the base and the
// arms are one chamfered piece), with three seat cushions and a low back. Built as an
// extruded profile along x, then the cushions as boxes.
function angularSofa(B, M, x, z, { w = 2.3, d = 0.9, h = 0.78 } = {}) {
  const shape = new THREE.Shape();
  const hw = w / 2, c = 0.22;             // chamfer
  shape.moveTo(-hw + c, 0.1);
  shape.lineTo(hw - c, 0.1);
  shape.lineTo(hw, 0.1 + c);
  shape.lineTo(hw, h - c);
  shape.lineTo(hw - c, h);
  shape.lineTo(hw - 0.3, h);
  shape.lineTo(hw - 0.3, 0.48);           // the seat well between the arms
  shape.lineTo(-hw + 0.3, 0.48);
  shape.lineTo(-hw + 0.3, h);
  shape.lineTo(-hw + c, h);
  shape.lineTo(-hw, h - c);
  shape.lineTo(-hw, 0.1 + c);
  shape.closePath();
  const shell = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  B.add(shell, M.leather, place(x, 0, z + d / 2));
  // the back: the same chamfered thickness along the rear of the well
  B.add(box(w - 0.6, 0.5, 0.2), M.leather, place(x, 0.73, z - d / 2 + 0.12));
  for (const dx of [-0.66, 0, 0.66]) B.add(box(0.62, 0.12, d - 0.34), M.leather, place(x + dx, 0.47, z + 0.08));
  for (const [dx, dz] of [[-0.9, -0.3], [0.9, -0.3], [-0.9, 0.3], [0.9, 0.3]]) B.add(box(0.07, 0.1, 0.07), M.foot, place(x + dx, 0.05, z + dz));
}

export async function build({ quality, yieldFrame }) {
  const M = await tealMaterials({ quality, yieldFrame, variant: 'c' });
  const win = T.fakeWindow(quality.phone ? 256 : 512);
  M.window = pbr(win, { name: 'fake_window', color: '#ffffff', roughness: 0.9, env: 0, emissive: '#ffffff', emissiveIntensity: 1.35, worldUV: false, castShadow: false });
  M.glass = pbr(null, { name: 'window_glass', color: '#dfeeff', roughness: 0.05, env: 1.2, transparent: true, opacity: 0.12, castShadow: false });

  const B = createBuilder();
  const { w, d, h } = ROOM;
  const hx = w / 2, hz = d / 2, TH = 0.12;

  // --- shell -----------------------------------------------------------------------
  B.add(box(w + 2 * TH, TH, d + 2 * TH), M.carpet, place(0, -TH / 2, 0));
  B.add(box(w + 2 * TH, TH, d + 2 * TH), M.ceiling, place(0, h + TH / 2, 0));
  B.add(box(TH, h, d + 2 * TH), M.wall, place(hx + TH / 2, h / 2, 0));       // right
  B.add(box(w, h, TH), M.wall, place(0, h / 2, hz + TH / 2));                 // front (behind the player)
  // left wall with the fake window
  const WZ = 0.2, WW = 1.5, WH = 1.05, WY = 1.5;
  const segA = (WZ - WW / 2) - (-hz - TH), segB = (hz + TH) - (WZ + WW / 2);
  B.add(box(TH, h, segA), M.wall, place(-hx - TH / 2, h / 2, -hz - TH + segA / 2));
  B.add(box(TH, h, segB), M.wall, place(-hx - TH / 2, h / 2, WZ + WW / 2 + segB / 2));
  B.add(box(TH, WY - WH / 2, WW), M.wall, place(-hx - TH / 2, (WY - WH / 2) / 2, WZ));
  B.add(box(TH, h - (WY + WH / 2), WW), M.wall, place(-hx - TH / 2, WY + WH / 2 + (h - WY - WH / 2) / 2, WZ));
  // back wall with the square doorway right of centre
  const DX = 1.35, DW = 0.95, DH = 2.05;
  const leftW = DX - DW / 2 + hx, rightW = hx - DX - DW / 2;
  B.add(box(leftW, h, TH), M.wall, place(-hx + leftW / 2, h / 2, -hz - TH / 2));
  B.add(box(rightW, h, TH), M.wall, place(hx - rightW / 2, h / 2, -hz - TH / 2));
  B.add(box(DW, h - DH, TH), M.wall, place(DX, DH + (h - DH) / 2, -hz - TH / 2));
  B.collider(-hx + leftW / 2, -hz - TH / 2, leftW, TH);
  B.collider(hx - rightW / 2, -hz - TH / 2, rightW, TH);
  voidDoor(B, M, { x: DX, z: -hz, w: DW, h: DH, depth: 0.7, facing: 1 });

  // the fake window: a shallow recess, a painted sky, a pane of glass and a cream sill
  B.add(box(0.1, WH + 0.12, WW + 0.12), M.trim, place(-hx + 0.05, WY, WZ));
  B.add(box(0.06, WH, WW), M.void, place(-hx + 0.07, WY, WZ));
  B.mesh(new THREE.PlaneGeometry(WW - 0.08, WH - 0.08), M.window, place(-hx + 0.105, WY, WZ, Math.PI / 2));
  B.add(box(0.02, WH - 0.06, 0.03), M.trim, place(-hx + 0.11, WY, WZ));            // mullion
  B.add(box(0.02, 0.03, WW - 0.06), M.trim, place(-hx + 0.11, WY, WZ));            // transom
  B.mesh(new THREE.PlaneGeometry(WW - 0.08, WH - 0.08), M.glass, place(-hx + 0.125, WY, WZ, Math.PI / 2));
  B.add(box(0.16, 0.03, WW + 0.2), M.trim, place(-hx + 0.08, WY - WH / 2 - 0.05, WZ));

  // --- the orange angular sofa ------------------------------------------------------
  const SX = -0.9, SZ = -hz + 0.5;
  angularSofa(B, M, SX, SZ);
  B.collider(SX, SZ, 2.6, 1.0);

  // the plant in the corner, right of the doorway
  plantSmall(B, M, hx - 0.4, -hz + 0.4);

  // flush dome light
  B.add(sphere(0.19, 20, 10), M.domeLight, place(0, h + 0.03, -0.4));
  B.add(cyl(0.22, 0.22, 0.02, 20), M.trim, place(0, h - 0.01, -0.4));

  const { group, colliders } = B.finish();

  // --- lights ----------------------------------------------------------------------------
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xfff6e6, 0x1c5a58, 0.95));
  const ceilingLight = new THREE.PointLight(0xffefd8, 30, 12, 2);
  ceilingLight.position.set(0, h - 0.3, -0.4);
  ceilingLight.castShadow = quality.shadows;
  ceilingLight.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  ceilingLight.shadow.bias = -0.004;
  ceilingLight.shadow.normalBias = 0.02;
  lights.add(ceilingLight);
  // the window: a warm, low, unmoving sun across the carpet
  const sun = new THREE.SpotLight(0xffe2b0, 9, 10, 0.6, 0.6, 1.5);
  sun.position.set(-hx + 0.2, WY + 0.2, WZ);
  sun.target.position.set(0.8, 0, WZ + 0.6);
  lights.add(sun);
  lights.add(sun.target);
  // the doorway: nothing comes out of it, except when the dark lifts
  const fill = new THREE.PointLight(0x9fb8c0, 0, 5, 2);
  fill.position.set(DX, 1.2, -hz + 0.5);
  lights.add(fill);

  // --- the goal: the couch --------------------------------------------------------------
  const trigger = { minX: SX - 1.0, maxX: SX + 1.0, minZ: SZ + 0.5, maxZ: SZ + 0.95 };
  const nearGoal = { minX: SX - 1.6, maxX: SX + 1.6, minZ: SZ, maxZ: SZ + 2.0 };
  const exitPath = [
    new THREE.Vector3(SX + 0.2, 1.2, SZ + 0.55),
    new THREE.Vector3(SX + 0.4, 0.72, SZ + 0.1),
    new THREE.Vector3(SX + 0.5, 0.62, SZ + 0.05),
  ];

  // the watch on the HUD: it runs backward, and its seconds make no sense
  let watchT = 0, mm = 27, ss = 81;
  let elapsed = 0, still = 0, doorLift = 0;
  const lifted = new THREE.Color('#141b1b');
  function update(p, dt, camera, ctx) {
    if (dt === undefined) return;
    elapsed += dt;
    watchT += dt;
    if (watchT >= 1) {
      watchT -= 1;
      ss -= 1;
      if (ss < 0) { ss = 99; mm -= 1; if (mm < 0) mm = 27; }
      ctx.setReadout(`WATCH  ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
    }
    // the dark in the doorway lifts for a moment, as at the end of the clip, then swallows again
    const ph = (cycle(elapsed, DOOR_PERIOD) - DOOR_AT) * DOOR_PERIOD; // seconds since the lift began
    let k = 0;
    if (ph >= 0 && ph < DOOR_LIFT) k = ph / DOOR_LIFT;
    else if (ph >= DOOR_LIFT && ph < DOOR_LIFT + DOOR_HOLD) k = 1;
    else if (ph >= DOOR_LIFT + DOOR_HOLD && ph < DOOR_LIFT * 2 + DOOR_HOLD) k = 1 - (ph - DOOR_LIFT - DOOR_HOLD) / DOOR_LIFT;
    doorLift = k * k * (3 - 2 * k);
    M.voidFace.color.copy(lifted).multiplyScalar(doorLift);
    fill.intensity = doorLift * 0.9;
    // the clip's camera drifts, slowly: when you stand still, so does your eye (not under reduced motion)
    still = ctx.controls.isMoving() ? 0 : still + dt;
    if (!ctx.reduced) ctx.controls.setEyeOffset(still > 3 ? Math.sin((still - 3) * 0.45) * 0.012 * Math.min(1, (still - 3) / 2) : 0);
  }

  return {
    meta, group, lights, colliders, update,
    bounds: { minX: -hx, maxX: hx, minZ: -hz, maxZ: hz },
    trigger, nearGoal, exitPath, exitLookAt: new THREE.Vector3(SX + 0.5, h, SZ - 0.3),
    exitDuration: 3.0, exitFadeStart: 0.5, exitTurn: 0.9,
    fog: new THREE.FogExp2(0x041a1a, 0.02),
    background: 0x000000,
    exposure: 1.05,
    debug: { voidFace: M.voidFace, get doorLift() { return doorLift; }, DOOR_PERIOD, DOOR_AT },
  };
}
