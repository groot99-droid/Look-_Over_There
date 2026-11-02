// Teal Room, Arched Door — The Mutation. "I closed my eyes for a second. The room is the
// same, but the door changed." The same teal, cream and brown, but narrower and wrong: a
// rounded cognac leather sofa along the left wall (you wake up beside it, low, and stand),
// a tall arched doorway right of centre, a tall spiky plant. From the log: patches of
// wallpaper peeled back show a glowing green grid; the room rebuilt itself while you slept
// and is still at it (it breathes, and things move when you are not looking); the humming
// gets louder. Get through the arch before it finishes.
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, sphere, createBuilder, cycle } from '../build.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { tealMaterials, plantTall } from './teal_common.js';

export const meta = {
  id: 'teal2',
  objective: 'GET THROUGH THE ARCH',
  arrive: 'GO THROUGH',
  start: { x: -0.55, z: 1.15, yaw: -0.62, pitch: 0.05 },
  riseFrom: 0.72, // eyes at cushion height: you wake up on the floor beside the sofa
  // this room's chapter: what script.js shows around the walk (see walk.js chapters())
  chapter: {
    id: 'D',
    room: 'Teal Room, Arched Door',
    epithet: 'The Mutation',
    audio: 'D.mp3',
    load: 'd.MP4',
    video: 'D.MP4',
    rot: '1.6deg',
    caption: 'I closed my eyes for a second. The room is the same, but the door changed. The architecture is breathing. It’s shifting when I don’t look directly at it.',
    stamp: 'SysTime: 88:88',
    log: 'I woke up but the room is wrong. I peeled back some of the wallpaper. It’s not wood or brick underneath; it’s a green, glowing grid. The room wasn’t just sitting here while I slept—it rebuilt itself. The humming is getting louder. I have to get through that arched doorway before it finishes.',
  },
};

const ROOM = { w: 3.8, d: 6.6, h: 2.6 }; // x: ±1.9, z: ±3.3
// The clip is a slow, low push toward the arch, the leaves stirring and the arch's edge
// alive. In the room: the arch keeps growing (and snaps back: the room is rebuilding itself)
// on an ARCH_PERIOD cycle, the plant sways, and as you wake you drift toward the arch.
const ARCH_PERIOD = 40, ARCH_GROW = 0.06, PUSH = 0.3, PUSH_T = 1.4;

// The back wall around an arched opening: two piers, and above the arch a slab whose
// underside is the semicircle, extruded to the wall's thickness.
function archWall(B, M, { x, z, w, h, rise, roomH, thick, roomW }) {
  const hxw = roomW / 2;
  const leftW = x - w / 2 + hxw, rightW = hxw - x - w / 2;
  B.add(box(leftW, roomH, thick), M.wall, place(-hxw + leftW / 2, roomH / 2, z - thick / 2));
  B.add(box(rightW, roomH, thick), M.wall, place(hxw - rightW / 2, roomH / 2, z - thick / 2));
  B.collider(-hxw + leftW / 2, z - thick / 2, leftW, thick);
  B.collider(hxw - rightW / 2, z - thick / 2, rightW, thick);
  const crown = rise + w / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, rise);
  shape.lineTo(-w / 2, roomH);
  shape.lineTo(w / 2, roomH);
  shape.lineTo(w / 2, rise);
  shape.absarc(0, rise, w / 2, 0, Math.PI, false);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 18 });
  // the slab over the arch is its own group so it can grow (one extra draw call)
  const AB = createBuilder();
  AB.add(geo, M.wall, place(x, 0, z - thick));
  const arch = AB.finish().group;
  B.object(arch);
  return { crown, arch };
}

