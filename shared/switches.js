// Floor switches: NEED_SW switches stand far apart on the floor; flip each one, in any order and one at a time (they stay flipped).
// When all are on, the floor's stair door is powered. Shared by the server (rooms) and the game (solo play).
export const SWITCH_FLOORS = ["L1"];
export const NEED_SW = 2;
export const newSwitches = () => Array.from({length: NEED_SW}, () => ({on: false}));
export const swCount = st => st ? st.filter(s => s.on).length : 0;
export const swDone = st => !!st && st.length === NEED_SW && st.every(s => s.on);
// Returns the new state, or null if the move is not allowed (not a switch, already on, or the floor is already done). Never mutates st.
export function flip(st, i) {
  if (!st || swDone(st) || !Number.isInteger(i) || !st[i] || st[i].on) return null;
  const next = st.map(s => ({...s})); next[i] = {on: true}; return next;
}
