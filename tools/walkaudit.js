// In-page walkability audit. Usage (game loaded, scene resident):  walkAudit() -> {unreachable:[{area, at, near:[sources]}], tight:[{at, near}]}
// Grid of 0.25 m cells; a cell is open for a walker of radius r when no collider overlaps its footprint between knee and head height.
window.walkAudit = function (opts = {}) {
  const g = window.__game, S = g.S, fl = S.floor, step = 0.25;
  const open = (r) => (x, z) => {
    for (const id of g.near ? g.near(x, z, r + 1) : []) {}
    return true;
  };
  const boxes = g.boxes.filter(b => !b.door || b.link);
  const doorsOpen = g.boxes.filter(b => b.door && !b.link);
  const cell = 4, idx = new Map();
  boxes.forEach((b, i) => { for (let a = Math.floor(b.n[0] / cell); a <= Math.floor(b.x[0] / cell); a++) for (let c = Math.floor(b.n[2] / cell); c <= Math.floor(b.x[2] / cell); c++) { const k = a + "," + c; (idx.get(k) || idx.set(k, []).get(k)).push(i); } });
  const local = (x, z, r) => { const out = []; for (let a = Math.floor((x - r) / cell); a <= Math.floor((x + r) / cell); a++) for (let c = Math.floor((z - r) / cell); c <= Math.floor((z + r) / cell); c++) for (const i of idx.get(a + "," + c) || []) out.push(boxes[i]); return out; };
  const srcOf = new Map(); S.colliders.forEach((c, i) => srcOf.set(g.boxes[i], c.s));
  let ignore = null;
  const blocker = (x, z, r) => { for (const b of local(x, z, r)) if (!(ignore && ignore.test(srcOf.get(b) || '')) && (x + r > b.n[0] && x - r < b.x[0] && z + r > b.n[2] && z - r < b.x[2] && b.n[1] < fl + 1.6 && b.x[1] > fl + 0.45)) return b; return null; };
  const ground = (x, z) => { for (const b of local(x, z, 0.1)) if (x > b.n[0] && x < b.x[0] && z > b.n[2] && z < b.x[2] && b.x[1] >= fl - 0.15 && b.x[1] <= fl + 0.2 && b.n[1] < fl) return true; return false; };
  const bounds = opts.bounds || [-60, 60, -60, 60];
  const reach = (r, start) => {
    const seen = new Set(), q = [start], key = (i, j) => i + "," + j; seen.add(key(...start));
    while (q.length) { const [i, j] = q.shift(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj, k = key(ni, nj); if (seen.has(k)) continue; const x = ni * step, z = nj * step; if (x < bounds[0] || x > bounds[1] || z < bounds[2] || z > bounds[3]) continue; if (!ground(x, z) || blocker(x, z, r)) continue; seen.add(k); q.push([ni, nj]); } }
    return seen;
  };
  const sp = opts.start ? [opts.start[0], 0, opts.start[1]] : g.randomSpawn(S.id); const start = [Math.round(sp[0] / step), Math.round(sp[2] / step)];
  const r0 = reach(0.28, start), r1 = reach(opts.tightR || 0.4, start);
  // every ground cell the walker could stand on (clear of blockers) but cannot get to
  const all = new Set(); for (let i = Math.floor(bounds[0] / step); i <= bounds[1] / step; i++) for (let j = Math.floor(bounds[2] / step); j <= bounds[3] / step; j++) { const x = i * step, z = j * step; if (ground(x, z) && !blocker(x, z, 0.28)) all.add(i + "," + j); }
  const cluster = (set) => { const left = new Set(set), out = []; while (left.size) { const first = left.values().next().value; const comp = [], q = [first]; left.delete(first); while (q.length) { const k = q.pop(); comp.push(k); const [i, j] = k.split(",").map(Number); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (i + di) + "," + (j + dj); if (left.has(n)) { left.delete(n); q.push(n); } } } out.push(comp); } return out; };
  const near = (comp) => { const m = new Map(); for (const k of comp.slice(0, 80)) { const [i, j] = k.split(",").map(Number); for (const dx of [-0.6, 0, 0.6]) for (const dz of [-0.6, 0, 0.6]) { const b = blocker(i * step + dx, j * step + dz, 0.4); if (b) m.set(srcOf.get(b) || "?", (m.get(srcOf.get(b) || "?") || 0) + 1); } } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]); };
  ignore = /prop|furnish|extra|detail/i;                                    // what the walker could reach if every prop were gone
  const rFree = reach(0.28, start); ignore = null;
  const viaProps = cluster([...rFree].filter(k => !r0.has(k) && all.has(k))).filter(c => c.length >= 4).map(c => { const [i, j] = c[0].split(",").map(Number); return {cells: c.length, area: +(c.length * step * step).toFixed(1), at: [i * step, j * step], near: near(c)}; }).sort((a, b) => b.cells - a.cells);
  const unreachable = cluster([...all].filter(k => !r0.has(k))).filter(c => c.length * step * step >= 2).map(c => { const [i, j] = c[0].split(",").map(Number); return {area: +(c.length * step * step).toFixed(1), at: [i * step, j * step], near: near(c)}; }).sort((a, b) => b.area - a.area);
  const tightCells = [...r0].filter(k => !r1.has(k));
  const tight = cluster(tightCells).filter(c => c.length >= 3).map(c => { const [i, j] = c[0].split(",").map(Number); return {cells: c.length, at: [i * step, j * step], near: near(c)}; }).sort((a, b) => b.cells - a.cells);
  const isProp = (n) => /prop|furn|extra|detail|cabinet|desk|shelf|cart|car/i.test(n);
  const tightProps = tight.filter(t => t.near.some(isProp));
  return {reachSet: opts.keep ? r0 : null, blockedByProps: viaProps.slice(0, 30), tightProps: tightProps.slice(0, 30), reachableM2: +(r0.size * step * step).toFixed(0), unreachable: unreachable.slice(0, 25), tight: tight.slice(0, 25), tightCount: tight.length};
};
