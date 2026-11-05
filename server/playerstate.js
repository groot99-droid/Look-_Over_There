// What the server knows about each player that a client must not decide for itself: health, ammunition, cloak battery, beacons, and the down/respawn timers.
// Pure functions over a state object and a clock (seconds); the rules themselves are in shared/health.js, cloak.js, loot.js and monsters.js.
import {newHealth, hurt, regen, revived, downed} from "../shared/health.js";
import {newCloak, toggle as cloakToggle, tick as cloakTick, shortCircuit as cloakShort, broken as cloakBroken} from "../shared/cloak.js";
import {GUN_ROUNDS, MAX_ROUNDS, MAX_BEACONS, roundsAfterPack} from "../shared/loot.js";
import {SHOT_COOL} from "../shared/monsters.js";

export const DOWNED_S = 45, IMMUNE_S = 4, REVIVE_R = 2.5, THROW_GAP_S = 1;
export const newPS = () => ({hp: newHealth(), gun: false, rounds: 0, beacons: 0, cloak: null, downAt: 0, immUntil: 0, shotAt: -99, throwAt: -99, sent: ""});
export const isDown = ps => downed(ps.hp);
export const isImmune = (ps, now) => now < ps.immUntil;
export const cloakOn = ps => !!(ps.cloak && ps.cloak.on);

// a monster touched them: false when they are down, immune, or still in the grace second after another hit; true when it landed (and they may now be down)
export function hit(ps, dmg, now) {
  if (isDown(ps) || isImmune(ps, now)) return false;
  const n = hurt(ps.hp, dmg, now); if (!n) return false;
  ps.hp = n; if (downed(n)) { ps.downAt = now; ps.cloak = ps.cloak ? {...ps.cloak, on: false} : null; }
  return true;
}
// time passing: regeneration, the cloak's battery, and the end of the down timer (a fresh start with a few seconds of safety). Returns "respawn" when they get up on their own.
export function tick(ps, dt, now) {
  if (isDown(ps)) { if (now - ps.downAt >= DOWNED_S) { ps.hp = newHealth(); ps.immUntil = now + IMMUNE_S; return "respawn"; } return null; }
  ps.hp = regen(ps.hp, now, dt);
  if (ps.cloak) ps.cloak = cloakTick(ps.cloak, dt);
  return null;
}
// a teammate lifts them (the caller has checked who and where): 50 HP, safe for a moment
export function lift(ps, now) { if (!isDown(ps)) return false; ps.hp = revived(now); ps.immUntil = now + IMMUNE_S; return true; }
// a locker opened: the gun with its rounds, and a cloak
export function gotLocker(ps) { ps.gun = true; ps.rounds = GUN_ROUNDS; ps.cloak = newCloak(); }
export const canTakePack = ps => ps.rounds < MAX_ROUNDS;
export function gotPack(ps) { ps.rounds = roundsAfterPack(ps.rounds); }
export const canTakeBeacon = ps => ps.beacons < MAX_BEACONS;
export function gotBeacon(ps) { ps.beacons = Math.min(MAX_BEACONS, ps.beacons + 1); }
// a shot costs a round and may not come faster than the gun allows (a little slack for the network)
export function shoot(ps, now) {
  if (isDown(ps) || !ps.gun || ps.rounds <= 0 || now - ps.shotAt < SHOT_COOL * 0.85) return false;
  ps.rounds--; ps.shotAt = now; return true;
}
export function throwBeacon(ps, now) {
  if (isDown(ps) || ps.beacons <= 0 || now - ps.throwAt < THROW_GAP_S) return false;
  ps.beacons--; ps.throwAt = now; return true;
}
export function toggleCloak(ps) {
  if (isDown(ps) || !ps.cloak) return false;
  const n = cloakToggle(ps.cloak); if (n === ps.cloak) return false; ps.cloak = n; return true;
}
// what the player is told about themselves
// the cloak's secondary ability: short-circuit it (the caller stuns the monsters round the player). False if they cannot (down, no cloak, already broken).
export function shortCircuit(ps) {
  if (isDown(ps) || !ps.cloak || cloakBroken(ps.cloak)) return false;
  ps.cloak = cloakShort(ps.cloak); return true;
}
export const view = ps => ({hp: Math.round(ps.hp.hp), gun: ps.gun, rounds: ps.rounds, beacons: ps.beacons, cloak: ps.cloak ? {on: ps.cloak.on, b: +ps.cloak.b.toFixed(1), x: Math.ceil(ps.cloak.broken || 0)} : null});
// true when what the player is told has changed since the last time (and remembers it)
export function changed(ps) { const s = JSON.stringify(view(ps)); if (s === ps.sent) return false; ps.sent = s; return true; }