export async function build({ quality, yieldFrame }) {
  const M = await tealMaterials({ quality, yieldFrame, variant: 'd' });
  const grid = T.wireGrid(quality.phone ? 256 : 512, { cells: 6 });
  M.grid = pbr(grid, { name: 'grid_glow', color: '#000000', roughness: 0.9, env: 0, emissive: '#ffffff', emissiveIntensity: 1.0, worldUV: false, castShadow: false });
  M.paper = pbr(null, { name: 'torn_paper', color: '#1f8a8c', roughness: 0.9, env: 0.2, side: THREE.DoubleSide, castShadow: false });
  M.paperBack = pbr(null, { name: 'torn_paper_back', color: '#e9dfc8', roughness: 0.95, env: 0.1, side: THREE.DoubleSide, castShadow: false });

  const B = createBuilder();
  const { w, d, h } = ROOM;
  const hx = w / 2, hz = d / 2, TH = 0.12;

  // --- shell (its own builder so it can breathe) ------------------------------------------
  const shellB = createBuilder();
  shellB.add(box(w + 2 * TH, TH, d + 2 * TH), M.carpet, place(0, -TH / 2, 0));
  shellB.add(box(w + 2 * TH, TH, d + 2 * TH), M.ceiling, place(0, h + TH / 2, 0));
  shellB.add(box(TH, h, d + 2 * TH), M.wall, place(-hx - TH / 2, h / 2, 0));
  shellB.add(box(TH, h, d + 2 * TH), M.wall, place(hx + TH / 2, h / 2, 0));
  shellB.add(box(w, h, TH), M.wall, place(0, h / 2, hz + TH / 2));
  const AX = 0.8, AW = 0.9, ARISE = 1.55;
  const { arch } = archWall(shellB, M, { x: AX, z: -hz, w: AW, h, rise: ARISE, roomH: h, thick: TH, roomW: w });
  for (const c of shellB.colliders) B.colliders.push(c);
  // the black corridor beyond the arch: walkable, and nothing in it
  const VD = 1.6;
  B.add(box(AW + 2 * TH, h, VD + TH), M.void, place(AX, h / 2, -hz - TH - VD / 2));
  B.collider(AX - AW / 2 - TH / 2, -hz - VD / 2, TH, VD + 0.4);
  B.collider(AX + AW / 2 + TH / 2, -hz - VD / 2, TH, VD + 0.4);

  // --- the rounded cognac sofa along the left wall ---------------------------------------
  const SX = -hx + 0.55, SZ = 0.1;
  const rb = (bw, bh, bd, r = 0.09) => new RoundedBoxGeometry(bw, bh, bd, 3, r);
  B.add(rb(0.95, 0.42, 2.2, 0.1), M.leather, place(SX, 0.25, SZ));                 // base (along z)
  for (const dz of [-0.72, 0, 0.72]) B.add(rb(0.78, 0.18, 0.7, 0.07), M.leather, place(SX + 0.06, 0.55, SZ + dz));
  B.add(rb(0.26, 0.62, 2.2, 0.1), M.leather, place(SX - 0.36, 0.72, SZ));           // back against the wall
  for (const dz of [-0.72, 0, 0.72]) B.add(rb(0.2, 0.42, 0.68, 0.08), M.leather, place(SX - 0.28, 0.82, SZ + dz)); // back cushions
  B.add(rb(0.95, 0.3, 0.26, 0.12), M.leather, place(SX, 0.6, SZ - 1.22));           // arms
  B.add(rb(0.95, 0.3, 0.26, 0.12), M.leather, place(SX, 0.6, SZ + 1.22));
  for (const [dx, dz] of [[-0.35, -1.0], [0.35, -1.0], [-0.35, 1.0], [0.35, 1.0]]) B.add(box(0.08, 0.1, 0.08), M.foot, place(SX + dx, 0.05, SZ + dz));
  B.collider(SX, SZ, 1.1, 2.7);

  // the tall plant right of the arch
  const leaves = plantTall(B, M, hx - 0.45, -hz + 0.55);

  // flush dome light
  B.add(sphere(0.17, 20, 10), M.domeLight, place(0, h + 0.03, -0.6));
  B.add(cyl(0.2, 0.2, 0.02, 20), M.trim, place(0, h - 0.01, -0.6));

  // --- peeled wallpaper: the glowing grid underneath ----------------------------------------
  const patches = [];
  function patch(x, y, z, ry, pw, ph) {
    const m = M.grid;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), m);
    plane.applyMatrix4(place(x, y, z, ry));
    plane.castShadow = false;
    plane.userData.along = Math.abs(Math.sin(ry)) > 0.5 ? 'z' : 'x'; // the wall's tangent
    B.object(plane);
    // curled paper along two torn edges
    B.add(box(pw * 0.9, 0.06, 0.03), M.paperBack, place(0, ph / 2 + 0.02, 0.02, 0, -0.9).premultiply(place(x, y, z, ry)));
    B.add(box(0.06, ph * 0.85, 0.03), M.paperBack, place(pw / 2 + 0.02, 0, 0.02, 0, 0, 0.8).premultiply(place(x, y, z, ry)));
    B.add(box(pw * 0.7, 0.05, 0.02), M.paper, place(-pw * 0.1, -ph / 2 - 0.02, 0.015, 0, 0.7).premultiply(place(x, y, z, ry)));
    patches.push(plane);
    return plane;
  }
  patch(hx - 0.007, 1.45, -0.6, -Math.PI / 2, 1.1, 0.85);            // right wall
  patch(-0.55, 1.5, -hz + 0.007, 0, 0.8, 0.6);                      // back wall, left of the arch
  patch(-hx + 0.007, 1.65, -2.3, Math.PI / 2, 0.7, 1.05);            // left wall, past the sofa
  patch(0.9, 1.3, hz - 0.007, Math.PI, 0.6, 0.5);                   // front wall (behind you as you wake)

  const { group, colliders } = B.finish();
  const shell = shellB.finish().group;
  group.add(shell);

  // --- lights ------------------------------------------------------------------------------
  const lights = new THREE.Group();
  lights.add(new THREE.HemisphereLight(0xfff0d8, 0x14504e, 0.6));
  const ceilingLight = new THREE.PointLight(0xffe2bd, 22, 10, 2);
  ceilingLight.position.set(0, h - 0.3, -0.6);
  ceilingLight.castShadow = quality.shadows;
  ceilingLight.shadow.mapSize.set(quality.shadowMap / 2, quality.shadowMap / 2);
  ceilingLight.shadow.bias = -0.004;
  ceilingLight.shadow.normalBias = 0.02;
  lights.add(ceilingLight);
  const gridLight = new THREE.PointLight(0x39ff6a, 1.2, 4.5, 2);
  gridLight.position.set(hx - 0.5, 1.45, -0.6);
  lights.add(gridLight);
  const archLight = new THREE.PointLight(0x203a3a, 0.4, 3, 2);
  archLight.position.set(AX, 1.5, -hz + 0.4);
  lights.add(archLight);

  // --- the goal: through the arch ------------------------------------------------------
  const trigger = { minX: AX - AW / 2, maxX: AX + AW / 2, minZ: -hz - 0.6, maxZ: -hz + 0.05 };
  const nearGoal = { minX: AX - 1.2, maxX: AX + 1.2, minZ: -hz - 0.6, maxZ: -hz + 1.6 };
  const exitPath = [
    new THREE.Vector3(AX, 1.62, -hz - 0.4),
    new THREE.Vector3(AX, 1.62, -hz - 1.3),
  ];

  // --- the room is still being rebuilt ---------------------------------------------------
  let elapsed = 0;
  let sysT = 0;
  const shifty = [];               // things that move when you are not looking
  const plantObj = { home: new THREE.Vector3(hx - 0.45, 0, -hz + 0.55) };
  const fwd = new THREE.Vector3(), to = new THREE.Vector3();
  const flick = ['SysTime: 88:88', 'SysTime: 8 :88', 'SysTime: 88:8 ', 'SysTime: --:--', 'SysTime: 88:88', 'SysTime: 88:88'];
  function update(p, dt, camera, ctx) {
    if (dt === undefined) return;
    elapsed += dt;
    // waking up: the slow low push of the clip, toward the arch
    if (elapsed < PUSH_T && !ctx.reduced) {
      const dx = AX - p.x, dz = -hz - p.z, l = Math.hypot(dx, dz) || 1;
      const step = (PUSH / PUSH_T) * dt;
      p.x += dx / l * step; p.z += dz / l * step;
    }
    // the arch grows a little more every moment, and snaps back: the room is still being built
    if (!ctx.reduced) arch.scale.y = 1 + ARCH_GROW * cycle(elapsed, ARCH_PERIOD);
    // the plant stirs: three leaf clusters on slow sines, each with its own phase
    for (const g of leaves) {
      const ph = g.userData.phase;
      g.rotation.z = Math.sin(elapsed * 0.7 + ph) * 0.035;
      g.rotation.x = Math.sin(elapsed * 0.5 + ph * 1.7) * 0.03;
    }
    // the grid pulses, brighter as time runs out
    const pulse = 0.75 + 0.35 * Math.sin(elapsed * 4.2) + Math.min(0.8, elapsed / 50);
    M.grid.emissiveIntensity = pulse;
    gridLight.intensity = 0.6 + pulse * 1.1;
    // the hum: rises with time and as the arch gets closer
    const near = Math.max(0, 1 - Math.hypot(p.x - AX, p.z + hz) / 6);
    ctx.sound.hum(Math.min(1, 0.2 + elapsed / 70 + near * 0.45));
    // the shell breathes (only the walls: colliders stay put, the breath is 1.5 cm)
    if (!ctx.reduced) {
      shell.scale.x = 1 + Math.sin(elapsed * 0.8) * 0.008;
      shell.scale.z = 1 + Math.sin(elapsed * 0.6 + 1.3) * 0.006;
      shell.position.y = Math.sin(elapsed * 0.9) * 0.01;
    }
    // wallpaper patches out of view drift a few centimetres: the room shifts when unseen
    if (!ctx.reduced) {
      camera.getWorldDirection(fwd);
      for (const pl of patches) {
        to.copy(pl.position).sub(camera.position).normalize();
        if (to.dot(fwd) < 0.2 && Math.random() < dt * 0.9) {
          pl.position[pl.userData.along] += (Math.random() - 0.5) * 0.06;
          pl.position.y += (Math.random() - 0.5) * 0.06;
        }
      }
    }
    sysT += dt;
    if (sysT > 0.35) {
      sysT = 0;
      ctx.setReadout(flick[Math.floor(Math.random() * flick.length)]);
    }
  }

  return {
    meta, group, lights, colliders, update,
    bounds: { minX: -hx, maxX: hx, minZ: -hz - VD + 0.3, maxZ: hz },
    trigger, nearGoal, exitPath, exitLookAt: new THREE.Vector3(AX, 1.45, -hz - 8),
    exitDuration: 1.8, exitFadeStart: 0.25,
    fog: new THREE.FogExp2(0x03100f, 0.03),
    background: 0x000000,
    exposure: 1.0,
    debug: { patches, shell, grid: M.grid, arch, leaves, ARCH_PERIOD },
  };
}
