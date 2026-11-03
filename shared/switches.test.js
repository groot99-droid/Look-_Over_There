import test from "node:test";
import assert from "node:assert/strict";
import {NEED_SW, SWITCH_FLOORS, newSwitches, flip, swCount, swDone} from "./switches.js";
import {GATED} from "./fuses.js";

test("switches are flipped one at a time, in any order, and stay on", () => {
  let st = newSwitches();
  st = flip(st, 1); assert.equal(swCount(st), 1); assert.equal(swDone(st), false);
  assert.equal(flip(st, 1), null, "already on");
  st = flip(st, 0); assert.ok(swDone(st)); assert.equal(swCount(st), NEED_SW);
  assert.equal(flip(st, 0), null, "a finished floor takes no more moves");
});
test("bad input is refused and the input is never mutated", () => {
  const st = newSwitches(), frozen = JSON.stringify(st);
  for (const bad of [-1, 2, 9, "0", 0.5, undefined, null]) assert.equal(flip(st, bad), null);
  flip(st, 0); assert.equal(JSON.stringify(st), frozen);
});
test("a floor has fuses or switches, never both", () => {
  for (const f of SWITCH_FLOORS) assert.ok(!GATED.includes(f), f);
});
