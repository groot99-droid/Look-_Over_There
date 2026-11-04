import test from "node:test";
import assert from "node:assert/strict";
import {active, lures, ringSpot, rollEnd, pulled, nearPlayer, LURE_M, ROLL_M, RING_MIN, RING_MAX, SAFE_M} from "./beacon.js";

const b = {x: 10, z: 10, until: 100};
test("it pulls monsters within 30 m while it runs, and none after", () => {
  assert.ok(active(b, 99.9) && !active(b, 100)); assert.ok(lures(b, 10 + LURE_M, 10, 50)); assert.ok(!lures(b, 10 + LURE_M + 0.1, 10, 50)); assert.ok(!lures(b, 11, 10, 100));
  assert.deepEqual(pulled(b, [{x: 12, z: 10}, {x: 80, z: 10}], 5).length, 1);
});
test("each monster gets its own spot on a 1.5 to 3 m ring", () => {
  const spots = Array.from({length: 8}, (_, k) => ringSpot(b, k));
  for (const [x, z] of spots) { const r = Math.hypot(x - b.x, z - b.z); assert.ok(r >= RING_MIN - 1e-9 && r <= RING_MAX + 1e-9, String(r)); }
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) assert.ok(Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1]) > 0.4, `${i} ${j}`);
});
test("a roll goes 12 m, or stops before a wall", () => {
  const [x, z] = rollEnd(0, 0, 1, 0, () => false); assert.ok(Math.abs(x - ROLL_M) < 0.3 && z === 0);
  const [wx] = rollEnd(0, 0, 1, 0, x => x > 5); assert.ok(wx <= 5 && wx > 4.5);
  assert.deepEqual(rollEnd(0, 0, 1, 0, () => true), [0, 0]);
});
test("a player within 4 m of a monster is still noticed", () => {
  assert.ok(nearPlayer({x: 0, z: 0}, [{x: SAFE_M, z: 0}])); assert.ok(!nearPlayer({x: 0, z: 0}, [{x: SAFE_M + 0.1, z: 0}])); assert.ok(!nearPlayer({x: 0, z: 0}, []));
});
