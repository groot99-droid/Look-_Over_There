// Piles of stuff, each found in one room only: tins pushed into the dead ends of the grocery
// maze, sodden boxes and paper in the flooded corridor, towers of good china in the dining room.
// A pile goes through the scene's builder, so it costs one draw call per material however many
// pieces it has, and its placement is seeded: it looks the same on every visit and in every test.
//
// Clean contact is the generators' job, not the room's. Every piece is measured from its own
// geometry (each part's vertices through its local matrix) and set down ON what is under it, the
// floor at `y` or the pieces put down before it: never inside it, and never below `y`, so in a
// mirrored room no piece crosses its own reflection. A pyramid's tins are spaced by their real
// width with the jitter held inside the gap, and each layer sits on the one below; a stack's piece
// rests on the one below it whatever its twist; a heap's piece settles on everything already
// there, tilted down the slope it lands on. Where two pieces touch, a top meets a bottom (faces
// turned toward each other, which the depth test never confuses), and a thin sheet, drawn from
// both sides, keeps 1.5 mm off whatever it lies on. Colliders are the AABB of what is drawn:
// pyramid() and heap() add one by default, stack() only with collide: true. Each returns what it
// drew (extents, `aabb`, `height`, `top`), so a room can place the next thing from it.
//
// An item is a list of parts, [[geometry, material, localMatrix | null], ...], drawn at the
// item's matrix. Only pyramid() holds items back: `hold` keeps that many off the middle of its
// top layer out of the merge and returns them in `held` as matrices, so the scene can draw them
// on their own and let them be taken while the pile and its collider stay where they are. The
// flooded photographs are not heap pieces either: heap() lays them on its crown (the carton put
// down last) through the crown's `lay`, with rest(), 1.5 mm over what is under each, before it
// draws, and returns their matrices in `laid` for the scene to draw on their own.
import * as THREE from 'three';
import { place } from './build.js';

// The same LCG as the grocery maze, so a seed means the same thing everywhere.
export function rng(seed) {
  let s = (seed | 0) || 1;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

// How far a thin sheet (paper, a photograph) keeps off what it lies on.
const CLEAR = 0.0015;

function addItem(B, item, m) {
  for (const [g, mat, local] of item) B.add(g, mat, local ? m.clone().multiply(local) : m);
}

// A transform in a pile's own frame: centred on (x, z), turned by ry.
function frame(x, z, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return (lx, ly, lz, ry2 = 0, rx = 0, rz = 0) => place(x + lx * c + lz * s, ly, z - lx * s + lz * c, ry + ry2, rx, rz);
}

const _v = new THREE.Vector3();

// An item in its own frame, from its vertices (every part through its local matrix): its
// bounds, and how far it reaches from its own vertical axis.
function measure(item) {
  const verts = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let radius = 0;
  for (const [g, , local] of item) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i);
      if (local) _v.applyMatrix4(local);
      verts.push(_v.x, _v.y, _v.z);
      min[0] = Math.min(min[0], _v.x); min[1] = Math.min(min[1], _v.y); min[2] = Math.min(min[2], _v.z);
      max[0] = Math.max(max[0], _v.x); max[1] = Math.max(max[1], _v.y); max[2] = Math.max(max[2], _v.z);
      radius = Math.max(radius, Math.hypot(_v.x, _v.z));
    }
  }
  return { verts, min, max, radius };
}

function emptyBox() {
  return { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
}

// Grow `box` by every vertex of a measured item drawn at matrix m.
function grow(box, it, m) {
  const e = m.elements, v = it.verts;
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = v[i + 2];
    const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
    const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (wx < box.minX) box.minX = wx; if (wx > box.maxX) box.maxX = wx;
    if (wy < box.minY) box.minY = wy; if (wy > box.maxY) box.maxY = wy;
    if (wz < box.minZ) box.minZ = wz; if (wz > box.maxZ) box.maxZ = wz;
  }
  return box;
}

// An AABB collider around what was drawn.
function solid(B, box) {
  const c = { minX: box.minX, maxX: box.maxX, minZ: box.minZ, maxZ: box.maxZ };
  B.colliders.push(c);
  return c;
}

// A height field on a regular grid: over each cell centre, the highest surface found so far.
class Grid {
  constructor(minX, minZ, maxX, maxZ, cell, base) {
    this.cell = cell;
    this.x0 = minX;
    this.z0 = minZ;
    this.nx = Math.max(1, Math.ceil((maxX - minX) / cell));
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
    this.base = base;
    this.h = new Float64Array(this.nx * this.nz).fill(base);
  }

  // the cell under (x, z)
  at(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? this.base : this.h[j * this.nx + i];
  }

  // the highest of the four cell centres around (x, z): a read that never falls between them
  around(x, z) {
    const i0 = Math.floor((x - this.x0) / this.cell - 0.5), j0 = Math.floor((z - this.z0) / this.cell - 0.5);
    let m = this.base;
    for (let j = Math.max(0, j0); j <= Math.min(this.nz - 1, j0 + 1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i0 + 1); i++) m = Math.max(m, this.h[j * this.nx + i]);
    }
    return m;
  }

  // every cell whose centre lies in [minX, maxX] x [minZ, maxZ]: fn(index, x, z)
  cells(minX, minZ, maxX, maxZ, fn) {
    const i0 = Math.max(0, Math.ceil((minX - this.x0) / this.cell - 0.5)), i1 = Math.min(this.nx - 1, Math.floor((maxX - this.x0) / this.cell - 0.5));
    const j0 = Math.max(0, Math.ceil((minZ - this.z0) / this.cell - 0.5)), j1 = Math.min(this.nz - 1, Math.floor((maxZ - this.z0) / this.cell - 0.5));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) fn(j * this.nx + i, this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell);
    }
  }
}

