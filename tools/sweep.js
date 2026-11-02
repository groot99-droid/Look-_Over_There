// In-page reachability sweep: flood-fills outwards from the spawn with the game's own collision code and reports every reachable spot where the player would fall.
// Usage (browser console, game loaded):  await sweepScene()  ->  {cells, holes:[[x,z],...]}
window.sweepScene = async function (step = 0.5, maxCells = 400000, bounds = [-300, 300, -300, 300], start = null) {
  const g = window.__game, P = g.P, fl = g.S.floor;
  const seen = new Set(), holes = [], q = [], visited = new Set();
  const key = (i, j) => i + "," + j;
  g.teleport(start ? [start[0], fl, start[1]] : g.randomSpawn(g.S.id));
  const i0 = Math.round(P.p.x / step), j0 = Math.round(P.p.z / step);
  q.push([i0, j0]); seen.add(key(i0, j0)); visited.add(key(i0, j0));
  const settle = () => { P.v.set(0, 0, 0); for (let t = 0; t < 40; t++) { g.move(0, -0.3, 0); if (P.ground) break; } return P.p.y; };
  while (q.length && seen.size < maxCells) {
    const [i, j] = q.shift();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = key(ni, nj); if (seen.has(k)) continue; seen.add(k);
      if (ni * step < bounds[0] || ni * step > bounds[1] || nj * step < bounds[2] || nj * step > bounds[3]) continue;
      P.p.set(i * step, fl + 0.02, j * step); P.ground = true; settle();
      if (Math.abs(P.p.y - fl) > 0.5) continue;
      P.p.y = fl + 0.02; P.ground = true;
      g.move(di * step, 0, dj * step);
      if (Math.abs(P.p.x - ni * step) > 0.01 || Math.abs(P.p.z - nj * step) > 0.01) continue;      // blocked
      const y = settle();
      if (y < fl - 0.5) { holes.push([+(ni * step).toFixed(1), +(nj * step).toFixed(1)]); continue; }
      if (Math.abs(y - fl) <= 0.5) { q.push([ni, nj]); visited.add(key(ni, nj)); }
    }
  }
  return {cells: seen.size, reached: q.length === 0, holes, visited, has: (x, z) => visited.has(Math.round(x / step) + ',' + Math.round(z / step))};
};
