// The AFK Beacon: rolled down a corridor it broadcasts a "disconnected player with 1 HP". Monsters within LURE_M of it swarm round it and idle for LURE_S,
// ignoring players unless a player is within SAFE_M of that monster. Pure helpers; a beacon is {x, z, until} (until: the clock second it ends).
export const LURE_M = 30, LURE_S = 25, SAFE_M = 4, ROLL_M = 12, RING_MIN = 1.5, RING_MAX = 3;
export const active = (b, now) => !!b && now < b.until;
export const lures = (b, x, z, now) => active(b, now) && Math.hypot(x - b.x, z - b.z) <= LURE_M;
// the monster's own place in the swarm: a spot on a ring round the can, spread by the golden angle so they never share one
export function ringSpot(b, k) {
  const a = k * 2.399963, r = RING_MIN + (k * 0.37 % 1) * (RING_MAX - RING_MIN);
  return [b.x + Math.cos(a) * r, b.z + Math.sin(a) * r];
}
// Where a thrown beacon ends up: from (x, z) along the unit vector (dx, dz), up to ROLL_M, stopping before the first blocked point (blocked(x, z) -> bool).
export function rollEnd(x, z, dx, dz, blocked, step = 0.25) {
  let ex = x, ez = z;
  for (let d = step; d <= ROLL_M; d += step) { const nx = x + dx * d, nz = z + dz * d; if (blocked(nx, nz)) break; ex = nx; ez = nz; }
  return [ex, ez];
}
// Which monsters (id, x, z) a beacon pulls, and which of them a player has come too close to (they keep to normal sight).
export const pulled = (b, mons, now) => mons.filter(m => lures(b, m.x, m.z, now));
export const nearPlayer = (m, players) => players.some(p => Math.hypot(p.x - m.x, p.z - m.z) <= SAFE_M);

// The beacon's secondary ability: reverse the frequency. For REVERSE_S seconds the monsters it would pull run away from it instead; when that ends it pulls again and they
// group up round it (it is kept running for at least GROUP_S more). A beacon can be reversed once. Returns the beacon unchanged if it cannot be.
export const REVERSE_S = 12, GROUP_S = 10;
export const repelling = (b, now) => !!b && (b.repelUntil || 0) > now;
export const reverse = (b, now) => active(b, now) && !b.reversed ? {...b, reversed: true, repelUntil: now + REVERSE_S, until: Math.max(b.until, now + REVERSE_S + GROUP_S)} : b;
