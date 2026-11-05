import test from "node:test";
import assert from "node:assert/strict";
import {CODE_LEN, LOCK_MS, KEYPAD_FLOORS, newKeypad, view, foundCount, find, tryCode} from "./keypad.js";
import {GATED} from "./fuses.js";
import {SWITCH_FLOORS} from "./switches.js";

const fixed = (...d) => { let k = 0; return () => (d[k++ % d.length] + 0.5) / 10; };           // a random source that yields these digits
test("a client's view never contains a digit that has not been found", () => {
  const st = newKeypad(fixed(1, 2, 3, 4)); assert.deepEqual(st.code, [1, 2, 3, 4]);
  assert.deepEqual(view(st, 0).found, [null, null, null, null]);
  const v = view(find(find(st, 2), 0), 0);
  assert.deepEqual(v.found, [1, null, 3, null]);
  assert.ok(!("code" in v), "the code itself is not part of the view");
  assert.equal(foundCount(v), 2);
});
test("a note is read once; bad indexes are refused; the input is never mutated", () => {
  const st = newKeypad(fixed(5)), frozen = JSON.stringify(st);
  const one = find(st, 1); assert.ok(one); assert.equal(find(one, 1), null);
  for (const bad of [-1, CODE_LEN, 1.5, "0", null, undefined]) assert.equal(find(st, bad), null);
  assert.equal(JSON.stringify(st), frozen);
});
test("the right code opens it, from any state of the notes", () => {
  const st = newKeypad(fixed(0, 7, 0, 9));                                                   // leading zeros count
  const r = tryCode(st, "0709", 1000); assert.ok(r.ok && r.st.solved);
  assert.equal(find(r.st, 0), null, "nothing more to find once it is open");
  assert.equal(tryCode(r.st, "0709", 2000).st, null, "and nothing more to type");
});
test("a wrong code is a fail and locks the keypad; while locked nothing happens, then it works again", () => {
  const st = newKeypad(fixed(1, 2, 3, 4));
  const bad = tryCode(st, "1111", 1000); assert.ok(!bad.ok && bad.st.fails === 1 && bad.st.lockUntil === 1000 + LOCK_MS);
  assert.equal(view(bad.st, 1000).lockMs, LOCK_MS);
  const during = tryCode(bad.st, "1234", 1000 + LOCK_MS - 1); assert.ok(during.locked && during.st === null, "even the right code is refused while locked");
  const after = tryCode(bad.st, "1234", 1000 + LOCK_MS); assert.ok(after.ok);
  assert.equal(view(bad.st, 1000 + LOCK_MS + 5).lockMs, 0);
});
test("input that is not a code of the right length is ignored, not counted as a fail", () => {
  const st = newKeypad(fixed(1, 2, 3, 4));
  for (const bad of ["", "123", "12345", "12a4", 1234, null, undefined, "١٢٣٤"]) assert.deepEqual(tryCode(st, bad, 0), {st: null, ok: false, locked: false});
});
test("codes are four digits 0 to 9, and a floor has one puzzle kind", () => {
  for (let k = 0; k < 50; k++) assert.ok(newKeypad().code.every(d => Number.isInteger(d) && d >= 0 && d <= 9));
  for (const f of KEYPAD_FLOORS) assert.ok(!GATED.includes(f) && !SWITCH_FLOORS.includes(f), f);
});
