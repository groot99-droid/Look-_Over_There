// The world's rules that need no graphics: boxes, the spatial grid, doors, the navigation grid, path-finding, rays. Used by the game page (solo play and
// rendering) and by the server (which runs the monsters). A world W is {id, floor, boxes, grid, doors, nav, shutter}; the page's `S` object already has this shape.
import {REGISTRY} from "./registry.js";
export const NAV = 0.5, NX0 = -27, NZ0 = -24, NW = Math.ceil(54 / NAV), NH = Math.ceil(54 / NAV), CELL = 8;
export const FLOORS = REGISTRY.floors;          // each scene's floor height: the multiplayer scenes of the world manifest (shared/farway.manifest.js)
export const rng32 = seed => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

const key = (i, k) => i + "," + k;
export const newWorld = (id, floor = FLOORS[id]) => ({id, floor, boxes: [], grid: new Map(), doors: [], nav: null, shutter: null});
// the grid that makes `near` cheap: which boxes touch each 8 m cell
export function indexBoxes(W) {
  W.grid = new Map();
  W.boxes.forEach((b, i) => {
    for (let a = Math.floor(b.n[0] / CELL); a <= Math.floor(b.x[0] / CELL); a++)
      for (let k = Math.floor(b.n[2] / CELL); k <= Math.floor(b.x[2] / CELL); k++) { const kk = key(a, k); if (!W.grid.has(kk)) W.grid.set(kk, []); W.grid.get(kk).push(i); }
  });
}
export function near(W, x, z, r) {
  const out = new Set();
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
    for (let k = Math.floor((z - r) / CELL); k <= Math.floor((z + r) / CELL); k++) (W.grid.get(key(i, k)) || []).forEach(id => out.add(id));
  return out;
}
// a world from world/<id>.json (the server's way; the page builds the same boxes itself and adds its doors' leaves): colliders, doors and the L4 shutter
export function worldFromDoc(doc, id, {powerOn = false} = {}) {
  const W = newWorld(id);
  for (const c of doc.colliders) W.boxes.push({n: c.min, x: c.max});
  for (const d of doc.doors || []) {
    const th = d.closed_yaw_deg * Math.PI / 180, dir = [Math.cos(th), -Math.sin(th)];
    const hx = d.hinge[0], hy = d.hinge[1], hz = d.hinge[2], w = d.width, tx = Math.abs(dir[0]) < .5 ? .07 : 0, tz = Math.abs(dir[1]) < .5 ? .07 : 0;
    const box = {n: [Math.min(hx, hx + dir[0] * w) - tx, hy, Math.min(hz, hz + dir[1] * w) - tz],
                 x: [Math.max(hx, hx + dir[0] * w) + tx, hy + (d.height || 2.1), Math.max(hz, hz + dir[1] * w) + tz], door: true, off: false, link: !!d.link};
    W.boxes.push(box); W.doors.push({d, box, p: 0, target: 0, link: d.link || null, cx: hx + dir[0] * w / 2, cz: hz + dir[1] * w / 2, cy: hy, dir, th});
  }
  if (id === "L4") { W.shutter = {n: [-2.7, 9.6, 27.0], x: [2.7, 13.0, 27.5], off: !!powerOn}; W.boxes.push(W.shutter); }       // the store's glass doors: shut until the power is on
  indexBoxes(W); W.nav = buildNav(W, W.floor);
  return W;
}
// a door opens or closes over 0.36 s; its box lets things through once it is half open
export function stepDoors(W, dt, busy = () => false) {
  for (const dr of W.doors) {
    if (dr.p === dr.target) continue;
    dr.p = dr.target > dr.p ? Math.min(dr.target, dr.p + dt * 2.8) : Math.max(dr.target, dr.p - dt * 2.8);
    dr.box.off = dr.p > 0.5;
    if (dr.target === 0 && dr.p > 0 && dr.box.off && busy(dr)) dr.target = 1;                    // somebody stepped into the doorway: it stays open
  }
}

