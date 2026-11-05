import test from "node:test";
import assert from "node:assert/strict";
import {POWER_SOURCES, newPower, throwPower} from "./power.js";
import {GATED} from "./fuses.js";
import {SWITCH_FLOORS} from "./switches.js";
import {KEYPAD_FLOORS} from "./keypad.js";

test("the power starts off and is thrown once, from L3 or L4", () => {
  const st = newPower(); assert.equal(st.on, false);
  const on = throwPower(st, "L3"); assert.deepEqual(on, {on: true, by: "L3"});
  assert.equal(throwPower(on, "L4"), null, "already on: a second throw changes nothing");
  assert.deepEqual(throwPower(newPower(), "L4"), {on: true, by: "L4"});
});
test("other floors have no power switch; bad input is refused; the input is never mutated", () => {
  const st = newPower(), frozen = JSON.stringify(st);
  for (const bad of ["B1", "L1", "L2", "", null, undefined, 3]) assert.equal(throwPower(st, bad), null);
  assert.equal(throwPower(null, "L3"), null);
  throwPower(st, "L3"); assert.equal(JSON.stringify(st), frozen);
});
test("the power floors are not puzzle floors", () => {
  for (const f of POWER_SOURCES) assert.ok(![...GATED, ...SWITCH_FLOORS, ...KEYPAD_FLOORS].includes(f), f);
});