// Stacked like a supermarket display: `cols` x `rows` on the floor, each layer up one fewer
// each way, sitting in the hollows of the one below. Neighbours are spaced by the item's widest
// reach from its own axis (the caller's w / d when larger) plus `gap`, and the jitter is held
// inside the gap, so no two can ever touch; each layer rests exactly on the one below (the
// layer height is the item's measured height). `hold` keeps that many items off the top layer
// (from its middle) out of the merge. Returns the drawn extents in the pile's own frame
// (`bounds` about (x, z), `width` along its x, `depth` along its z, `height` the y of its top;
// `aabb` the same in world space) so a neighbour can be placed from them, and a collider around
// everything drawn, held items included (taking one leaves the pile solid).
export function pyramid(B, item, {
  x, z, ry = 0, y = 0, cols = 6, rows = 3, layers = 3, w = 0, d = 0, gap = 0.004,
  jitter = 0.003, spin = 0.3, seed = 1, hold = 0, collide = true,
} = {}) {
  const r = rng(seed);
  const at = frame(x, z, ry);
  const it = measure(item);
  const H = it.max[1] - it.min[1];
  const sx = Math.max(w, 2 * it.radius) + gap, sz = Math.max(d, 2 * it.radius) + gap;
  // two neighbours can drift toward each other by the whole jitter: keep it inside the clearance
  const jit = Math.min(Math.abs(jitter), 0.8 * (Math.min(sx, sz) - 2 * it.radius));
  const layerItems = [];
  for (let k = 0; k < layers; k++) {
    const nc = cols - k, nr = rows - k;
    if (nc < 1 || nr < 1) break;
    const list = [];
    for (let i = 0; i < nc; i++) {
      for (let j = 0; j < nr; j++) {
        const lx = (i - (nc - 1) / 2) * sx + (r() - 0.5) * jit;
        const lz = (j - (nr - 1) / 2) * sz + (r() - 0.5) * jit;
        const turn = (r() - 0.5) * 2 * spin;
        list.push({ lx, ly: y + k * H - it.min[1], lz, turn });
      }
    }
    layerItems.push(list);
  }
  const top = layerItems[layerItems.length - 1];
  // the held items come off the middle of the top layer
  const order = top.map((_, i) => i).sort((a, b) => Math.abs(a - (top.length - 1) / 2) - Math.abs(b - (top.length - 1) / 2));
  const heldIdx = new Set(order.slice(0, Math.min(hold, top.length)));
  const held = [];
  const items = [];
  const own = emptyBox(), world = emptyBox();
  layerItems.forEach((list, k) => list.forEach((p, i) => {
    const m = at(p.lx, p.ly, p.lz, p.turn);
    grow(own, it, place(p.lx, p.ly, p.lz, p.turn));
    grow(world, it, m);
    if (k === layerItems.length - 1 && heldIdx.has(i)) { held.push(m); return; }
    addItem(B, item, m);
    items.push(m);
  }));
  const collider = collide ? solid(B, world) : null;
  return {
    collider, items, held,
    width: own.maxX - own.minX, depth: own.maxZ - own.minZ, height: own.maxY,
    bounds: { minX: own.minX, maxX: own.maxX, minZ: own.minZ, maxZ: own.maxZ },
    aabb: world,
    top: new THREE.Vector3(x, own.maxY, z),
  };
}

// An item's own top and bottom, sampled on a grid in its frame that spans it exactly: over each
// grid point the highest and the lowest point of the item (-Infinity / Infinity where it has none).
const surfaceCache = new WeakMap();
function surfaces(item) {
  if (!surfaceCache.has(item)) surfaceCache.set(item, surfacesOf(item));
  return surfaceCache.get(item);
}
function surfacesOf(item) {
  const it = measure(item);
  const spanX = it.max[0] - it.min[0], spanZ = it.max[2] - it.min[2];
  const cell = Math.min(0.01, Math.max(0.003, Math.max(spanX, spanZ) / 48));
  const nx = Math.max(2, Math.ceil(spanX / cell) + 1), nz = Math.max(2, Math.ceil(spanZ / cell) + 1);
  const dx = spanX / (nx - 1), dz = spanZ / (nz - 1);
  const top = new Float64Array(nx * nz).fill(-Infinity), bot = new Float64Array(nx * nz).fill(Infinity);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const [g, , local] of item) {
    const pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(t) : t);
      b.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1);
      c.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2);
      if (local) { a.applyMatrix4(local); b.applyMatrix4(local); c.applyMatrix4(local); }
      const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
      if (Math.abs(area) < 1e-12) continue;   // seen edge on from above: its neighbours cover it
      const i0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - it.min[0]) / dx - 1e-6));
      const i1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - it.min[0]) / dx + 1e-6));
      const j0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - it.min[2]) / dz - 1e-6));
      const j1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - it.min[2]) / dz + 1e-6));
      for (let j = j0; j <= j1; j++) {
        const pz = it.min[2] + j * dz;
        for (let i = i0; i <= i1; i++) {
          const px = it.min[0] + i * dx;
          const w0 = ((b.x - px) * (c.z - pz) - (c.x - px) * (b.z - pz)) / area;
          const w1 = ((c.x - px) * (a.z - pz) - (a.x - px) * (c.z - pz)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const yy = w0 * a.y + w1 * b.y + w2 * c.y;
          const k = j * nx + i;
          if (yy > top[k]) top[k] = yy;
          if (yy < bot[k]) bot[k] = yy;
        }
      }
    }
  }
  let reach = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (top[j * nx + i] > -Infinity) reach = Math.max(reach, Math.hypot(it.min[0] + i * dx, it.min[2] + j * dz));
  }
  // the highest of the four grid points around (u, v): a read that never falls between them
  const topAround = (u, v) => {
    const fi = (u - it.min[0]) / dx, fj = (v - it.min[2]) / dz;
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    let m = -Infinity;
    for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j0 + 1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i0 + 1); i++) m = Math.max(m, top[j * nx + i]);
    }
    return m;
  };
  return { it, nx, nz, dx, dz, top, bot, cell: Math.min(dx, dz), reach: reach + Math.max(dx, dz), topAround };
}

// A tower: plates, folded linen, trays. The first piece rests on `y`, each later one on the
// piece below it (the item's own top and bottom are measured, so a plate nests into the one
// below and a box sits on the box below, whatever their twist and jitter), and never closer than
// `h` above the last (0: wherever it comes to rest). The tower drifts `lean` metres sideways by
// the top (a slow curve, so it bows rather than shears). `height` is the y of the top, `top`
// the centre of the top piece's top, `aabb` the world box of everything drawn; with collide: true
// that box is the tower's collider.
export function stack(B, item, {
  x, z, ry = 0, y = 0, count = 10, h = 0, lean = 0, twist = 0.08, jitter = 0.004, seed = 1, collide = false,
} = {}) {
  const r = rng(seed);
  const at = frame(x, z, ry);
  const S = surfaces(item);
  const reach = S.reach + Math.abs(lean) + Math.abs(jitter) + 2 * S.cell;
  const field = new Grid(x - reach, z - reach, x + reach, z + reach, S.cell, y);
  const items = [];
  const box = emptyBox();
  let prev = -Infinity, last = null;
  const cr = Math.cos(ry), sr = Math.sin(ry);
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0;
    const lx = lean * t * t + (r() - 0.5) * jitter;
    const lz = (r() - 0.5) * jitter;
    const turn = (r() - 0.5) * twist * 2;
    const px = x + lx * cr + lz * sr, pz = z - lx * sr + lz * cr;
    const c = Math.cos(ry + turn), s = Math.sin(ry + turn);
    // the lowest it can sit: every point of its bottom on or above what is already there
    let yy = -Infinity;
    for (let j = 0; j < S.nz; j++) {
      const v = S.it.min[2] + j * S.dz;
      for (let k = 0; k < S.nx; k++) {
        const bt = S.bot[j * S.nx + k];
        if (bt === Infinity) continue;
        const u = S.it.min[0] + k * S.dx;
        yy = Math.max(yy, field.around(px + u * c + v * s, pz - u * s + v * c) - bt);
      }
    }
    yy = Math.max(yy, prev + h);
    // its top becomes the surface the next one lands on
    field.cells(px - S.reach, pz - S.reach, px + S.reach, pz + S.reach, (k, wx, wz) => {
      const dx = wx - px, dz = wz - pz;
      const tp = S.topAround(dx * c - dz * s, dx * s + dz * c);
      if (tp > -Infinity && yy + tp > field.h[k]) field.h[k] = yy + tp;
    });
    const m = at(lx, yy, lz, turn);
    addItem(B, item, m);
    items.push(m);
    grow(box, S.it, m);
    prev = yy;
    last = { px, pz, yy };
  }
  const collider = collide && items.length ? solid(B, box) : null;
  const height = items.length ? box.maxY : y;
  return { collider, items, height, aabb: box, top: last ? new THREE.Vector3(last.px, last.yy + S.it.max[1], last.pz) : new THREE.Vector3(x, y, z) };
}

