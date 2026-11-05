// Doc 4 §3. State module: conformance, dissonance, friction, flags.
// The only writer of `conformance`/`dissonance` is commitChoice(). Mini-games
// never touch it (Doc 1 §2.1, Doc 3 §1.1) -- they write `friction` only, via
// router.js applying their onComplete() payload.

export const TITLE = 'NINETY-NINE';
export const COMPANY = 'VELLUM & ASHE, LLP';
export const ROLE = 'SENIOR DIRECTOR OF SYSTEMIC ARCHITECTURE';
export const ADDRESS = '666 HALLAM ROW';
export const DRONE_HZ = 48;
export const DETUNE_PER_SCENE = 4; // cents

// MUST be false in any deployed build (Doc 4 §3.7). No automated CI exists in
// this environment (no Node) to enforce this -- test/cases/logic.spine.js
// asserts it, but that only runs when someone opens /test/ by hand. Treat
// this as a manual pre-deploy checklist item, documented again in Doc 4 §11.3.
export const DEBUG_RESUME = false;

export function createState() {
  return {
    conformance: 0,        // int, -8..+8, even at scene end
    dissonance: 0,          // int, 0..7
    friction: 0.0,           // float, 0..8, sum of per-scene minigame friction (0..1 each)
    lastPolarity: null,     // +1 | -1 | null
    lastRender: 'C',        // 'C' | 'H'
    dwell: [],               // float[], seconds per scene
    flags: new Set(),
    formAnswers: {},         // MG-01 output, read by MG-07 (Doc 4 §6.4)
    sceneIndex: 0
  };
}

// The only writer of `conformance`. polarity: +1 succumb, -1 resist.
export function commitChoice(state, polarity) {
  if (state.lastPolarity !== null && polarity !== state.lastPolarity) {
    state.dissonance++;
  }
  state.lastPolarity = polarity;
  state.conformance += polarity;
}

// Render resolution, evaluated at the top of each scene (Doc 1 §2.2).
// The tie at zero resolving to the *last* render is what makes wavering feel
// like drifting instead of teleporting. Do not "fix" it to default to C.
export function renderFor(state) {
  if (state.conformance >= 2) { state.lastRender = 'C'; return 'C'; }
  if (state.conformance <= -2) { state.lastRender = 'H'; return 'H'; }
  return state.lastRender; // tie at 0 holds the last render
}

// Pure twin of renderFor(): same resolution, no lastRender write. Lets the
// router look ahead at the destination render (after commitChoice, before
// the transition plays) without disturbing the tie-hold. Keep the two in
// lockstep -- test/cases/logic.spine.js sweeps them against each other.
export function peekRenderFor(state) {
  if (state.conformance >= 2) return 'C';
  if (state.conformance <= -2) return 'H';
  return state.lastRender;
}

// S0 intake seed (added post-launch). The hostile branch was unreachable at
// S1/S2 -- conformance is 0 at S1 and +/-1 at S2, and renderFor() only flips
// at +/-2, so the shipped S1_H/S2_H assets could never play. The S0
// application's three WILLING / NOT WILLING answers decide which room the
// building puts the candidate in first.
//
// This seeds `lastRender` ONLY, never `conformance`. renderFor() already
// returns lastRender whenever conformance sits inside +/-2, so moving it is
// enough to hold the hostile render through S1 and S2 until real choices
// push conformance past the threshold. Because the score never moves, every
// ending threshold (+/-4) and the documented 256-path ending counts are
// exactly as they were -- which is the "render only" call, and why the
// ±2 threshold in renderFor() stays untouched as the plan requires.
export const INTAKE_REFUSALS_FOR_HOSTILE = 2;

export function seedRenderFromIntake(state, refusals) {
  state.lastRender = refusals >= INTAKE_REFUSALS_FOR_HOSTILE ? 'H' : 'C';
  return state.lastRender;
}

// Doc 1 §2.3.
export function fracture(state) {
  const f = (state.friction / 8.0) * 0.6;
  const d = (state.dissonance / 7.0) * 0.4;
  return Math.min(1, Math.max(0, f + d));
}

// Doc 1 §2.4 / Doc 4 §3.6.
//
// RETAINED (added post-launch, outside Doc 1's original three-ending design
// -- see Doc 1 §9.1, which explicitly left this open): a run that would
// otherwise have qualified for ASSIMILATION (high conformance, low
// dissonance) but where the player also opened the box at S8-C. He does
// everything right until the very last possible second, and that single
// crack is what gets filed. Checked ahead of the plain ASSIMILATION branch
// since it's a strict refinement of it, never a wider net.
export function resolveEnding(state) {
  if (state.flags.has('EARLY_EXIT')) return 'PENDING';
  if (state.dissonance >= 4) return 'PENDING';
  if (state.conformance >= 4 && state.flags.has('OPENED_BOX')) return 'RETAINED';
  if (state.conformance >= 4) return 'ASSIMILATION';
  if (state.conformance <= -4) return 'EXPULSION';
  return 'PENDING';
}
