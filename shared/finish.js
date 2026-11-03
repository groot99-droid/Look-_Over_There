// The end of a round: players walk out of the L4 store into the parking lot, and the lot is the lobby. The round is over when everyone still
// in the room is out; the order they left in is their place. Pure functions; nothing here mutates its input.
export const ALARM_MS = 60000;
export const newRun = startedAt => ({startedAt, exits: [], ended: false});
// Returns {run, entry} or null (no run, already over, already out).
export function exitPlayer(run, id, now, name = "Player") {
  if (!run || run.ended || run.exits.some(e => e.id === id)) return null;
  const entry = {id, name: String(name).slice(0, 16), place: run.exits.length + 1, ms: Math.max(0, Math.round(now - run.startedAt))};
  return {run: {...run, exits: [...run.exits, entry]}, entry};
}
// True when the round is not already over and every id in `active` has left (and there is at least one).
export const done = (run, active) => !!run && !run.ended && active.length > 0 && active.every(id => run.exits.some(e => e.id === id));
export const finish = run => ({...run, ended: true});
export const results = run => run.exits.map(e => ({...e}));
export const fmtTime = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