// --- heaps ---------------------------------------------------------------------------------------
// For settling, a heap's piece is its box (the bounds of its vertices in its own frame) under its
// world matrix. A box is convex, so where it meets another can be found exactly: the lowest a
// box can sit over another is set by the largest gap between the other's top and its own bottom
// over the columns both cover, and that largest gap lies over a corner of one of them or where
// their edges cross, seen from above.
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
const UP = new THREE.Vector3(0, 1, 0);

function block(kind, m) {
  const e = m.elements, lo = kind.min, hi = kind.max;
  const verts = [];
  const aabb = emptyBox();
  for (let k = 0; k < 8; k++) {
    const lx = k & 1 ? hi[0] : lo[0], ly = k & 2 ? hi[1] : lo[1], lz = k & 4 ? hi[2] : lo[2];
    const v = [e[0] * lx + e[4] * ly + e[8] * lz + e[12], e[1] * lx + e[5] * ly + e[9] * lz + e[13], e[2] * lx + e[6] * ly + e[10] * lz + e[14]];
    verts.push(v);
    aabb.minX = Math.min(aabb.minX, v[0]); aabb.maxX = Math.max(aabb.maxX, v[0]);
    aabb.minY = Math.min(aabb.minY, v[1]); aabb.maxY = Math.max(aabb.maxY, v[1]);
    aabb.minZ = Math.min(aabb.minZ, v[2]); aabb.maxZ = Math.max(aabb.maxZ, v[2]);
  }
  // its faces as half-spaces n.p <= d (n: an axis of the piece, unit: place() never scales)
  const planes = [];
  for (let a = 0; a < 3; a++) {
    const n = [e[4 * a], e[4 * a + 1], e[4 * a + 2]];
    let dmin = Infinity, dmax = -Infinity;
    for (const v of verts) { const dd = n[0] * v[0] + n[1] * v[1] + n[2] * v[2]; dmin = Math.min(dmin, dd); dmax = Math.max(dmax, dd); }
    planes.push([n[0], n[1], n[2], dmax], [-n[0], -n[1], -n[2], -dmin]);
  }
  return { verts, planes, aabb, thin: kind.thin };
}

// The vertical extent [bottom, top] of a block over the column (x, z), or null off it.
function column(P, x, z) {
  let lo = -Infinity, hi = Infinity;
  for (const [nx, ny, nz, d] of P.planes) {
    const b = d - nx * x - nz * z;
    if (Math.abs(ny) < 1e-9) { if (b < -1e-7) return null; continue; }
    const yv = b / ny;
    if (ny > 0) { if (yv < hi) hi = yv; } else if (yv > lo) lo = yv;
  }
  return hi >= lo - 1e-7 ? [lo, Math.max(lo, hi)] : null;
}

// How far A must rise to clear B (+ clr): the largest (B's top - A's bottom) over the columns both
// cover. Raises best.t (and records where) when it is larger.
function clearOf(A, B, clr, best) {
  const a = A.aabb, b = B.aabb;
  if (a.maxX < b.minX || a.minX > b.maxX || a.maxZ < b.minZ || a.minZ > b.maxZ) return best;
  const test = (x, z) => {
    const ca = column(A, x, z);
    if (!ca) return;
    const cb = column(B, x, z);
    if (!cb) return;
    const t = cb[1] - ca[0] + clr;
    if (t > best.t) { best.t = t; best.x = x; best.y = cb[1] + clr; best.z = z; }
  };
  for (const v of A.verts) if (v[0] >= b.minX && v[0] <= b.maxX && v[2] >= b.minZ && v[2] <= b.maxZ) test(v[0], v[2]);
  for (const v of B.verts) if (v[0] >= a.minX && v[0] <= a.maxX && v[2] >= a.minZ && v[2] <= a.maxZ) test(v[0], v[2]);
  // only edges that reach over the other block can cross its edges
  const reaches = (p, q, o) => Math.max(p[0], q[0]) >= o.minX && Math.min(p[0], q[0]) <= o.maxX && Math.max(p[2], q[2]) >= o.minZ && Math.min(p[2], q[2]) <= o.maxZ;
  const eb = EDGES.filter(([k, l]) => reaches(B.verts[k], B.verts[l], a));
  for (const [i, j] of EDGES) {
    const p = A.verts[i], q = A.verts[j];
    if (!reaches(p, q, b)) continue;
    const rx = q[0] - p[0], rz = q[2] - p[2];
    for (const [k, l] of eb) {
      const s0 = B.verts[k], s1 = B.verts[l];
      const sx = s1[0] - s0[0], sz = s1[2] - s0[2];
      const den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-12) continue;
      const qx = s0[0] - p[0], qz = s0[2] - p[2];
      const tt = (qx * sz - qz * sx) / den, uu = (qx * rz - qz * rx) / den;
      if (tt < -1e-9 || tt > 1 + 1e-9 || uu < -1e-9 || uu > 1 + 1e-9) continue;
      test(p[0] + tt * rx, p[2] + tt * rz);
    }
  }
  return best;
}

// The convex outline of points [x, z] seen from above (counter-clockwise), and how far (x, z) lies
// inside it (negative: outside).
function outline(pts) {
  const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-12) lo.pop(); lo.push(p); }
  for (let i = s.length - 1; i >= 0; i--) { const p = s[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 1e-12) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function inside(poly, x, z) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez);
    if (L > 1e-12) d = Math.min(d, (ex * (z - a[1]) - ez * (x - a[0])) / L);
  }
  return d;
}

