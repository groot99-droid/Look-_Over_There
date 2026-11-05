// Where a player appears: a random walkable spot, more likely near an objective that is not done yet, and never close to a monster.
// Pure: cells and goals are [x, z] pairs; rnd is a () => [0,1) source (each player draws their own).
export const MON_CLEAR = 16, NEAR_M = 15, FLOOR_W = 0.02;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// weight of one cell: exp(-d/NEAR_M) with d the distance to the nearest goal, plus a small floor so no cell is impossible; 1 when there are no goals
export const weight = (cell, goals) => goals.length ? Math.exp(-Math.min(...goals.map(g => dist(cell, g))) / NEAR_M) + FLOOR_W : 1;
// Returns an [x, z] from cells, or null if there are none. Cells within MON_CLEAR of a monster are left out (unless that leaves nothing: then the
// farthest-from-monsters tenth is used, so a crowded floor still gives a spot).
export function pick(cells, goals, monsters, rnd = Math.random) {
  if (!cells.length) return null;
  let ok = cells.filter(c => monsters.every(m => dist(c, m) >= MON_CLEAR));
  if (!ok.length) {
    const far = cells.map(c => [Math.min(...monsters.map(m => dist(c, m))), c]).sort((a, b) => b[0] - a[0]);
    ok = far.slice(0, Math.max(1, Math.ceil(far.length / 10))).map(x => x[1]);
  }
  const w = ok.map(c => weight(c, goals)), total = w.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < ok.length; i++) { r -= w[i]; if (r <= 0) return ok[i]; }
  return ok[ok.length - 1];
}
