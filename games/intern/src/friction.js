// Friction from movement. The mini-games that used to characterize each
// scene are gone (the author's call); what is left to read is how the
// candidate walks to the choice:
//   hesitation  how long he is free to choose before he does (active time
//               only: not while carried, not while the window is hidden)
//   doubling    how often he goes up to one threshold, then the other
// Each scene yields 0..1 (Doc 1 §2.1's per-scene friction range) and
// state.friction sums them, capped at 8. Its only consumer is still
// fracture() (state.js): friction never touches conformance or the ending.

const smoothstep = (a, b, x) => {
  if (b <= a) return x >= b ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createFrictionMeter({ t0 = 20, t1 = 90, doublingFull = 3, debounce = 1.5 } = {}) {
  let active = 0;          // seconds of free choosing
  let lastRing = null;     // 'succumb' | 'resist' | null: the ring he was last inside
  let lastRingAt = -Infinity;
  let alternations = 0;
  let clock = 0;

  return {
    // ring: which threshold's approach ring the player is inside (or null)
    tick(dt, { ring = null, active: isActive = true } = {}) {
      clock += dt;
      if (!isActive) return;
      active += dt;
      if (ring && ring !== lastRing) {
        if (lastRing !== null && clock - lastRingAt > debounce) alternations++;
        lastRing = ring;
        lastRingAt = clock;
      }
    },
    value() {
      const hesitation = smoothstep(t0, t1, active);
      const doubling = Math.min(1, alternations / doublingFull);
      return Math.min(1, Math.max(0, 0.6 * hesitation + 0.4 * doubling));
    },
    seconds: () => active,
    alternations: () => alternations
  };
}