// The plane a flat bottom settles to over the support under it. `pts` holds [dx, dz, f, ...]: a
// support height f at an offset (dx, dz) from the point the piece balances on. The piece comes
// to rest where that point is lowest while its bottom plane, c + g.(dx, dz), stays on or above
// every support height: c(g) = max(f - g.(dx, dz)) is convex in the slope g, so a nested
// golden-section search over |g| <= T finds it. On level ground that is g = 0 exactly. `steep`:
// the slope wanted more than T, so the piece would hang off its high side.
const PHI = (Math.sqrt(5) - 1) / 2;
function settlePlane(all, T) {
  // Of the points at one height only the corners of their outline can be the highest under a plane,
  // so only those are kept (the result is the same, found from far fewer points).
  const level = new Map();
  for (let i = 0; i < all.length; i += 3) {
    let g = level.get(all[i + 2]);
    if (!g) level.set(all[i + 2], (g = []));
    g.push([all[i], all[i + 1]]);
  }
  const pts = [];
  for (const [f, list] of level) for (const [dx, dz] of list.length > 3 ? outline(list) : list) pts.push(dx, dz, f);
  const n = pts.length;
  let lo = Infinity, hi = -Infinity;
  for (let i = 2; i < n; i += 3) { if (pts[i] < lo) lo = pts[i]; if (pts[i] > hi) hi = pts[i]; }
  if (T <= 0 || hi - lo < 1e-6) return { gx: 0, gz: 0, c: hi, steep: false };
  let bv = hi, bx = 0, bz = 0;   // the lowest found so far (g = 0 to start)
  const F = (gx, gz) => {
    let m = -Infinity;
    for (let i = 0; i < n; i += 3) { const v = pts[i + 2] - gx * pts[i] - gz * pts[i + 1]; if (v > m) m = v; }
    if (m < bv) { bv = m; bx = gx; bz = gz; }
    return m;
  };
  // golden-section minimum of f over [a, b]
  const golden = (a, b, f) => {
    let c = b - PHI * (b - a), d = a + PHI * (b - a), fc = f(c), fd = f(d);
    for (let k = 0; k < 14; k++) {
      if (fc <= fd) { b = d; d = c; fd = fc; c = b - PHI * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + PHI * (b - a); fd = f(d); }
    }
    return Math.min(fc, fd);
  };
  golden(-T, T, (gz) => { const w = Math.sqrt(Math.max(0, T * T - gz * gz)); return golden(-w, w, (gx) => F(gx, gz)); });
  if (bv > hi - 1e-5) return { gx: 0, gz: 0, c: hi, steep: false };
  return { gx: bx, gz: bz, c: bv, steep: Math.hypot(bx, bz) > T * 0.985 };
}

// A heap: an irregular mound of mixed pieces (boxes, paper), dropped one by one in seeded order
// from the outside in (so the late ones land on top) at points of an ellipse rx x rz about (x, z),
// turned by ry. A height field of what is already there (a `cell` grid over the heap, starting at
// the floor `y`) carries each piece to rest:
//   - it is spun about its own vertical axis first, and its footprint kept inside `keep`
//     ({ minX, maxX, minZ, maxZ }, world space: a wall face, a walkway's edge), tilted or not;
//   - the field is sampled over its whole bottom (a 3 cm grid of points under it, and its edges),
//     and it takes the bottom plane that brings it lowest while staying on or above every sample:
//     it rests on the highest points under it, tilted down the slope they make (at most `tilt`
//     radians), leaning toward where its weight is (a seeded point near its middle: the water in
//     it). On level ground it lies flat;
//   - it is then set down exactly on what it meets first, its box (the bounds of its vertices,
//     under its matrix) against the floor and every piece before it, so it touches what holds it
//     up, never enters it and never goes below `y`; a thin piece (paper) keeps 1.5 mm off what it
//     lies on;
//   - one that would tip past `tilt` (it would hang off its high side), or rise above `ceiling`
//     over `y` (a handrail), slides on to the nearest low place where it lies steady, within a
//     metre of where it fell (the 32 lowest and nearest of rings of spots 8 cm apart are settled
//     in turn); failing that it keeps its lowest place under the ceiling, and one with no place
//     under the ceiling at all is left out (`dropped` counts them);
//   - one lying flat on the floor creeps up to `slump` metres in toward (x, z), stopping short of
//     the neighbour it meets, so the bottom packs close;
//   - with `steady`, a piece must also be held up where it was set down, the way its stuff could
//     bear: the points of its bottom that touch the floor or a settled piece (within 6 mm, on a
//     13 x 13 grid) must surround its middle with room to spare and the point it balances on, and
//     no part of it may reach further past them than a box could stand out (a third of its narrow
//     side), cardboard trodden flat (thinner than 5 cm) 6 cm, or a wet sheet 2 cm; a sheet must
//     touch over most of it as well. The height field only sees what is under its samples, so
//     without this a piece can come to rest on a corner or a sliver of a neighbour, hanging in the
//     air, or stand out flat over a drop like a shelf; a piece that is not held up slides on like
//     a steep one, and one with no steady place left is dropped;
//   - no flat face of a lying piece may come within 2 mm of a height in `skins` (a skin of water
//     drawn over the floor): such a place is not taken either;
//   - its top is written into the field for the next.
// `crown` ({ part, x, z, yaw, ceiling, tilt, lay }) is one more piece, of parts[part], put down
// after the others at (x, z), spun by yaw and balanced on its middle, the same way (it slides on if
// it cannot lie steady there) under its own ceiling and tilt when it has them: a broad top for what
// is laid on it. The sheets in its `lay` ([[w, d, u, v, turn], ...]: centred u along its x and v
// along its z from its middle, turned by turn more than it) are then laid on it with rest(), each on
// what is there before it (the crown, or the sheet before), so none crosses another. A piece with
// something lying on it is drawn as its part's `loaded` item if it has one: a sodden box whose lid
// is pressed flat under what is on it, so that lies on the lid and not over its dip (it must have
// the same bounds, so nothing about the settling changes).
// `strew` ({ count, size: [w, d] or [[w, d], ...], item, apart, margin }) lays up to `count` sheets of
// those sizes in turn (drawn as `item`, a 1 x 1 sheet in its local XZ plane, scaled to each) on the
// highest bare lids once the crown is down, one each, wholly on the lid (`margin` inside its edges)
// and `apart` from the crown and from each other; their matrices come back in `strewn` (scale
// included), and the boxes under them are drawn `loaded` too.
// `parts` is a list of { item, weight, loaded } (weight: how often it is picked; a part of weight 0
// is never picked, only put down as the crown). The rng is drawn six times per piece whatever
// happens to it (the crown draws nothing), so a seed always means the same heap.
// Returns the collider (the AABB of the drawn pieces, when collide), the pieces' matrices (`items`,
// with `variants` their index in `parts` and `drawn` the item each was drawn as; the crown is
// items[crown], -1 when it found no place: its sheets are then laid where it was asked to go), the
// laid sheets' (`laid`), `dropped`, `height` (the y of the highest point drawn), `aabb` (the drawn
// pieces' world AABB, y included), `top` (the heap's surface over (x, z)), `surface(x, z)` (the top
// of what lies at (x, z): a settled piece, a laid sheet, or the floor) and
// `rest(w, d, x, z, ry, { tilt, remember })`: the matrix that lays a w x d sheet (in its local XZ
// plane, face up: a PlaneGeometry turned by rotateX(-PI / 2), say) on the settled heap at (x, z),
// spun by ry, tilted to what is under it and 1.5 mm off it, inside `keep`. A sheet laid is
// remembered (remember: false only asks), so the next one lies on it; it is not part of the
// collider, and the scene draws it.
//
// heap() settles and draws in one go. settleHeap() is the settling alone, a generator that yields
// between pieces (and between the places a sliding piece tries); heapAsync() runs it a slice at a
// time, awaiting yieldFrame() whenever a slice has held the thread `budget` ms, and then draws it
// through heap() (opts.settled: what settleHeap() returned). The heap is the same either way: the
// slices only decide when the page gets a frame.
export function heap(B, parts, opts = {}) {
  const S = opts.settled || finish(settleHeap(parts, opts));
  const { x, z, y = 0, collide = true } = opts;
  const drawnItems = S.items.map((m, i) => {
    const p = parts[S.variants[i]], item = S.loaded[i] && p.loaded ? p.loaded : p.item;
    addItem(B, item, m);
    return item;
  });
  // (a strewn sheet is the strew item scaled to its size: the item is a 1 x 1 sheet)
  const strewn = S.strewn.map(({ m, size: [sw, sd] }) => m.clone().scale(new THREE.Vector3(sw, 1, sd)));
  for (const m of strewn) addItem(B, opts.strew.item, m);
  const collider = collide && S.items.length ? solid(B, S.drawn) : null;
  return {
    collider, items: S.items, variants: S.variants, dropped: S.dropped, drawn: drawnItems, laid: S.laid, strewn, crown: S.crown,
    height: S.items.length ? S.drawn.maxY : y,
    aabb: S.drawn,
    top: new THREE.Vector3(x, S.surface(x, z), z),
    surface: S.surface, rest: S.rest,
  };
}

