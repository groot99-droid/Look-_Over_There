// The keypad floor: the stair door takes a CODE_LEN-digit code. Each digit lies on a note somewhere on the floor (note i holds digit i of the code);
// whoever reads a note shows that digit to the whole team. Typing a wrong code is loud and locks the keypad for a while.
// The code itself stays with whoever keeps the state (the server in a room, the game when solo): clients only ever see view(st).
import {REGISTRY} from "./registry.js";
export const KEYPAD_FLOORS = REGISTRY.scenesWith("keypad");
export const CODE_LEN = 4;
export const LOCK_MS = 8000;
export const newKeypad = (rnd = Math.random) => ({code: Array.from({length: CODE_LEN}, () => Math.min(9, Math.floor(rnd() * 10))), found: Array(CODE_LEN).fill(false), solved: false, fails: 0, lockUntil: 0});
// what a client may know: the digits found so far (null for the rest), whether it is solved, how many wrong tries, and how long the lock still runs
export const view = (st, now) => ({found: st.code.map((d, i) => st.found[i] ? d : null), solved: st.solved, fails: st.fails, lockMs: Math.max(0, st.lockUntil - now)});
export const foundCount = v => v ? v.found.filter(d => d !== null).length : 0;
// read note i: returns the new state, or null if it is not allowed (bad index, already read, or the door is already open). Never mutates st.
export function find(st, i) {
  if (!st || st.solved || !Number.isInteger(i) || i < 0 || i >= CODE_LEN || st.found[i]) return null;
  const found = st.found.slice(); found[i] = true; return {...st, found};
}
// type a code: {st, ok, locked}. While locked nothing changes. A wrong code adds a fail and locks the keypad for LOCK_MS.
export function tryCode(st, code, now) {
  if (!st || st.solved || typeof code !== "string" || !/^\d+$/.test(code) || code.length !== CODE_LEN) return {st: null, ok: false, locked: false};
  if (now < st.lockUntil) return {st: null, ok: false, locked: true};
  if (code === st.code.join("")) return {st: {...st, solved: true}, ok: true, locked: false};
  return {st: {...st, fails: st.fails + 1, lockUntil: now + LOCK_MS}, ok: false, locked: false};
}
