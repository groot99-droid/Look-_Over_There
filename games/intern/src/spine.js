// Pure helpers over the spine (data/scenes.json + state.js), for the
// director and the tests. The spine never forks -- both thresholds of a
// scene lead to the same next scene -- but the RENDER of that scene is
// decided by the score after the choice, so the room behind each
// threshold's door can differ (only on the flip edges S2->S3, S4->S5,
// S6->S7). The director asks outcomesFor() at the top of a scene and
// builds each possible next room ahead of time, so committing never waits
// on a build.

import { commitChoice, peekRenderFor, resolveEnding } from './state.js';

export function cloneState(state) {
  return {
    ...state,
    flags: new Set(state.flags),
    dwell: state.dwell.slice(),
    formAnswers: { ...state.formAnswers }
  };
}

export function baseOf(rooms, key) {
  const rec = rooms && rooms.rooms[key];
  return rec && rec.alias ? rec.alias : key;
}

// For each threshold of `branch` (scene `sceneId`): what committing it would
// lead to -- the polarity, the next scene's render and room, or the ending
// and its room after S8.
export function outcomesFor(state, manifest, endings, sceneId, branch) {
  const out = {};
  for (const [key, th] of Object.entries(branch.thresholds || {})) {
    const s = cloneState(state);
    const polarity = key === 'succumb' ? 1 : -1;
    commitChoice(s, polarity);
    if (th.setFlag) s.flags.add(th.setFlag);
    const next = branch.next;
    if (next === 'E') {
      const ending = resolveEnding(s);
      out[key] = { key, polarity, next, ending, room: th.to || (endings[ending] && endings[ending].room) || null, endingRoom: endings[ending] && endings[ending].room };
    } else {
      const render = peekRenderFor(s);
      const nb = manifest.scenes[next].branches[render];
      out[key] = { key, polarity, next, render, room: nb ? nb.room : null };
    }
  }
  return out;
}

// The thresholds' zone names as a list (a threshold may name several: the
// two rows of chairs are one TAKE A SEAT).
export function zonesOf(threshold) {
  if (!threshold || !threshold.zone) return [];
  return Array.isArray(threshold.zone) ? threshold.zone : [threshold.zone];
}
