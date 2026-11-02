// Doorways in a room's shell (rec.doors, written by tools/build_rooms.py
// door()). room.js cuts the opening out of the wall; this file builds what
// fills it -- a frame and a leaf that opens and closes -- and the invisible
// body that blocks the opening while it is shut.
//
// A doorway is the only way between two rooms of the continuous building
// (src/world/world.js): a threshold's exit door opens when the choice is
// committed, the player walks through into a connector, and the door seals
// behind him. Kinds:
//   door      one hinged leaf (company property: low-poly, C1). `jib: true`
//             is a flush service door instead: no frame, kick panel or
//             handles, the leaf in the wall's own material (`mat`, else the
//             room's wall) flush with the room face, carrying the room's
//             skirt across it; only its hairline gaps give it away (S3 C)
//   glass     two hinged leaves of photoreal glass in a dark frame (lobby);
//             `glass` names the pane's slot ('glass', 'glass_dark',
//             'glass_clear' for a pane seen through)
//   curtain   heavy velvet that parts to both sides (S3): a photoreal `mat`
//             ('velvet') hangs two smooth pleated halves that sway a little
//             (`sway`, metres, default 0.014; 0 holds them still); a
//             low-poly one ('lp_curtain', the default) stepped box folds
//   shutter   a roll-up slab that lifts into the lintel (garage, ramp)
//   slide     two panels that slide apart (the freight cab)
//   open      a bare opening, nothing to close
//
// Door-local frame: origin at the opening's centre on the wall's centre
// plane, at the sill; +x along the wall, -z outward (out of the room), +z
// into the room. Leaves swing into the room unless `swing: 'out'`.

import * as THREE from '../../vendor/three/three.module.js';
import { applyWorldUV } from './materials.js';

function boxMesh(mats, slot, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.get(slot));
  m.position.set(x, y, z);
  m.castShadow = !mats.isGlow(slot);
  m.receiveShadow = true;
  return m;
}

