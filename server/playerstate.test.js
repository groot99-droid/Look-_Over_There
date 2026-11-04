import test from "node:test";
import assert from "node:assert/strict";
import {newPS, hit, tick, lift, gotLocker, gotPack, gotBeacon, shoot, throwBeacon, toggleCloak, view, changed, isDown, isImmune, canTakePack, canTakeBeacon, DOWNED_S, IMMUNE_S, THROW_GAP_S} from "./playerstate.js";

test("three hits down a player; the grace second and the gap protect; being down or immune takes no more", () => {
  const ps = newPS(); assert.ok(hit(ps, 35, 10)); assert.equal(view(ps).hp, 65); assert.ok(!hit(ps, 35, 10.5), "grace");
  assert.ok(hit(ps, 35, 11.2)); assert.ok(hit(ps, 35, 12.5)); assert.ok(isDown(ps)); assert.ok(!hit(ps, 35, 20), "already down");
  const imm = newPS(); imm.immUntil = 50; assert.ok(isImmune(imm, 49) && !hit(imm, 35, 49), "immune"); assert.ok(hit(imm, 35, 51));
});
test("regeneration after 10 s; a downed player gets up alone after 45 s with 100 HP and a few seconds of safety", () => {
  const ps = newPS(); hit(ps, 35, 0); tick(ps, 1, 5); assert.equal(view(ps).hp, 65); tick(ps, 1, 11); assert.equal(view(ps).hp, 66);
  const d = newPS(); hit(d, 50, 0); hit(d, 50, 2); assert.ok(isDown(d), "two hits of 50");
  assert.equal(tick(d, 1, 2 + DOWNED_S - 1), null); assert.equal(tick(d, 1, 2 + DOWNED_S), "respawn"); assert.equal(view(d).hp, 100); assert.ok(isImmune(d, 2 + DOWNED_S + IMMUNE_S - 0.1));
});
test("a teammate lifts a downed player to 50 HP; an upright one cannot be lifted", () => {
  const ps = newPS(); assert.ok(!lift(ps, 5)); hit(ps, 50, 0); hit(ps, 50, 2); hit(ps, 50, 4); assert.ok(lift(ps, 10)); assert.equal(view(ps).hp, 50); assert.ok(isImmune(ps, 12));
});
test("the locker gives the gun with 3 rounds and a cloak; packs add 3 to a cap of 9; shots cost a round and need their gap; no rounds, no shot", () => {
  const ps = newPS(); assert.ok(!shoot(ps, 1), "no gun"); gotLocker(ps); assert.deepEqual([ps.gun, ps.rounds, !!ps.cloak], [true, 3, true]);
  assert.ok(shoot(ps, 1)); assert.ok(!shoot(ps, 1.2), "the gap"); assert.ok(shoot(ps, 1.7)); assert.equal(ps.rounds, 1);
  gotPack(ps); gotPack(ps); gotPack(ps); gotPack(ps); assert.equal(ps.rounds, 9); assert.ok(!canTakePack(ps));
  const empty = newPS(); gotLocker(empty); empty.rounds = 0; assert.ok(!shoot(empty, 5), "out of rounds");
});
test("beacons: two at most, a throw needs one and a second between throws", () => {
  const ps = newPS(); assert.ok(!throwBeacon(ps, 1)); gotBeacon(ps); gotBeacon(ps); gotBeacon(ps); assert.equal(ps.beacons, 2); assert.ok(!canTakeBeacon(ps));
  assert.ok(throwBeacon(ps, 10)); assert.ok(!throwBeacon(ps, 10 + THROW_GAP_S - 0.1), "too soon"); assert.ok(throwBeacon(ps, 10 + THROW_GAP_S)); assert.equal(ps.beacons, 0);
});
test("the cloak: needs the locker, toggles, drains on the server's clock and switches itself off when flat; going down switches it off", () => {
  const ps = newPS(); assert.ok(!toggleCloak(ps)); gotLocker(ps); assert.ok(toggleCloak(ps)); assert.equal(view(ps).cloak.on, true);
  for (let t = 0; t < 16; t += 0.5) tick(ps, 0.5, 100 + t); assert.equal(view(ps).cloak.on, false); assert.equal(view(ps).cloak.b, 0);
  assert.ok(!toggleCloak(ps), "too flat to switch on");
  const d = newPS(); gotLocker(d); toggleCloak(d); hit(d, 50, 0); hit(d, 50, 2); hit(d, 50, 4); assert.equal(view(d).cloak.on, false);
});
test("changed() says so once per change", () => {
  const ps = newPS(); assert.ok(changed(ps)); assert.ok(!changed(ps)); gotLocker(ps); assert.ok(changed(ps)); assert.ok(!changed(ps));
});
