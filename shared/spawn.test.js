import test from "node:test";
import assert from "node:assert/strict";
import {pick, weight, MON_CLEAR} from "./spawn.js";

const grid = []; for (let x = 0; x < 100; x += 2) for (let z = 0; z < 40; z += 2) grid.push([x, z]);
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const nearest = (c, goals) => Math.min(...goals.map(g => Math.hypot(c[0] - g[0], c[1] - g[1])));

test("a spot is never within 16 m of a monster, over many draws", () => {
  const mons = [[20, 20], [70, 10]], r = lcg(1);
  for (let i = 0; i < 1500; i++) { const c = pick(grid, [[10, 20]], mons, r); assert.ok(mons.every(m => Math.hypot(c[0] - m[0], c[1] - m[1]) >= MON_CLEAR), String(c)); }
});
test("spawns lean toward the objectives: the median distance is well under a uniform draw's", () => {
  const goals = [[10, 10], [60, 30]], r = lcg(7), med = a => a.sort((x, y) => x - y)[a.length >> 1];
  const biased = Array.from({length: 2000}, () => nearest(pick(grid, goals, [], r), goals));
  const uniform = Array.from({length: 2000}, () => nearest(pick(grid, [], [], r), goals));
  assert.ok(med(biased) < 0.75 * med(uniform), `${med(biased)} vs ${med(uniform)}`);
});
test("it is still random: many different cells are drawn, and far cells remain possible", () => {
  const r = lcg(3), seen = new Set(); let far = 0;
  for (let i = 0; i < 3000; i++) { const c = pick(grid, [[10, 10]], [], r); seen.add(c.join()); if (nearest(c, [[10, 10]]) > 50) far++; }
  assert.ok(seen.size > 200, String(seen.size)); assert.ok(far > 0);
});
test("no goals is uniform; a nearer cell weighs more; nothing is impossible", () => {
  assert.equal(weight([5, 5], []), 1);
  assert.ok(weight([1, 1], [[0, 0]]) > weight([40, 40], [[0, 0]])); assert.ok(weight([1e6, 1e6], [[0, 0]]) > 0);
});
test("an empty floor gives null, and a floor crowded with monsters still gives a spot", () => {
  assert.equal(pick([], [], []), null);
  const c = pick(grid, [], grid.filter((_, i) => i % 3 === 0), lcg(2)); assert.ok(Array.isArray(c));
});