const EASE = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// A pleated drop of cloth from x0 to x1 (door-local x) and y0 to y1, its
// folds `amp` deep about `z0`: the smooth velvet halves of a curtain doorway
// (the same fold profile as props.js velvetdrape, so the two hang alike).
// UVs run in metres from the opening's centre (one texture repeat per
// 1.2 m), so both halves share one nap.
function pleat(mat, x0, x1, y0, y1, amp, z0, originX) {
  const fold = 0.22;
  const pw = Math.abs(x1 - x0), ph = y1 - y0;
  const segX = Math.max(8, Math.round(pw / fold * 6));
  const geo = new THREE.PlaneGeometry(pw, ph, segX, 8);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  const cx = (x0 + x1) / 2;
  for (let i = 0; i < p.count; i++) {
    const lx = p.getX(i) + cx;
    const v = (p.getY(i) + ph / 2) / ph; // 0 hem .. 1 top
    const k = 0.8 + 0.2 * (1 - v);
    const gx = lx + originX; // across the whole opening
    p.setZ(i, z0 + amp * k * (1 + Math.sin(gx / fold * Math.PI * 2 + 0.6 * Math.sin(gx * 1.7))));
    uv.setXY(i, gx / 1.2, (p.getY(i) + ph / 2 + y0) / 1.2);
  }
  geo.translate(cx, (y0 + y1) / 2, 0);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Builds one doorway. `wallT` is the wall depth; `wallMat` and `skirt` are
// the room's wall slot and skirt band (a jib door is dressed in them).
// Returns the door controller.
export function buildDoor(mats, spec, { wallT = 0.3, wallMat = null, skirt = null } = {}) {
  const kind = spec.kind || 'door';
  const w = spec.w || 1.2, h = spec.h || 2.2;
  const frameMat = spec.frame || 'lp_dark';
  const group = new THREE.Group();
  group.name = `door:${spec.name}`;
  const depth = wallT + 0.04;
  const swingSign = spec.swing === 'out' ? -1 : 1; // +1: into the room (+z)
  const jib = kind === 'door' && !!spec.jib;
  const jibMeshes = []; // [mesh, tile]: given room-space UVs once placed (alignToWall)
  const leaves = [];
  let animate = () => {};
  let sway = null; // the velvet halves' nap stirring (update)

  if (kind !== 'open' && kind !== 'curtain' && !jib) {
    // jambs + head, proud of both faces
    group.add(boxMesh(mats, frameMat, 0.08, h + 0.08, depth, -w / 2 - 0.04, (h + 0.08) / 2, 0));
    group.add(boxMesh(mats, frameMat, 0.08, h + 0.08, depth, w / 2 + 0.04, (h + 0.08) / 2, 0));
    group.add(boxMesh(mats, frameMat, w + 0.16, 0.08, depth, 0, h + 0.04, 0));
  }

  if (kind === 'door' && jib) {
    // Flush in the wall: the leaf's room face 1 mm behind the wall's inner
    // face (+z), hung from that face when it swings in and from its back
    // when it swings out, so it never sweeps through the jamb. Hairline
    // gaps (6 mm a side, 4 mm over) are all that shows it is a door.
    const hingeX = spec.hinge === 'R' ? w / 2 : -w / 2;
    const dir = spec.hinge === 'R' ? -1 : 1;
    const T = 0.05, face = wallT / 2 - 0.001;
    const pivot = new THREE.Group();
    pivot.position.set(hingeX + dir * 0.006, 0, swingSign > 0 ? face : face - T);
    const lw = w - 0.012, lh = h - 0.006;
    const leafMat = spec.mat || wallMat || 'plaster';
    const lz = swingSign > 0 ? -T / 2 : T / 2;
    const leaf = boxMesh(mats, leafMat, lw, lh, T, dir * (lw / 2), 0.002 + lh / 2, lz);
    pivot.add(leaf);
    jibMeshes.push([leaf, 'wall']);
    if (skirt && (skirt.h || 0.9) < lh) {
      // the room's skirt carried across the leaf, standing as proud as on the wall
      const st = skirt.t || 0.03, sh = skirt.h || 0.9;
      const band = boxMesh(mats, skirt.mat || 'plaster_dark', lw, sh - 0.002, st, dir * (lw / 2), 0.002 + (sh - 0.002) / 2, lz + T / 2 + st / 2);
      band.castShadow = false;
      pivot.add(band);
      jibMeshes.push([band, skirt.tile || 'wall']);
    }
    group.add(pivot);
    leaves.push(pivot);
    animate = (u) => { pivot.rotation.y = -dir * swingSign * EASE(u) * (spec.angle || 95) * Math.PI / 180; };
  } else if (kind === 'door') {
    const hingeX = spec.hinge === 'R' ? w / 2 : -w / 2;
    const dir = spec.hinge === 'R' ? -1 : 1; // leaf extends from the hinge toward the other jamb
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, swingSign * (wallT / 2 - 0.04));
    const leafMat = spec.mat || 'lp_beige';
    const leaf = boxMesh(mats, leafMat, w - 0.02, h - 0.02, 0.05, dir * (w / 2), h / 2, 0);
    pivot.add(leaf);
    // panels stand 2 cm proud of each face: the low-poly vertex snap moves
    // corners on screen but not in depth, and a thinner panel loses
    // triangles to the leaf at an angle
    if (spec.panel) pivot.add(boxMesh(mats, spec.panel, w * 0.45, h * 0.32, 0.09, dir * (w / 2), h * 0.66, 0));
    pivot.add(boxMesh(mats, 'lp_dark', w - 0.24, h * 0.36, 0.09, dir * (w / 2), h * 0.25, 0)); // kick panel
    for (const s of [-1, 1]) pivot.add(boxMesh(mats, 'lp_brass', 0.04, 0.04, 0.12, dir * (w - 0.12), h * 0.47, s * 0.05)); // handles both faces
    group.add(pivot);
    leaves.push(pivot);
    animate = (u) => { pivot.rotation.y = -dir * swingSign * EASE(u) * (spec.angle || 95) * Math.PI / 180; };
  } else if (kind === 'glass') {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * w / 2, 0, swingSign * 0.02);
      const lw = w / 2 - 0.02;
      const cx = -s * lw / 2;
      pivot.add(boxMesh(mats, 'lp_dark', 0.06, h, 0.06, -s * 0.03, h / 2, 0)); // hinge stile
      pivot.add(boxMesh(mats, 'lp_dark', 0.06, h, 0.06, -s * (lw - 0.03), h / 2, 0)); // lock stile
      pivot.add(boxMesh(mats, 'lp_dark', lw, 0.1, 0.06, cx, 0.05, 0));
      pivot.add(boxMesh(mats, 'lp_dark', lw, 0.08, 0.06, cx, h - 0.04, 0));
      pivot.add(boxMesh(mats, spec.glass || 'glass', lw - 0.08, h - 0.2, 0.02, cx, h / 2, 0));
      for (const f of [-1, 1]) pivot.add(boxMesh(mats, 'lp_brass', lw * 0.6, 0.04, 0.05, cx, 1.0, f * 0.06)); // push bars
      group.add(pivot);
      leaves.push(pivot);
    }
    animate = (u) => {
      const a = EASE(u) * (spec.angle || 80) * Math.PI / 180;
      leaves[0].rotation.y = -swingSign * a; // left leaf reaches +x from its hinge
      leaves[1].rotation.y = swingSign * a;
    };
  } else if (kind === 'curtain') {
    const folds = Math.max(4, Math.round(w / 0.22));
    const halves = [];
    const cm = spec.mat || 'lp_curtain';
    const smooth = !mats.isLowPoly(cm) && !mats.isGlow(cm); // the building's velvet (C1): cloth, not boxes
    const swayParts = [];
    for (const s of [-1, 1]) {
      const half = new THREE.Group();
      half.position.set(s * w / 2, 0, wallT / 2 + 0.03);
      if (smooth) {
        // from 6 cm behind the jamb to 4 cm past the middle, so the halves
        // meet with an overlap (the right one a hair in front, or the two
        // would fight over the same pixels there). The fold troughs sit 2.4
        // and 1.8 cm proud of the wall face, clear of the plaster past the
        // jambs and over the lintel (the sway only ever brings them
        // forward), and about 3 cm behind the plane a velvetdrape round the
        // doorway hangs in (the same folds: where it overlaps the jamb ends
        // it covers them instead of flickering through them)
        const m = pleat(mats.get(cm), s * 0.06, -s * (w / 2 + 0.04), 0, h + 0.2, 0.06, s > 0 ? -0.006 : -0.012, s * w / 2);
        half.add(m);
        const pa = m.geometry.attributes.position;
        swayParts.push({ m, base: Float32Array.from(pa.array), ph: h + 0.2, x0: s * w / 2 });
      } else {
        for (let i = 0; i < folds / 2; i++) {
          const fx = -s * (i + 0.5) * (w / folds);
          const m = boxMesh(mats, cm, w / folds + 0.02, h + 0.2, 0.08 + (i % 2) * 0.05, fx, (h + 0.2) / 2, (i % 2) * 0.03);
          half.add(m);
        }
      }
      group.add(half);
      halves.push(half);
    }
    const amp = spec.sway === undefined ? 0.014 : spec.sway;
    if (smooth && amp > 0) {
      // it moves slightly though there is no air (Doc 1 S3): the hem more
      // than the top, two slow waves across the cloth, and only ever out
      // from where it hangs, never back into the wall
      let t = 0;
      sway = (dt) => {
        t += dt;
        for (const sp of swayParts) {
          const pa = sp.m.geometry.attributes.position, a = pa.array, b = sp.base;
          for (let i = 0; i < pa.count; i++) {
            const v = Math.min(1, Math.max(0, b[i * 3 + 1] / sp.ph));
            const fall = (1 - v) * Math.sqrt(1 - v);
            const x = b[i * 3] + sp.x0;
            const wave = Math.sin(t * 0.83 + x * 1.9) * 0.7 + Math.sin(t * 0.37 - x * 0.7) * 0.3;
            a[i * 3 + 2] = b[i * 3 + 2] + amp * fall * (0.5 + 0.5 * wave);
          }
          pa.needsUpdate = true;
        }
      };
    }
    group.add(boxMesh(mats, 'lp_brass', w + 0.4, 0.05, 0.05, 0, h + 0.25, 0.18)); // rod
    animate = (u) => {
      const k = 1 - 0.72 * EASE(u);
      for (const half of halves) half.scale.x = k;
    };
    leaves.push(...halves);
  } else if (kind === 'shutter') {
    const slab = new THREE.Group();
    for (let i = 0; i < Math.ceil(h / 0.12); i++) slab.add(boxMesh(mats, spec.mat || 'lp_grey', w, 0.11, 0.04, 0, 0.06 + i * 0.12, 0));
    slab.position.z = swingSign * (wallT / 2 - 0.05);
    group.add(slab);
    leaves.push(slab);
    animate = (u) => { const e = EASE(u); slab.position.y = e * (h - 0.15); slab.scale.y = 1 - 0.92 * e; };
  } else if (kind === 'slide') {
    const panels = [];
    for (const s of [-1, 1]) {
      const p = new THREE.Group();
      p.add(boxMesh(mats, spec.mat || 'lp_rust', w / 2, h, 0.05, 0, h / 2, 0));
      for (let i = 0; i < 4; i++) p.add(boxMesh(mats, 'lp_dark', w / 2 - 0.04, 0.03, 0.06, 0, 0.3 + i * (h - 0.6) / 3, 0));
      p.position.set(s * w / 4, 0, swingSign * (wallT / 2 - 0.05));
      group.add(p);
      panels.push(p);
    }
    animate = (u) => { const e = EASE(u); panels[0].position.x = -w / 4 - e * (w / 2 - 0.05); panels[1].position.x = w / 4 + e * (w / 2 - 0.05); };
    leaves.push(...panels);
  }

  // The body that blocks the opening while shut.
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallT), mats.get('lp_dark'));
  body.position.set(0, h / 2, 0);
  body.visible = false;
  body.userData.collide = true;
  body.userData.doorBody = spec.name;
  group.add(body);

  // A shut opaque leaf is a little smaller than its opening, and a low sun
  // drew bright lines through the gaps across the shade: while shut, an
  // unseen plug the size of the opening casts the shadow.
  let plug = null;
  if (kind === 'door' || kind === 'shutter' || kind === 'slide') {
    plug = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, h + 0.02, 0.02), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    plug.material.userData.owned = true;
    plug.position.set(0, (h + 0.02) / 2, 0);
    plug.castShadow = true;
    plug.receiveShadow = false;
    group.add(plug);
  }

  // A jib leaf takes the wall's tiling in the room's frame, so its grain
  // runs on from the wall round it (called by room.js once the doorway is
  // placed; the leaf's shut pose, whatever it was built at).
  function alignToWall(tiles) {
    if (!jibMeshes.length) return;
    group.updateMatrix();
    const M = new THREE.Matrix4();
    const shut = new THREE.Matrix4();
    for (const [m, tile] of jibMeshes) {
      const pivot = m.parent;
      shut.makeTranslation(pivot.position.x, pivot.position.y, pivot.position.z);
      m.updateMatrix();
      M.multiplyMatrices(group.matrix, shut).multiply(m.matrix);
      const g = m.geometry.clone().applyMatrix4(M);
      applyWorldUV(g, typeof tile === 'number' ? tile : (tiles && tiles[tile]) || 2);
      m.geometry.setAttribute('uv', g.attributes.uv);
      g.dispose();
    }
  }

  let u = spec.open ? 1 : (spec.ajar || 0); // 0 shut .. 1 open (`ajar`: left a little open)
  let target = u;
  let speed = 1;
  let waiters = [];
  let rattleT = 0;
  let locked = !!spec.locked;
  animate(u);
  if (plug) plug.visible = u <= 0.01;

  function settle() {
    const ws = waiters; waiters = [];
    for (const r of ws) r();
  }

  return {
    name: spec.name,
    spec,
    group,
    body,
    kind,
    alignToWall,
    get locked() { return locked; },
    // blocking while not fully open (a half-open leaf still blocks the gap)
    blocks() { return kind !== 'open' && u < 0.85; },
    isOpen() { return u >= 0.999; },
    isShut() { return u <= 0.001; },
    progress() { return u; },
    // `to` < 1 swings it only that far (never back), and a door left
    // part-open stays locked: it still blocks (S4 H's ajar door, wider)
    open(seconds = 1.2, to = 1) {
      if (to >= 1) locked = false;
      target = Math.max(u, Math.min(1, to));
      speed = 1 / Math.max(0.05, seconds);
      if (u >= target) return Promise.resolve();
      return new Promise((r) => waiters.push(r));
    },
    close(seconds = 1.0, { lock = true } = {}) {
      target = 0;
      speed = 1 / Math.max(0.05, seconds);
      if (lock) locked = true;
      if (u <= 0) return Promise.resolve();
      return new Promise((r) => waiters.push(r));
    },
    lock() { locked = true; },
    unlock() { locked = false; },
    // a locked door that is tried shudders and holds
    rattle() { rattleT = 0.35; },
    update(dt) {
      if (sway) sway(dt);
      if (u !== target) {
        u = u < target ? Math.min(target, u + speed * dt) : Math.max(target, u - speed * dt);
        animate(u);
        if (plug) plug.visible = u <= 0.01;
        if (u === target) settle();
      }
      if (rattleT > 0) {
        rattleT = Math.max(0, rattleT - dt);
        const j = Math.sin(rattleT * 90) * 0.012 * (rattleT / 0.35);
        for (const l of leaves) {
          l.position.z += j - (l.userData.lastJ || 0);
          l.userData.lastJ = j;
        }
      }
    }
  };
}