// ---- the navigation grid: monsters walk the same colliders the player does; doors are passable for them
export function buildNav(W, fy) {
  const walk = new Uint8Array(NW * NH);
  for (let j = 0; j < NH; j++) for (let i = 0; i < NW; i++) {
    const x = NX0 + (i + .5) * NAV, z = NZ0 + (j + .5) * NAV;
    let ground = false, blocked = false;
    for (const id of near(W, x, z, 0.6)) {
      const b = W.boxes[id]; if ((b.door && !b.link) || b.off) continue;
      if (x >= b.n[0] && x <= b.x[0] && z >= b.n[2] && z <= b.x[2] && b.x[1] >= fy - 0.15 && b.x[1] <= fy + 0.15 && b.n[1] < fy) ground = true;
      if (x + 0.4 > b.n[0] && x - 0.4 < b.x[0] && z + 0.4 > b.n[2] && z - 0.4 < b.x[2] && b.n[1] < fy + 1.7 && b.x[1] > fy + 0.35) { blocked = true; break; }
    }
    walk[j * NW + i] = ground && !blocked && !(W.id === "L4" && z > 27.6) ? 1 : 0;       // the parking lot is safe: monsters do not leave the store
  }
  return walk;
}
export const cellOf = (x, z) => { const i = Math.floor((x - NX0) / NAV), j = Math.floor((z - NZ0) / NAV); return (i >= 0 && j >= 0 && i < NW && j < NH) ? j * NW + i : -1; };
export const cellXZ = c => [NX0 + ((c % NW) + .5) * NAV, NZ0 + (Math.floor(c / NW) + .5) * NAV];
export function nearestWalk(walk, x, z) {
  const c = cellOf(x, z); if (c >= 0 && walk[c]) return c;
  for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = Math.floor((x - NX0) / NAV) + di, j = Math.floor((z - NZ0) / NAV) + dj;
    if (i >= 0 && j >= 0 && i < NW && j < NH && walk[j * NW + i]) return j * NW + i;
  }
  return -1;
}
// A*: a binary heap ordered by (estimated total, insertion order), which picks exactly what a scan of the open list for the first smallest would, only faster. Returns [x, z] points or null.
export function astar(walk, a, b) {
  if (a < 0 || b < 0) return null;
  const heap = [], came = new Map([[a, -1]]), g = new Map([[a, 0]]); let seq = 0;
  const less = (p, q) => p[0] < q[0] || (p[0] === q[0] && p[2] < q[2]);
  const push = it => { let i = heap.length; heap.push(it); while (i > 0) { const par = (i - 1) >> 1; if (!less(heap[i], heap[par])) break; [heap[i], heap[par]] = [heap[par], heap[i]]; i = par; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  const [bx, bz] = cellXZ(b), hx = c => { const [x, z] = cellXZ(c); return Math.hypot(x - bx, z - bz); };
  push([0, a, seq++]); let it = 0;
  while (heap.length && it++ < 9000) {
    const [, c] = pop();
    if (c === b) { const path = []; for (let q = c; q !== -1; q = came.get(q)) path.push(q); return path.reverse().map(cellXZ); }
    const ci = c % NW, cj = Math.floor(c / NW);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NW || j >= NH) continue;
      const n = j * NW + i; if (!walk[n]) continue;
      if (di && dj && (!walk[cj * NW + i] || !walk[j * NW + ci])) continue;
      const ng = g.get(c) + (di && dj ? 1.414 : 1) * NAV;
      if (!g.has(n) || ng < g.get(n)) { g.set(n, ng); came.set(n, c); push([ng + hx(n), n, seq++]); }
    }
  }
  return null;
}

// ---- rays: sight and shots are blocked by any box more than 0.6 m thick that is not an open door
const blocks = (b, x, y, z) => !b.off && x > b.n[0] && x < b.x[0] && z > b.n[2] && z < b.x[2] && y > b.n[1] && y < b.x[1] && b.x[1] - b.n[1] > 0.6;
export function segClear(W, ax, ay, az, bx, by, bz, skip = 1.0) {
  const d = Math.hypot(bx - ax, bz - az), steps = Math.ceil(d / 0.3);
  for (let k = 1; k < steps; k++) {
    const u = k / steps; if (u * d < skip) continue;
    const x = ax + (bx - ax) * u, z = az + (bz - az) * u, y = ay + (by - ay) * u;
    for (const id of near(W, x, z, 0.2)) if (blocks(W.boxes[id], x, y, z)) return false;
  }
  return true;
}
// a monster's line of sight to a player {x, y, z}: from its eye (1.6 m) to the player's chest
export function los(W, ex, ey, ez, t) {
  const px = t.x, pz = t.z, py = t.y + 1.4, d = Math.hypot(px - ex, pz - ez), steps = Math.ceil(d / 0.3);
  for (let s = 1; s < steps; s++) {
    const u = s / steps, x = ex + (px - ex) * u, z = ez + (pz - ez) * u, y = ey + (py - ey) * u;
    for (const id of near(W, x, z, 0.2)) if (blocks(W.boxes[id], x, y, z)) return false;
  }
  return true;
}
export function rayClear(W, o, d, t) {
  for (let u = 0.3; u < t; u += 0.25) {
    const x = o[0] + d[0] * u, y = o[1] + d[1] * u, z = o[2] + d[2] * u;
    for (const id of near(W, x, z, 0.2)) if (blocks(W.boxes[id], x, y, z)) return false;
  }
  return true;
}

// ---- where things can be: the biggest connected walkable area, and random spots in it
export function mainRegion(W) {
  const walk = W.nav, seen = new Uint8Array(NW * NH); let cells = [];
  if (!walk) return cells;
  for (let c0 = 0; c0 < NW * NH; c0++) {                                       // flood-fill each region in index order; keep the biggest
    if (!walk[c0] || seen[c0]) continue;
    const stack = [c0], reg = []; seen[c0] = 1;
    while (stack.length) {
      const c = stack.pop(); reg.push(c); const ci = c % NW, cj = (c / NW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NW || j >= NH) continue;
        const n = j * NW + i; if (seen[n] || !walk[n]) continue;
        if (di && dj && (!walk[cj * NW + i] || !walk[j * NW + ci])) continue;
        seen[n] = 1; stack.push(n);
      }
    }
    if (reg.length > cells.length) cells = reg;
  }
  return cells;
}
export function pickSpots(W, count, rnd, avoid = [], minGap = 9) {
  const walk = W.nav, out = []; let tries = 0;
  while (out.length < count && tries++ < 6000) {
    const c = Math.floor(rnd() * NW * NH); if (!walk[c]) continue;
    const [x, z] = cellXZ(c);
    if (W.doors.some(dr => dr.link && Math.hypot(x - dr.cx, z - dr.cz) < 4)) continue;
    if (out.some(o => Math.hypot(x - o[0], z - o[1]) < minGap)) continue;
    if (avoid.some(o => Math.hypot(x - o[0], z - o[1]) < 16)) continue;
    out.push([x, z]);
  }
  return out;
}
