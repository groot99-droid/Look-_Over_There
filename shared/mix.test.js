import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {LEVELS, levelMix, danger, smooth, occlusion, stepInterval, monsterStepInterval, stepGain, alarmPeriod, sirenFreq, growlFor, monsterVoice, MONSTER_VOICES, REQUIRED_CUES, smoothstep, audibleRange} from "./mix.js";

test("danger layers rise as a chaser closes, the music ducks, and nothing plays without a chaser", () => {
  const none = danger([], 100); assert.equal(none.t1 + none.t2 + none.t3 + none.heart, 0); assert.equal(none.duck, 1);
  const far = danger([{d: 30}], 100), mid = danger([{d: 14}], 100), close = danger([{d: 3}], 100);
  assert.ok(far.t1 < mid.t1 && mid.t1 <= close.t1); assert.ok(far.t3 === 0 && mid.t2 > 0 && close.t3 > 0.5);
  assert.ok(close.duck < mid.duck && mid.duck < 1 && close.duck > 0.6);
  assert.ok(danger([{d: 10}, {d: 12}], 100).threat > danger([{d: 10}], 100).threat, "two hunters are worse than one");
  for (const v of Object.values(close)) assert.ok(v >= 0 && v <= 1.0001);
});
test("the breather has no danger layers even with a chaser", () => {
  assert.equal(LEVELS.L3.danger, false); const d = danger([{d: 2}], 100, LEVELS.L3.danger); assert.equal(d.t1 + d.t2 + d.t3, 0);
});
test("a heartbeat comes in under 36 HP and quickens under about 20", () => {
  assert.equal(danger([], 60).heart, 0); const a = danger([], 30), b = danger([], 10), c = danger([], 2);
  assert.ok(a.heart > 0 && a.heartFast === 0); assert.ok(b.heartFast > 0 && c.heartFast > b.heartFast && c.heart < a.heart + 1e-9);
});
test("smoothing rises quickly and falls slowly and never overshoots", () => {
  let up = 0, down = 1; for (let i = 0; i < 10; i++) { up = smooth(up, 1, 0.1); down = smooth(down, 0, 0.1); }
  assert.ok(up > 0.7 && up <= 1); assert.ok(down > 0.3 && down < 1); assert.equal(smooth(0.5, 0.5, 0.1), 0.5);
});
test("a wall muffles: quieter and lower cut-off, more with distance; open air is untouched", () => {
  assert.deepEqual(occlusion(false, 20), {gain: 1, cutoff: 18000});
  const near = occlusion(true, 3), far = occlusion(true, 30); assert.ok(near.gain < 1 && near.cutoff < 1000 && far.cutoff < near.cutoff && far.cutoff >= 350);
  assert.ok(audibleRange(true) > audibleRange(false));
});
test("footfalls come faster the faster you move, and crouching is nearly silent", () => {
  assert.ok(stepInterval("run") < stepInterval("walk") && stepInterval("walk") < stepInterval("crouch"));
  assert.ok(stepGain("crouch") < stepGain("walk") && stepGain("walk") < stepGain("run"));
  assert.equal(monsterStepInterval(0), Infinity); assert.ok(monsterStepInterval(5.5) < monsterStepInterval(2.7)); assert.ok(monsterStepInterval(100) >= 0.28);
});
test("the alarm quickens as the countdown runs out and the siren sweeps its range", () => {
  assert.ok(alarmPeriod(60000) > alarmPeriod(30000) && alarmPeriod(30000) > alarmPeriod(0)); assert.ok(Math.abs(alarmPeriod(0) - 0.7) < 1e-9);
  const fs = Array.from({length: 100}, (_, i) => sirenFreq(i * 0.02, 1.7)); assert.ok(Math.min(...fs) >= 540 - 1e-6 && Math.max(...fs) <= 800 + 1e-6 && Math.max(...fs) - Math.min(...fs) > 200);
});
test("every level has a mix, an unknown level falls back to B1, and growls are stable per monster", () => {
  for (const id of ["B1", "L1", "L2", "L3", "L4"]) assert.ok(LEVELS[id].score && LEVELS[id].bed && LEVELS[id].step); assert.equal(levelMix("nope"), LEVELS.B1);
  assert.equal(growlFor(7), growlFor(7)); assert.ok(new Set([0, 1, 2].map(growlFor)).size === 3); assert.ok(LEVELS.L4.alarm && !LEVELS.B1.alarm);
  assert.ok(smoothstep(0, 1, 0.5) === 0.5);
});
test("every cue the engine needs exists in audio/cues.json", () => {
  const cues = JSON.parse(readFileSync(new URL("../audio/cues.json", import.meta.url))).cues;
  for (const k of REQUIRED_CUES) assert.ok(cues[k], `missing cue ${k}`);
});
test("each monster kind has its own voice, and an unknown kind falls back to a stable one", () => {
  const kinds = ["sinew", "pale_traveler", "clawed", "creature"]; assert.equal(new Set(kinds.map(k => monsterVoice(k, 0).growl)).size, 4, "four kinds, four growls");
  assert.ok(monsterVoice("sinew", 0).rate < monsterVoice("pale_traveler", 0).rate, "the pale traveler is higher");
  assert.deepEqual(monsterVoice("nobody", 4), {growl: growlFor(4), rate: 1}); assert.ok(Object.values(MONSTER_VOICES).every(v => v.rate > 0.5 && v.rate < 1.5));
});
