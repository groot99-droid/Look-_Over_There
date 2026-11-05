// A player's health. Pure functions; a state is {hp, hurtAt}, hurtAt being the clock (seconds) of the last hit, or -Infinity.
export const MAX_HP = 100, HIT_DMG = 35, HIT_GAP = 1.2, GRACE = 1.0, REGEN_DELAY = 10, REGEN_RATE = 1, REVIVE_HP = 50;
export const newHealth = () => ({hp: MAX_HP, hurtAt: -Infinity});
// A hit of dmg at time now: null during the grace second after any hit (or for a bad number), else the new state. hp never goes below 0.
export function hurt(h, dmg, now) {
  if (!(dmg > 0) || now - h.hurtAt < GRACE) return null;
  return {hp: Math.max(0, h.hp - Math.min(dmg, MAX_HP)), hurtAt: now};
}
// Regeneration: +REGEN_RATE per second once REGEN_DELAY seconds have passed since the last hit; never above MAX_HP, never while down.
export function regen(h, now, dt) {
  if (h.hp <= 0 || h.hp >= MAX_HP || now - h.hurtAt < REGEN_DELAY) return h;
  return {hp: Math.min(MAX_HP, h.hp + REGEN_RATE * dt), hurtAt: h.hurtAt};
}
export const revived = now => ({hp: REVIVE_HP, hurtAt: now});               // a lifted player starts at 50 and the regeneration wait starts afresh
export const downed = h => h.hp <= 0;
// Whether a monster may hit again: it keeps its own clock per target (HIT_GAP seconds between its hits).
export const mayHit = (lastHitAt, now) => now - (lastHitAt ?? -Infinity) >= HIT_GAP;
