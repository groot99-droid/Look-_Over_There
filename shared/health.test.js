import test from "node:test";
import assert from "node:assert/strict";
import {MAX_HP, HIT_DMG, GRACE, REGEN_DELAY, REVIVE_HP, newHealth, hurt, regen, revived, downed, mayHit, HIT_GAP} from "./health.js";

test("three hits down you, and a hit inside the grace second does nothing", () => {
  let h = newHealth(); assert.equal(h.hp, MAX_HP);
  h = hurt(h, HIT_DMG, 10); assert.equal(h.hp, 65);
  assert.equal(hurt(h, HIT_DMG, 10.5), null, "grace");
  assert.equal(hurt(h, HIT_DMG, 10 + GRACE - 0.01), null);
  h = hurt(h, HIT_DMG, 11.2); assert.equal(h.hp, 30); assert.ok(!downed(h));
  h = hurt(h, HIT_DMG, 12.5); assert.equal(h.hp, 0); assert.ok(downed(h));
});
test("bad damage is ignored and hp never goes below 0 or the damage above the maximum", () => {
  const h = newHealth();
  for (const d of [0, -5, NaN, undefined, "x"]) assert.equal(hurt(h, d, 5), null);
  assert.equal(hurt({hp: 10, hurtAt: -Infinity}, 50, 5).hp, 0);
  assert.equal(hurt(h, 1e9, 5).hp, 0);
  assert.equal(h.hp, MAX_HP, "the input is not changed");
});
test("regeneration waits 10 s, then +1 per second up to the maximum", () => {
  let h = hurt(newHealth(), HIT_DMG, 0);
  assert.equal(regen(h, REGEN_DELAY - 0.1, 1).hp, 65, "too early");
  h = regen(h, REGEN_DELAY + 0.1, 1); assert.equal(h.hp, 66);
  for (let t = REGEN_DELAY + 1; t < REGEN_DELAY + 100; t++) h = regen(h, t, 1);
  assert.equal(h.hp, MAX_HP);
  assert.equal(regen({hp: 0, hurtAt: 0}, 100, 1).hp, 0, "a downed player does not regenerate");
  const hit = hurt(h, HIT_DMG, 200); assert.equal(regen(hit, 205, 1).hp, 65, "a new hit restarts the wait");
});
test("a lifted player returns with 50 and waits again", () => {
  const h = revived(100); assert.equal(h.hp, REVIVE_HP);
  assert.equal(regen(h, 105, 1).hp, REVIVE_HP); assert.equal(regen(h, 110.5, 1).hp, REVIVE_HP + 1);
});
test("a monster hits again only after its gap", () => {
  assert.ok(mayHit(undefined, 0)); assert.ok(!mayHit(5, 5 + HIT_GAP - 0.01)); assert.ok(mayHit(5, 5 + HIT_GAP));
});
