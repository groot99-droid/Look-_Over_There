import test from "node:test";
import assert from "node:assert/strict";
import {newCloak, toggle, tick, MIN_ON, DRAIN_S, RECHARGE_S, RECHARGE_DELAY, seenFrom, SHORT_M, shortCircuit, broken, BROKEN_S, STUN_R, STUN_S} from "./cloak.js";

test("on drains about 15 s and then switches itself off", () => {
  let c = toggle(newCloak()); assert.ok(c.on);
  for (let t = 0; t < DRAIN_S - 0.5; t += 0.5) c = tick(c, 0.5); assert.ok(c.on && c.b < 0.05, JSON.stringify(c));
  for (let t = 0; t < 2; t += 0.5) c = tick(c, 0.5); assert.ok(!c.on && c.b === 0);
});
test("off recharges slowly after a short wait, never above 1", () => {
  let c = {on: false, b: 0, idle: 0};
  c = tick(c, RECHARGE_DELAY - 0.5); assert.equal(c.b, 0, "waits first");
  for (let t = 0; t < 10; t += 0.5) c = tick(c, 0.5); assert.ok(c.b > 0.15 && c.b < 0.25, String(c.b));
  for (let t = 0; t < RECHARGE_S * 2; t += 1) c = tick(c, 1); assert.equal(c.b, 1);
});
test("it cannot switch on below 10%, can always switch off, and turning off restarts the wait", () => {
  assert.ok(!toggle({on: false, b: MIN_ON - 0.01, idle: 9}).on); assert.ok(toggle({on: false, b: MIN_ON, idle: 0}).on);
  const off = toggle({on: true, b: 0.5, idle: 0}); assert.ok(!off.on && off.idle === 0);
});
test("a cloaked player is seen only from very close", () => {
  assert.ok(seenFrom(false, 20)); assert.ok(!seenFrom(true, SHORT_M + 0.1)); assert.ok(seenFrom(true, SHORT_M));
});

test("short circuit: the cloak is dead for 5 minutes (no switching on, no recharge), then it works again from empty", () => {
  let c = toggle(newCloak()); assert.ok(c.on); c = shortCircuit(c); assert.ok(broken(c) && !c.on && c.b === 0 && c.broken === BROKEN_S);
  assert.equal(shortCircuit(c), c, "it cannot be short-circuited twice"); assert.equal(toggle(c), c, "it cannot be switched on while dead");
  for (let t = 0; t < BROKEN_S - 1; t += 1) c = tick(c, 1); assert.ok(broken(c) && c.b === 0, "still dead after 299 s");
  c = tick(c, 2); assert.ok(!broken(c) && c.b === 0, "alive again, empty"); for (let t = 0; t < 10; t += 1) c = tick(c, 1); assert.ok(c.b > 0, "it recharges once it is working again");
  assert.deepEqual([STUN_R, STUN_S, BROKEN_S], [8, 5, 300]);
});
