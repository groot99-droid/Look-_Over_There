// The cloak: a battery-powered toggle. On, monsters cannot see you beyond SHORT_M (they still hear you). Pure functions; a state is {on, b, idle}:
// b is the battery 0..1, idle the seconds it has been off (it recharges after a short wait).
export const DRAIN_S = 15, RECHARGE_S = 45, RECHARGE_DELAY = 2, MIN_ON = 0.1, SHORT_M = 1.5;
export const newCloak = () => ({on: false, b: 1, idle: 0});
// The secondary ability: short-circuit the device. It stops working for BROKEN_S seconds (5 minutes) and, as it dies, stuns every monster within STUN_R metres for STUN_S seconds:
// a stunned monster neither moves nor hits, so you can run through it. `broken` is the seconds left (absent = working).
export const BROKEN_S = 300, STUN_R = 8, STUN_S = 5;
export const broken = c => !!c && (c.broken || 0) > 0;
export const shortCircuit = c => !c || broken(c) ? c : {on: false, b: 0, idle: 0, broken: BROKEN_S};
// Flip it. Switching on needs MIN_ON of battery; switching off always works.
export const toggle = c => broken(c) ? c : c.on ? {...c, on: false, idle: 0} : (c.b >= MIN_ON ? {...c, on: true} : c);
// Advance dt seconds: drains while on (and switches itself off at 0), recharges slowly while off.
export function tick(c, dt) {
  if (broken(c)) return {on: false, b: 0, idle: 0, broken: Math.max(0, c.broken - dt)};          // dead: no drain, no recharge, until it has been broken for BROKEN_S
  if (c.on) { const b = c.b - dt / DRAIN_S; return b <= 0 ? {on: false, b: 0, idle: 0} : {...c, b}; }
  const idle = c.idle + dt; return {...c, idle, b: idle > RECHARGE_DELAY ? Math.min(1, c.b + dt / RECHARGE_S) : c.b};
}
// How far a monster can see a cloaked player, given the distance it could otherwise see.
export const seenFrom = (cloaked, d) => !cloaked || d <= SHORT_M;
