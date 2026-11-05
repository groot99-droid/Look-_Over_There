// The fuse rules, shared by the game (solo play) and the server (rooms), so both agree on what is allowed.
// A gated floor has NEED fuses lying around; carry them one at a time to the door at the top of that floor's stairs and put them in.
// A fuse is {s: 0 at home | 1 carried by `by` | 2 in the door | 3 dropped at x, z}.
export const GATED = ["B1"];                        // fuse floors. L1 has switches (shared/switches.js), L2 a keypad (shared/keypad.js); L3 is the breather, L4 the finale
export const NEED = 3;
export const newFloor = () => Array.from({length: NEED}, () => ({s: 0}));
export const carrying = (st, who) => st.findIndex(f => f.s === 1 && f.by === who);
export const unlocked = st => !!st && st.length === NEED && st.every(f => f.s === 2);
export const slotted = st => st ? st.filter(f => f.s === 2).length : 0;

// msg: {a: "take", i} | {a: "slot"} | {a: "drop", x, z} | {a: "release"}. Returns the new floor state, or null if the move is not allowed. Never mutates st.
export function act(st, who, msg) {
  if (!st || unlocked(st)) return null;
  const mine = carrying(st, who), next = st.map(f => ({...f}));
  switch (msg.a) {
    case "take": {
      const i = msg.i, f = next[i];
      if (!Number.isInteger(i) || !f || mine >= 0 || (f.s !== 0 && f.s !== 3)) return null;           // one at a time, and only one lying about
      next[i] = {s: 1, by: who}; return next;
    }
    case "slot":
      if (mine < 0) return null;
      next[mine] = {s: 2}; return next;
    case "drop":
      if (mine < 0 || !Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return null;
      next[mine] = {s: 3, x: msg.x, z: msg.z}; return next;
    case "release":                                  // the carrier left the floor or the room: the fuse goes back where it started
      if (mine < 0) return null;
      next[mine] = {s: 0}; return next;
  }
  return null;
}
