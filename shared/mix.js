// The sound rules that need no audio device: how loud each danger layer is, how a wall changes a sound, how often feet fall, what plays on each level.
// Pure functions, shared by the game's audio engine (audio/engine.js) and its tests.
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// What the music plays on each level: the score piece and the atmosphere under it (cues in audio/cues.json), whether danger layers apply, and how dark the score is.
export const LEVELS = {
  B1: {score: "m_b1", bed: "m_b1_bed", danger: true, dark: 0.55, rate: 0.94, step: "step_tile"},
  L1: {score: "m_l1", bed: "m_l1_bed", danger: true, dark: 0.6, rate: 0.95, step: "step_floor"},
  L2: {score: "m_l2", bed: "m_l2_bed", danger: true, dark: 0.5, rate: 0.93, step: "step_floor"},
  L3: {score: "m_l3", bed: "m_l3_bed", danger: false, dark: 1, rate: 1, step: "step_floor"},               // the breather: the brightest piece, no danger layers
  L4: {score: "m_l4", bed: "m_l4_bed", danger: true, dark: 0.7, rate: 1, step: "step_floor", alarm: true},
};
export const levelMix = id => LEVELS[id] || LEVELS.B1;

// Danger: chasers is [{d}] (distance in metres of each monster that is chasing someone on this floor), hp is yours. Returns the gain 0..1 of each layer, the music duck, and the heartbeats.
export function danger(chasers, hp, on = true) {
  const near = on && chasers.length ? Math.max(...chasers.map(c => clamp(1 - c.d / 32))) : 0, crowd = on ? clamp((chasers.length - 1) * 0.15, 0, 0.3) : 0;
  const threat = clamp(near + (near > 0 ? crowd : 0));
  const low = hp < 36 ? clamp((36 - hp) / 36) : 0, frantic = smoothstep(0.45, 0.8, low);
  return {t1: smoothstep(0.05, 0.5, threat), t2: smoothstep(0.35, 0.8, threat), t3: smoothstep(0.65, 1, threat), duck: 1 - 0.35 * threat,
          heart: low * (1 - frantic), heartFast: low * frantic, threat};
}
// Exponential smoothing toward a target: rises quickly, falls slowly (a hunt ends gently).
export const smooth = (cur, target, dt, up = 1.6, down = 0.5) => cur + (target - cur) * (1 - Math.exp(-dt * (target > cur ? up : down)));

// A wall between you and a sound: quieter and duller, more so the farther it is.
export const occlusion = (blocked, d) => blocked ? {gain: 0.5, cutoff: Math.max(350, 900 - clamp(d, 0, 40) * 14)} : {gain: 1, cutoff: 18000};
// Sounds beyond this many metres are not played (it saves voices).
export const audibleRange = loud => (loud ? 55 : 32);

// Seconds between footfalls: a stride is about 2 m at a walk, so the cadence follows the speed.
export const stepInterval = (mode) => mode === "run" ? 0.29 : mode === "crouch" ? 0.85 : 0.52;
export const monsterStepInterval = speed => speed > 0.3 ? clamp(2.1 / speed, 0.28, 1.1) : Infinity;
// How loud a footfall is: you are quiet when crouching (the monsters hear nothing then either), loud when running.
export const stepGain = mode => mode === "run" ? 0.55 : mode === "crouch" ? 0.12 : 0.32;

// The alarm's siren period in seconds, quickening from 1.7 to 0.7 as the countdown runs out (msLeft of totalMs).
export const alarmPeriod = (msLeft, totalMs = 60000) => 0.7 + 1.0 * clamp(msLeft / totalMs);
export const sirenFreq = (t, period) => 540 + 260 * (0.5 - 0.5 * Math.cos((t % period) / period * 2 * Math.PI));

// Which growl a monster uses (stable per monster) and the cue names for the layers.
export const growlFor = id => ["mon_growl_1", "mon_growl_2", "mon_growl_3"][Math.abs(id | 0) % 3];
export const LAYERS = ["t_1", "t_2", "t_3"];
export const REQUIRED_CUES = ["heart", "heart_fast", "mon_idle", "mon_roar", "mon_step", "st_notice", ...LAYERS, ...Object.values(LEVELS).flatMap(l => [l.score, l.bed, l.step])];
