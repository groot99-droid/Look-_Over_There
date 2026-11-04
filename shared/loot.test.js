import test from "node:test";
import assert from "node:assert/strict";
import {LOOT, LOOT_FLOORS, GUN_ROUNDS, PACK_ROUNDS, MAX_ROUNDS, BEACONS, MAX_BEACONS, takeBeacon, beaconsLeft, newLoot, takeLocker, takePack, putBack, roundsAfterPack, lockersLeft, packsLeft} from "./loot.js";
import {GATED} from "./fuses.js";

test("every floor has ammo, only B1 has lockers, enough of them for a full room", () => {
  assert.deepEqual(LOOT_FLOORS, ["B1", "L1", "L2", "L3", "L4"]);
  for (const f of LOOT_FLOORS) assert.ok(LOOT[f].packs >= 3, f);
  assert.equal(LOOT.B1.lockers, 8); for (const f of ["L1", "L2", "L3", "L4"]) assert.equal(LOOT[f].lockers, 0);
  assert.equal(LOOT.L3.packs, 4, "L3 has no monsters: the place to restock");
  assert.equal(newLoot("nope"), null);
  const st = newLoot("B1"); assert.equal(lockersLeft(st), 8); assert.equal(packsLeft(st), 3);
});
test("a locker is opened once, by someone without a gun", () => {
  const st = newLoot("B1"), a = takeLocker(st, 2, 7, false);
  assert.equal(a.lockers[2], 7); assert.equal(st.lockers[2], 0, "the input is not changed");
  assert.equal(takeLocker(a, 2, 9, false), null, "already open");
  assert.equal(takeLocker(a, 3, 7, true), null, "already carrying a gun");
  for (const bad of [-1, 8, 1.5, "1", null, undefined]) assert.equal(takeLocker(st, bad, 7, false), null);
  for (const id of [0, -3, 1.5, null]) assert.equal(takeLocker(st, 0, id, false), null);
  assert.equal(takeLocker(newLoot("L1"), 0, 7, false), null, "no lockers there");
});
test("a pack is taken once, and refused when the player is full", () => {
  const st = newLoot("L2"), a = takePack(st, 0, 5, 0);
  assert.equal(a.packs[0], 5); assert.equal(takePack(a, 0, 6, 0), null);
  assert.equal(takePack(st, 1, 5, MAX_ROUNDS), null, "full");
  assert.ok(takePack(st, 1, 5, MAX_ROUNDS - 1), "one round of room is enough to take a pack");
  assert.equal(takePack(st, 9, 5, 0), null); assert.equal(takePack(null, 0, 5, 0), null);
});
test("rounds: a gun starts with 3, a pack adds 3, nobody carries more than 9", () => {
  assert.equal(GUN_ROUNDS, 3); assert.equal(PACK_ROUNDS, 3); assert.equal(MAX_ROUNDS, 9);
  assert.equal(roundsAfterPack(3), 6); assert.equal(roundsAfterPack(7), 9); assert.equal(roundsAfterPack(9), 9);
});
test("a player who leaves puts their locker back", () => {
  let st = newLoot("B1"); st = takeLocker(st, 0, 4, false); st = takeLocker(st, 1, 5, false);
  const back = putBack(st, 4); assert.deepEqual(back.lockers.slice(0, 2), [0, 5]);
  assert.equal(putBack(st, 99), null, "nothing to put back"); assert.equal(putBack(null, 4), null);
});
test("the loot floors are not changed by the puzzle rules", () => { assert.ok(GATED.every(f => LOOT_FLOORS.includes(f))); });
test("two beacons lie on every floor, taken once, and nobody carries more than two", () => {
  for (const f of LOOT_FLOORS) assert.equal(beaconsLeft(newLoot(f)), BEACONS);
  const st = newLoot("L1"), a = takeBeacon(st, 0, 7, 0);
  assert.equal(a.beacons[0], 7); assert.equal(st.beacons[0], 0, "the input is not changed");
  assert.equal(takeBeacon(a, 0, 9, 0), null, "already taken"); assert.equal(takeBeacon(st, 1, 7, MAX_BEACONS), null, "carrying the most");
  for (const bad of [-1, 2, 0.5, "0", null]) assert.equal(takeBeacon(st, bad, 7, 0), null);
  assert.equal(takeBeacon(st, 0, 0, 0), null);
});
