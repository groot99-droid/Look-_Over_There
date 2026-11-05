import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {worldFromDoc, FLOORS, NW, NH, cellOf, cellXZ, nearestWalk, astar, mainRegion, segClear, rng32, near, NAV, stepDoors} from "./world.js";

const doc = id => JSON.parse(readFileSync(new URL(`../world/${id}.json`, import.meta.url)));
const worlds = {}; for (const id of Object.keys(FLOORS)) worlds[id] = worldFromDoc(doc(id), id);

// the old path-finder as it was in the page (a scan of the open list for the first smallest), to prove the heap finds the same paths
function astarScan(walk, a, b) {
  if (a < 0 || b < 0) return null;
  const open = [[0, a]], came = new Map([[a, -1]]), g = new Map([[a, 0]]); const [bx, bz] = cellXZ(b);
  const hx = c => { const [x, z] = cellXZ(c); return Math.hypot(x - bx, z - bz); }; let it = 0;
  while (open.length && it++ < 9000) {
    let mi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[mi][0]) mi = k;
    const [, c] = open.splice(mi, 1)[0];
    if (c === b) { const path = []; for (let q = c; q !== -1; q = came.get(q)) path.push(q); return path.reverse().map(cellXZ); }
    const ci = c % NW, cj = Math.floor(c / NW);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NW || j >= NH) continue;
      const n = j * NW + i; if (!walk[n]) continue; if (di && dj && (!walk[cj * NW + i] || !walk[j * NW + ci])) continue;
      const ng = g.get(c) + (di && dj ? 1.414 : 1) * NAV; if (!g.has(n) || ng < g.get(n)) { g.set(n, ng); came.set(n, c); open.push([ng + hx(n), n]); }
    }
  }
  return null;
}

test("every floor builds from its json with walkable space, doors and a main region", () => {
  for (const [id, W] of Object.entries(worlds)) {
    assert.equal(W.floor, FLOORS[id]); assert.ok(W.boxes.length >= 40, id); assert.ok(W.nav.reduce((a, b) => a + b, 0) > 500, id + " walkable cells");
    assert.ok(mainRegion(W).length > 500, id + " main region");
  }
  assert.ok(worlds.B1.doors.length > 0 && worlds.B1.doors.some(d => d.link), "B1 has doors, and a stair door");
  assert.ok(worlds.L4.shutter && worlds.L4.shutter.off === false, "L4's glass doors start shut");
  assert.ok(worldFromDoc(doc("L4"), "L4", {powerOn: true}).shutter.off === true);
});
test("the heap path-finder returns the very same paths as the scan it replaced", () => {
  const W = worlds.B1, cells = mainRegion(W), r = rng32(5); let same = 0, n = 0;
  for (let i = 0; i < 25; i++) {
    const a = cells[Math.floor(r() * cells.length)], b = cells[Math.floor(r() * cells.length)];
    const p = astar(W.nav, a, b), q = astarScan(W.nav, a, b); n++;
    assert.deepEqual(p, q); if (p) same++;
  }
  assert.ok(same > 15, `${same} of ${n} had a path`);
});
test("cells, nearest walkable cell, rays and doors behave", () => {
  const W = worlds.B1, c = mainRegion(W)[0], [x, z] = cellXZ(c);
  assert.equal(cellOf(x, z), c); assert.equal(nearestWalk(W.nav, x, z), c); assert.equal(cellOf(1e6, 0), -1);
  assert.ok(segClear(W, x, W.floor + 1.5, z, x + 0.1, W.floor + 1.5, z, 0), "a hair's breadth is clear");
  assert.ok(near(W, x, z, 1).size >= 1);
  const Wd = Object.values(worlds).find(w => w.doors.some(d => !d.link)), dr = Wd.doors.find(d => !d.link); assert.equal(dr.box.off, false); dr.target = 1; stepDoors(Wd, 0.1); assert.equal(dr.box.off, false); stepDoors(Wd, 0.2); assert.equal(dr.box.off, true, "half open lets things through");
  dr.target = 0; for (let i = 0; i < 4; i++) stepDoors(Wd, 0.05, () => true); assert.equal(dr.target, 1, "someone in the doorway keeps it open");
});