export async function heapAsync(B, parts, opts, yieldFrame, budget = 16) {
  const steps = settleHeap(parts, opts);
  let t = performance.now(), s;
  while (!(s = steps.next()).done) {
    if (performance.now() - t > budget) { await yieldFrame(); t = performance.now(); }
  }
  return heap(B, parts, { ...opts, settled: s.value });
}

// a generator run to its end: what it returns
function finish(steps) {
  let s;
  while (!(s = steps.next()).done);
  return s.value;
}

export function* settleHeap(parts, {
  x, z, ry = 0, y = 0, rx = 0.6, rz = 0.4, count = 16, seed = 1, tilt = 0.5, ceiling = Infinity,
  keep = null, cell = 0.015, slump: slumpMax = 0.15, steady = false, crown = null, skins = [], strew = null,
} = {}) {
  const r = rng(seed);
  const K = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity, ...(keep || {}) };
  const kinds = parts.map((p) => {
    const it = measure(p.item);
    return { ...it, thin: it.max[1] - it.min[1] < 0.002 };
  });
  const total = parts.reduce((s, p) => s + (p.weight ?? 1), 0);
  const SLIDE = 1.0, RING = 0.08;
  const STRIDE = Math.max(1, Math.round(0.03 / cell));   // support samples ~3 cm apart
  const ext = Math.max(rx, rz, crown ? Math.hypot(crown.x - x, crown.z - z) : 0) + Math.max(...kinds.map((k) => k.radius)) + SLIDE + 0.05;
  const grid = new Grid(Math.max(K.minX, x - ext), Math.max(K.minZ, z - ext), Math.min(K.maxX, x + ext), Math.min(K.maxZ, z + ext), cell, y);
  const pieces = [];   // settled blocks (and sheets laid by rest()), highest top first
  const items = [], variants = [];
  const drawn = emptyBox();
  const one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), axis = new THREE.Vector3();
  const qt = new THREE.Quaternion();

  // what must be moved where to bring an AABB inside keep (centred when it cannot fit)
  const shift = (b) => {
    let dx = 0, dz = 0;
    if (b.maxX - b.minX > K.maxX - K.minX) dx = (K.minX + K.maxX - b.minX - b.maxX) / 2;
    else if (b.minX < K.minX) dx = K.minX - b.minX;
    else if (b.maxX > K.maxX) dx = K.maxX - b.maxX;
    if (b.maxZ - b.minZ > K.maxZ - K.minZ) dz = (K.minZ + K.maxZ - b.minZ - b.maxZ) / 2;
    else if (b.minZ < K.minZ) dz = K.minZ - b.minZ;
    else if (b.maxZ > K.maxZ) dz = K.maxZ - b.maxZ;
    return [dx, dz];
  };
  // a footprint spun by yaw at (px, pz), moved inside keep
  const within = (kind, px, pz, yaw) => {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const ax = (kind.max[0] - kind.min[0]) / 2, az = (kind.max[2] - kind.min[2]) / 2;
    const mx = (kind.max[0] + kind.min[0]) / 2, mz = (kind.max[2] + kind.min[2]) / 2;
    const cx = px + mx * Math.cos(yaw) + mz * Math.sin(yaw), cz = pz - mx * Math.sin(yaw) + mz * Math.cos(yaw);
    const hx = ax * c + az * s, hz = ax * s + az * c;
    const [dx, dz] = shift({ minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz });
    return [px + dx, pz + dz];
  };
  // the lift that sets A down on what it meets first, the floor or a settled piece (negative: it
  // was above it, and comes down)
  const meet = (A) => {
    let low = Infinity;
    for (const v of A.verts) low = Math.min(low, v[1]);
    const best = { t: y + (A.thin ? CLEAR : 0) - low };
    for (const P of pieces) {
      // highest first: once one's top cannot reach A's bottom, none further can
      if (P.aabb.maxY + CLEAR - A.aabb.minY <= best.t) break;
      clearOf(A, P, A.thin || P.thin ? CLEAR : 0, best);
    }
    return best.t;
  };

  // drop one piece at (px, pz), spun by yaw, balancing on the point (ox, oz) of its footprint
  // (fractions of its half-size): its matrix, its block, where it ended up and whether it is steep
  function settle(kind, px, pz, yaw, ox = 0, oz = 0, cap = tilt) {
    [px, pz] = within(kind, px, pz, yaw);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const u0 = kind.min[0], u1 = kind.max[0], v0 = kind.min[2], v1 = kind.max[2];
    const bu = (u0 + u1) / 2 + ox * (u1 - u0) / 2, bv = (v0 + v1) / 2 + oz * (v1 - v0) / 2;
    const bx = px + bu * c + bv * s, bz = pz - bu * s + bv * c;
    const pts = [];
    const corners = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]].map(([u, v]) => [px + u * c + v * s, pz - u * s + v * c]);
    const fx = corners.map((q) => q[0]), fz = corners.map((q) => q[1]);
    grid.cells(Math.min(...fx), Math.min(...fz), Math.max(...fx), Math.max(...fz), (k, wx, wz) => {
      if ((k % grid.nx) % STRIDE || Math.floor(k / grid.nx) % STRIDE) return;
      const dx = wx - px, dz = wz - pz;
      const u = dx * c - dz * s, v = dx * s + dz * c;
      if (u >= u0 && u <= u1 && v >= v0 && v <= v1) pts.push(wx - bx, wz - bz, grid.h[k]);
    });
    for (let i = 0; i <= 4; i++) {
      for (const [u, v] of [[u0 + (u1 - u0) * i / 4, v0], [u0 + (u1 - u0) * i / 4, v1], [u0, v0 + (v1 - v0) * i / 4], [u1, v0 + (v1 - v0) * i / 4]]) {
        const wx = px + u * c + v * s, wz = pz - u * s + v * c;
        pts.push(wx - bx, wz - bz, grid.at(wx, wz));
      }
    }
    const P = settlePlane(pts, Math.tan(Math.max(0, Math.min(cap, 1.4))));
    // spun first, then tilted down the slope
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const gl = Math.hypot(P.gx, P.gz);
    if (gl > 0) q.premultiply(qt.setFromAxisAngle(axis.set(-P.gz / gl, 0, P.gx / gl), Math.atan(gl)));
    const m = new THREE.Matrix4().compose(pos.set(px, 0, pz), q, one);
    const [ex, ez] = shift(block(kind, m).aabb);
    m.elements[12] += ex; m.elements[14] += ez;
    m.elements[13] += meet(block(kind, m));
    const b = block(kind, m);
    // (one too high for the ceiling is never kept: no need to ask whether it is held)
    const why = skinned(b) ? 'skin' : steady && b.aabb.maxY <= ceil + 1e-9 ? held(kind, m, bu, bv) : 'ok';
    return { m, block: b, px: m.elements[12], pz: m.elements[14], steep: P.steep, g: [P.gx, P.gz], ok: why === 'ok', why };
  }

  // Does a lying piece's top or bottom (within 4 degrees of level) come within SKIN of one of the
  // `skins`, flat surfaces drawn over the floor (a skin of water)? The two would fight for the
  // same pixels, so such a place is not taken: the piece slides on, like one that is not held.
  const SKIN = 0.002, LEVEL = Math.cos(4 * Math.PI / 180);
  function skinned(P) {
    if (!skins.length) return false;
    const up = [P.planes[2][0], P.planes[2][1], P.planes[2][2]];   // the piece's own y axis
    if (Math.abs(up[1]) < LEVEL) return false;
    for (const side of [0, 2]) {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 8; k++) {
        if ((k & 2) !== side) continue;
        lo = Math.min(lo, P.verts[k][1]); hi = Math.max(hi, P.verts[k][1]);
      }
      if (skins.some((h) => h > lo - SKIN && h < hi + SKIN)) return true;
    }
    return false;
  }

  // steady: is a piece at m held up, and held the way it could bear? Its bottom is sampled on a
  // grid; the samples within HOLD of what is under them (the floor, or the top of a settled piece
  // below them) are its contacts. Their outline seen from above must hold its middle (by `margin`)
  // and its balance point (bu, bv), and no part of it may reach further past that outline than its
  // stuff could carry: a box a third of its narrow side; trodden-flat cardboard, sodden, a few
  // centimetres; a wet sheet hardly at all, and it must lie on something over most of it (wet paper
  // clings to what is under it, it never stands out stiff over a drop).
  const HOLD = 0.006, HOLD_N = 13, HOLD_TOL = 0.01;
  const bearing = new Map();
  function carry(kind) {
    if (!bearing.has(kind)) {
      const sx = kind.max[0] - kind.min[0], sz = kind.max[2] - kind.min[2], h = kind.max[1] - kind.min[1], s = Math.min(sx, sz);
      bearing.set(kind, kind.thin ? { reach: 0.02, contact: 0.6, margin: 0.03 }
        : h < 0.05 ? { reach: 0.06, contact: 0, margin: 0.12 * s }
          : { reach: s / 3, contact: 0, margin: 0.1 * s });
    }
    return bearing.get(kind);
  }
  function held(kind, m, bu, bv) {
    const e = m.elements, ly = kind.min[1];
    const C = carry(kind), N = HOLD_N;
    const toWorld = (u, v) => [e[0] * u + e[4] * ly + e[8] * v + e[12], e[1] * u + e[5] * ly + e[9] * v + e[13], e[2] * u + e[6] * ly + e[10] * v + e[14]];
    // only the settled pieces under its footprint can hold it
    const A = block(kind, m).aabb;
    const near = pieces.filter((P) => P.aabb.minY <= A.maxY && P.aabb.maxX >= A.minX && P.aabb.minX <= A.maxX && P.aabb.maxZ >= A.minZ && P.aabb.minZ <= A.maxZ);
    const touch = [], free = [];
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        const [wx, wy, wz] = toWorld(kind.min[0] + (kind.max[0] - kind.min[0]) * a / (N - 1), kind.min[2] + (kind.max[2] - kind.min[2]) * b / (N - 1));
        let sup = y;
        for (const P of near) {
          if (P.aabb.maxY <= sup) break;   // highest first: nothing further can be higher
          if (wx < P.aabb.minX || wx > P.aabb.maxX || wz < P.aabb.minZ || wz > P.aabb.maxZ) continue;
          const col = column(P, wx, wz);
          if (col && col[1] <= wy + 1e-4 && col[1] > sup) sup = col[1];
        }
        (wy - sup < HOLD ? touch : free).push([wx, wz]);
      }
    }
    if (touch.length < C.contact * N * N) return 'contact';
    const hull = outline(touch);
    if (hull.length < 3) return 'hull';
    const mid = toWorld((kind.min[0] + kind.max[0]) / 2, (kind.min[2] + kind.max[2]) / 2), bal = toWorld(bu, bv);
    if (inside(hull, mid[0], mid[2]) < C.margin) return 'mid';
    if (inside(hull, bal[0], bal[2]) < -HOLD_TOL) return 'bal';
    // how far it reaches past its contacts (a sample is a grid step from the next: half of one is
    // the outline's own uncertainty)
    const half = Math.min(kind.max[0] - kind.min[0], kind.max[2] - kind.min[2]) / (N - 1) / 2;
    for (const [fx, fz] of free) if (-inside(hull, fx, fz) - half > C.reach) return 'reach';
    return 'ok';
  }

  // a piece lying flat on the floor creeps in toward the middle of the heap, up to slumpMax, and
  // stops short of whatever it would have to climb onto
  function slump(kind, res) {
    const e = res.m.elements;
    const dx = x - e[12], dz = z - e[14], D0 = Math.hypot(dx, dz), D = Math.min(D0, slumpMax);
    if (D < 0.02 || res.block.aabb.minY > y + CLEAR + 1e-6 || e[5] < Math.cos(0.01)) return res;
    const moved = (d) => {
      const m = res.m.clone();
      m.elements[12] += dx / D0 * d; m.elements[14] += dz / D0 * d;
      const [sx, sz] = shift(block(kind, m).aabb);
      m.elements[12] += sx; m.elements[14] += sz;
      m.elements[13] += meet(block(kind, m));
      return m.elements[13] <= e[13] + 1e-6 ? m : null;
    };
    let lo = 0, hi = -1, best = res.m;
    for (let d = 0.03; lo < D; d += 0.03) {
      const m = moved(Math.min(d, D));
      if (!m) { hi = Math.min(d, D); break; }
      lo = Math.min(d, D); best = m;
    }
    if (hi > 0) {
      for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2, m = moved(mid); if (m) { lo = mid; best = m; } else hi = mid; }
    }
    return { ...res, m: best, block: block(kind, best), px: best.elements[12], pz: best.elements[14] };
  }

  // For the slide search: the highest field point under a footprint spun by yaw at (px, pz), read
  // every other cell (3 cm apart) of the footprint grown by half a cell, and the lowest there. It is
  // only an estimate of how high the piece would come there (settle() is exact): null when it is
  // plainly higher than `limit`.
  function under(kind, px, pz, yaw, limit = Infinity) {
    const c = Math.cos(yaw), s = Math.sin(yaw), cs = grid.cell, m = cs / 2;
    const u0 = kind.min[0] - m, u1 = kind.max[0] + m, v0 = kind.min[2] - m, v1 = kind.max[2] + m;
    const R = Math.hypot(Math.max(-u0, u1), Math.max(-v0, v1));
    const i0 = Math.max(0, Math.floor((px - R - grid.x0) / cs)), i1 = Math.min(grid.nx - 1, Math.floor((px + R - grid.x0) / cs));
    const j0 = Math.max(0, Math.floor((pz - R - grid.z0) / cs)), j1 = Math.min(grid.nz - 1, Math.floor((pz + R - grid.z0) / cs));
    let hi = y, lo = Infinity;
    for (let j = j0; j <= j1; j += 2) {
      const dz = grid.z0 + (j + 0.5) * cs - pz;
      for (let i = i0; i <= i1; i += 2) {
        const dx = grid.x0 + (i + 0.5) * cs - px, u = dx * c - dz * s, v = dx * s + dz * c;
        if (u < u0 || u > u1 || v < v0 || v > v1) continue;
        const h = grid.h[j * grid.nx + i];
        if (h > hi) { hi = h; if (hi > limit) return null; }
        if (h < lo) lo = h;
      }
    }
    return [hi, Math.min(lo, hi)];
  }

  // a settled piece becomes part of the heap: what the next lands on
  function commit(P) {
    let k = pieces.length;
    while (k > 0 && pieces[k - 1].aabb.maxY < P.aabb.maxY) k--;
    pieces.splice(k, 0, P);
    const lift = P.thin ? CLEAR : 0;
    grid.cells(P.aabb.minX, P.aabb.minZ, P.aabb.maxX, P.aabb.maxZ, (i, cx, cz) => {
      const col = column(P, cx, cz);
      if (col && col[1] + lift > grid.h[i]) grid.h[i] = col[1] + lift;
    });
  }

  let ceil = y + ceiling;
  const fits = (res) => res.block.aabb.maxY <= ceil + 1e-9;

  // Put one piece down where it fell, or, if it would tip off what it fell on, rise above the
  // ceiling or not be held there, slide it on to the nearest low place it can lie steady in. Rings
  // of spots around where it fell (8 cm apart, out to SLIDE) are ranked by how high it would come
  // there (the highest field point under it, plus its own height) and how far it went; the best are
  // settled in turn, and the first that is steady and under the ceiling wins, else the lowest of
  // them under the ceiling. What it comes to (slumped), or null when it has no place.
  function* drop(kind, px, pz, yaw, ox, oz, cap) {
    let done = settle(kind, px, pz, yaw, ox, oz, cap);
    if (done.steep || !fits(done) || !done.ok) {
      const H = kind.max[1] - kind.min[1];
      const spots = [], seen = new Set();
      for (let ring = 1; ring * RING <= SLIDE + 1e-9; ring++) {
        const n = 6 * ring;
        for (let q = 0; q < n; q++) {
          const ang = (q + 0.5 * (ring & 1)) * 2 * Math.PI / n, d = ring * RING;
          const [cx, cz] = within(kind, done.px + Math.cos(ang) * d, done.pz + Math.sin(ang) * d, yaw);
          // spots pushed back inside keep onto one already looked at
          const key = Math.round(cx * 500) * 100003 + Math.round(cz * 500);
          if (seen.has(key)) continue;
          seen.add(key);
          // (too high for the ceiling: not a spot)
          const est = under(kind, cx, cz, yaw, ceil - H + 1e-9);
          if (est) spots.push({ cx, cz, score: est[0] + H + 0.6 * Math.hypot(cx - done.px, cz - done.pz) });
        }
      }
      spots.sort((p, q) => p.score - q.score);
      const tried = [done];
      let found = null;
      for (const sp of spots.slice(0, 32)) {
        yield;
        const res = settle(kind, sp.cx, sp.cz, yaw, ox, oz, cap);
        tried.push(res);
        if (!res.steep && fits(res) && res.ok) { found = res; break; }
        if (tried.length > 8 && tried.some((t) => fits(t) && t.ok)) break;
      }
      if (!found) {
        const ok = tried.filter((t) => fits(t) && t.ok).sort((p, q) => p.block.aabb.maxY - q.block.aabb.maxY);
        found = ok.length ? ok[0] : null;
      }
      done = found;
    }
    return done && slump(kind, done);
  }
  function keepPiece(kind, k, done) {
    Object.assign(done.block, { index: items.length, kind, m: done.m });
    commit(done.block);
    items.push(done.m);
    variants.push(k);
    grow(drawn, kind, done.m);
  }

  let dropped = 0;
  const cr = Math.cos(ry), sr = Math.sin(ry);
  for (let i = 0; i < count; i++) {
    let pick = r() * total, k = 0;
    for (let j = 0; j < parts.length; j++) { pick -= parts[j].weight ?? 1; if (pick <= 0 && parts[j].weight !== 0) { k = j; break; } }
    // fill from the outside in, so the late pieces land on top
    const a = r() * Math.PI * 2;
    const sp = Math.sqrt(1 - i / count) * (0.35 + 0.65 * r());
    const yaw = ry + r() * Math.PI * 2;
    const ox = (r() - 0.5) * 0.6, oz = (r() - 0.5) * 0.6;
    const u = Math.cos(a) * sp * rx, v = Math.sin(a) * sp * rz;
    const done = yield* drop(kinds[k], x + u * cr + v * sr, z - u * sr + v * cr, yaw, ox, oz, tilt);
    if (done) keepPiece(kinds[k], k, done);
    else dropped++;
    yield;
  }

  function surface(px, pz) {
    let top = y;
    for (const P of pieces) {
      if (P.aabb.maxY <= top) break;
      if (px < P.aabb.minX || px > P.aabb.maxX || pz < P.aabb.minZ || pz > P.aabb.maxZ) continue;
      const col = column(P, px, pz);
      if (col && col[1] > top) top = col[1];
    }
    return top;
  }
  function rest(w, d, px, pz, yaw = 0, { tilt: cap = tilt, remember = true } = {}) {
    const kind = { min: [-w / 2, 0, -d / 2], max: [w / 2, 0, d / 2], thin: true };
    const res = settle(kind, px, pz, yaw, 0, 0, cap);
    if (remember) commit(Object.assign(res.block, { kind, m: res.m }));
    return res.m;
  }

  // the crown, and the sheets laid on it
  let crowned = -1;
  const laid = [];
  if (crown) {
    if (crown.ceiling !== undefined) ceil = y + crown.ceiling;
    const kind = kinds[crown.part], yaw = crown.yaw || 0;
    const done = yield* drop(kind, crown.x, crown.z, yaw, 0, 0, crown.tilt ?? tilt);
    ceil = y + ceiling;
    if (done) {
      crowned = items.length;
      keepPiece(kind, crown.part, done);
    } else dropped++;
    // (with no place for the crown, the sheets are laid where it was asked to go, on what is there)
    const c = Math.cos(yaw), s = Math.sin(yaw), cx = done ? done.m.elements[12] : crown.x, cz = done ? done.m.elements[14] : crown.z;
    for (const [w, d, u, v, turn = 0] of crown.lay || []) laid.push(rest(w, d, cx + u * c + v * s, cz - u * s + v * c, yaw + turn));
    yield;
  }

  // Wet sheets strewn over the tops left bare: the highest boxes with nothing on them and a lid near
  // level, away from the crown and from each other, one sheet each, dropped anywhere on the lid at
  // any turn so long as it lies there whole (`margin` inside its edges), 1.5 mm over it. A sheet goes
  // down only where all four of its corners and its middle lie on that lid; a box too small for any
  // of the tries, or one with a neighbour leaning over it, is passed by. These draw from their own
  // rng, so the heap's seed still means the same heap.
  const strewn = [];
  if (strew && strew.count > 0) {
    const r2 = rng(seed * 31 + 7);
    const sizes = Array.isArray(strew.size[0]) ? strew.size : [strew.size], M = strew.margin ?? 0.012, apart = strew.apart ?? 0.3;
    const cx0 = crowned >= 0 ? items[crowned].elements[12] : null, cz0 = crowned >= 0 ? items[crowned].elements[14] : null;
    const bare = [];
    for (const P of pieces) {
      if (P.thin || P.index === undefined || P.index === crowned) continue;
      const k = P.kind, e = P.m.elements;
      if (e[5] < Math.cos(0.12)) continue;                       // a lid tipped too far
      const u = (k.min[0] + k.max[0]) / 2, v = (k.min[2] + k.max[2]) / 2, t = k.max[1];
      const wx = e[0] * u + e[4] * t + e[8] * v + e[12], wy = e[1] * u + e[5] * t + e[9] * v + e[13], wz = e[2] * u + e[6] * t + e[10] * v + e[14];
      if (Math.abs(surface(wx, wz) - wy) > 0.002) continue;       // something lies on it already
      bare.push({ P, u, v, t, wy });
    }
    bare.sort((p, q) => q.wy - p.wy);
    for (const b of bare) {
      if (strewn.length >= strew.count) break;
      const k = b.P.kind, e = b.P.m.elements;
      const bw = k.max[0] - k.min[0], bd = k.max[2] - k.min[2];
      const yawBox = Math.atan2(-e[2], e[0]);
      for (let tr = 0; tr < 6; tr++) {
        const [sw, sd] = sizes[(strewn.length + tr) % sizes.length];
        const rel = (r2() - 0.5) * 1.2, ou = (r2() - 0.5) * bw * 0.5, ov = (r2() - 0.5) * bd * 0.5;
        // the sheet's corners, in the lid's own frame, must stay M inside it
        const c = Math.cos(rel), s2 = Math.sin(rel);
        const fits = [[-sw / 2, -sd / 2], [sw / 2, -sd / 2], [-sw / 2, sd / 2], [sw / 2, sd / 2]].every(([a, d]) => {
          const lu = ou + a * c + d * s2, lv = ov - a * s2 + d * c;
          return Math.abs(lu) <= bw / 2 - M && Math.abs(lv) <= bd / 2 - M;
        });
        if (!fits) continue;
        const lu = b.u + ou, lv = b.v + ov;
        const px = e[0] * lu + e[4] * b.t + e[8] * lv + e[12], pz = e[2] * lu + e[6] * b.t + e[10] * lv + e[14];
        if (cx0 !== null && Math.hypot(px - cx0, pz - cz0) < apart) continue;
        if (strewn.some((q) => Math.hypot(px - q.m.elements[12], pz - q.m.elements[14]) < apart)) continue;
        const m = rest(sw, sd, px, pz, yawBox + rel, { remember: false });
        // every corner and the middle over this lid, a hair above it: nothing else under the sheet
        const me = m.elements;
        const ok = [[-sw / 2, -sd / 2], [sw / 2, -sd / 2], [-sw / 2, sd / 2], [sw / 2, sd / 2], [0, 0]].every(([a, d]) => {
          const qx = me[0] * a + me[8] * d + me[12], qy = me[1] * a + me[9] * d + me[13], qz = me[2] * a + me[10] * d + me[14];
          const col = column(b.P, qx, qz);
          return col && qy - col[1] > 0.0005 && qy - col[1] < 0.004;
        });
        if (!ok) continue;
        strewn.push({ m: rest(sw, sd, px, pz, yawBox + rel), size: [sw, sd] });
        break;
      }
    }
    yield;
  }

  // Which pieces have something lying on them: a piece bears another where the other's bottom
  // touches its top.
  const loaded = new Array(items.length).fill(false);
  for (const Q of pieces) {
    yield;
    const kq = Q.kind, e = Q.m.elements, ly = kq.min[1], N = HOLD_N;
    for (let a = 0; a < N; a++) {
      for (let b = 0; b < N; b++) {
        const u = kq.min[0] + (kq.max[0] - kq.min[0]) * a / (N - 1), v = kq.min[2] + (kq.max[2] - kq.min[2]) * b / (N - 1);
        const wx = e[0] * u + e[4] * ly + e[8] * v + e[12], wy = e[1] * u + e[5] * ly + e[9] * v + e[13], wz = e[2] * u + e[6] * ly + e[10] * v + e[14];
        let top = y, by = -1;
        for (const P of pieces) {
          if (P === Q || P.aabb.maxY <= top) continue;
          if (wx < P.aabb.minX || wx > P.aabb.maxX || wz < P.aabb.minZ || wz > P.aabb.maxZ) continue;
          const col = column(P, wx, wz);
          if (col && col[1] <= wy + 1e-4 && col[1] > top) { top = col[1]; by = P.index ?? -1; }
        }
        if (by >= 0 && wy - top < HOLD) loaded[by] = true;
      }
    }
  }
  return { items, variants, dropped, laid, strewn, crown: crowned, loaded, drawn, surface, rest };
}

// A cardboard box whose lid has sagged with the damp: the lid is cut into four, and only its
// centre vertex drops by `sag`, so it dips to a point; the rim and the sides stay true.
export function saggingBox(w, h, d, sag = 0.03) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < h / 2 - 1e-6) continue;
    const fx = 1 - Math.abs(pos.getX(i)) / (w / 2), fz = 1 - Math.abs(pos.getZ(i)) / (d / 2);
    pos.setY(i, pos.getY(i) - sag * fx * fz);
  }
  g.computeVertexNormals();
  return g;
}
