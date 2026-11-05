import test from "node:test";
import assert from "node:assert/strict";
import {NEED, GATED, newFloor, act, carrying, unlocked, slotted} from "./fuses.js";

test("a player carries one fuse at a time", () => {
  let st = newFloor();
  st = act(st, 7, {a: "take", i: 0}); assert.equal(carrying(st, 7), 0);
  assert.equal(act(st, 7, {a: "take", i: 1}), null, "already carrying");
  assert.equal(act(st, 8, {a: "take", i: 0}), null, "already taken");
  assert.equal(carrying(act(st, 8, {a: "take", i: 1}), 8), 1, "someone else takes another");
});
test("slotting needs a carried fuse; three slotted unlock the door", () => {
  let st = newFloor();
  assert.equal(act(st, 1, {a: "slot"}), null, "nothing to slot");
  for (let i = 0; i < NEED; i++) { st = act(st, 1, {a: "take", i}); st = act(st, 1, {a: "slot"}); assert.equal(slotted(st), i + 1); }
  assert.ok(unlocked(st));
  assert.equal(act(st, 1, {a: "take", i: 0}), null, "an unlocked floor is finished");
});
test("a dropped fuse lies where it fell and can be picked up again", () => {
  let st = act(newFloor(), 1, {a: "take", i: 2});
  st = act(st, 1, {a: "drop", x: 4.5, z: -2});
  assert.deepEqual(st[2], {s: 3, x: 4.5, z: -2});
  assert.equal(act(st, 1, {a: "drop", x: 1, z: 1}), null, "nothing carried");
  assert.equal(carrying(act(st, 2, {a: "take", i: 2}), 2), 2);
  assert.equal(act(st, 1, {a: "drop", x: NaN, z: 0}), null);
});
test("a carrier who leaves puts the fuse back at its start; the input is never mutated", () => {
  const st0 = act(newFloor(), 5, {a: "take", i: 1}), frozen = JSON.stringify(st0);
  const st1 = act(st0, 5, {a: "release"});
  assert.deepEqual(st1[1], {s: 0});
  assert.equal(JSON.stringify(st0), frozen);
  assert.equal(act(st1, 5, {a: "release"}), null);
});
test("bad input is refused", () => {
  const st = newFloor();
  for (const bad of [{a: "take", i: 9}, {a: "take", i: "0"}, {a: "take"}, {a: "nope"}, {}]) assert.equal(act(st, 1, bad), null);
  assert.ok(GATED.includes("B1") && !GATED.includes("L3"));
});
