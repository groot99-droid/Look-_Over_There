// Guns and ammo. Each player may carry one gun, found in a locker on B1 (a locker is opened once); ammo packs lie on every floor and are taken once.
// A gun starts with GUN_ROUNDS, a pack adds PACK_ROUNDS, and nobody carries more than MAX_ROUNDS. Shared by the server (rooms) and the game (solo play).
// AFK Beacons lie on every floor too (BEACONS each), taken once, at most MAX_BEACONS carried. A locker also holds a cloak: whoever opens it gets both.
// A floor's state is {lockers: [0|id], packs: [0|id], beacons: [0|id]}: 0 = still there, otherwise the id of the player who took it.
export const LOOT = {B1: {lockers: 8, packs: 3}, L1: {lockers: 0, packs: 3}, L2: {lockers: 0, packs: 3}, L3: {lockers: 0, packs: 4}, L4: {lockers: 0, packs: 3}};
export const GUN_ROUNDS = 3, PACK_ROUNDS = 3, MAX_ROUNDS = 9, BEACONS = 2, MAX_BEACONS = 2;
export const LOOT_FLOORS = Object.keys(LOOT);
export const newLoot = scene => LOOT[scene] ? {lockers: Array(LOOT[scene].lockers).fill(0), packs: Array(LOOT[scene].packs).fill(0), beacons: Array(BEACONS).fill(0)} : null;
const ok = (st, kind, i) => !!st && Array.isArray(st[kind]) && Number.isInteger(i) && i >= 0 && i < st[kind].length && st[kind][i] === 0;
// Each returns the new floor state, or null when it is not allowed. They never mutate st.
export function takeLocker(st, i, id, armed) {                       // armed: this player already carries a gun
  if (armed || !Number.isInteger(id) || id <= 0 || !ok(st, "lockers", i)) return null;
  const lockers = st.lockers.slice(); lockers[i] = id; return {...st, lockers};
}
export function takePack(st, i, id, rounds) {                        // rounds: what this player carries now (a pack is refused when they are full)
  if (!Number.isInteger(id) || id <= 0 || !(rounds >= 0) || rounds >= MAX_ROUNDS || !ok(st, "packs", i)) return null;
  const packs = st.packs.slice(); packs[i] = id; return {...st, packs};
}
export function takeBeacon(st, i, id, have) {                         // have: beacons this player carries now (refused when they hold MAX_BEACONS)
  if (!Number.isInteger(id) || id <= 0 || !(have >= 0) || have >= MAX_BEACONS || !ok(st, "beacons", i)) return null;
  const beacons = st.beacons.slice(); beacons[i] = id; return {...st, beacons};
}
export function putBack(st, id) {                                    // a player who leaves takes their gun with them, so their locker opens again
  if (!st || !st.lockers.includes(id)) return null;
  return {...st, lockers: st.lockers.map(v => v === id ? 0 : v)};
}
export const roundsAfterPack = rounds => Math.min(MAX_ROUNDS, rounds + PACK_ROUNDS);
export const lockersLeft = st => st ? st.lockers.filter(v => v === 0).length : 0;
export const packsLeft = st => st ? st.packs.filter(v => v === 0).length : 0;
export const beaconsLeft = st => st ? st.beacons.filter(v => v === 0).length : 0;
