// Doc 4 §7. The drone is a single OscillatorNode, created once on S0's
// SUBMIT click (the diegetic user gesture, §7.4) and never stopped until the
// game ends. Everything else (ambience crossfade, ducking, sfx bus, the
// music bed) hangs off the same AudioContext/master bus (§7.2).
//
// Doc 4 §6.3 / §11.3: `osc.start()` must be called exactly once per
// playthrough -- Drone.start() below is idempotent (guarded by `started`)
// specifically so a stray double-call from router.js can't violate that.
//
// Bus layout (post-mix-pass):
//
//   drone ─────────────────────────┐
//   hum (the store's, setHum) ─────┤  (reads the drone's detune, never writes it)
//   ambience (2-el pool, trimmed) ─┤
//   music (music.js pad/muzak) ────┼──> master ──> limiter ──> destination
//   sfx (one-shots + synth cues) ──┤
//   voice (receptionist VO) ───────┘  (voice sidechain-ducks ambience+music)
//
// Every bed file is trimmed to a common loudness (AMBIENCE_TRIM, derived
// from assets/aud/_MANIFEST.csv's integrated LUFS), every one-shot to a
// common peak (SFX_TRIM), and the limiter is the safety net so stacked
// one-shots can never hard-clip the output.

import { DRONE_HZ, DETUNE_PER_SCENE } from './state.js';
import { createMusic } from './music.js';

export const DRONE_GAIN = 0.06;
const AMBIENCE_BUS_GAIN = 0.55;
const SFX_BUS_GAIN = 0.8;
const VOICE_BUS_GAIN = 0.9;
const MUSIC_BUS_GAIN = 1.0;
const AMBIENCE_CROSSFADE_MS = 400; // Doc 4 §7.2: same 400ms as the video crossfade
const DUCK_DB = -7; // ambience + music under the receptionist's voice

// Per-bed trims from assets/aud/_MANIFEST.csv (integrated LUFS, target
// -18 LUFS, capped at +6 dB so a quiet bed's -3 dBTP peaks aren't pushed
// into the limiter). Beds range from -13.6 (S4_C/S5_H) to -30.9 (S3_H): a
// 17 dB swing that used to play back untouched.
const AMBIENCE_LUFS = {
  'S0_X_AMB_STREET.wav': -16.9, 'S0_X_AMB.wav': -16.0,
  'S1_C_AMB.wav': -14.5, 'S1_H_AMB.wav': -15.2,
  'S3_C_AMB.wav': -19.8, 'S3_H_AMB.wav': -30.9,
  'S4_C_AMB.wav': -13.6, 'S4_H_AMB.wav': -23.8,
  'S5_C_AMB.wav': -15.2, 'S5_H_AMB.wav': -13.6,
  'S6_C_AMB.wav': -17.8, 'S6_H_AMB.wav': -19.0,
  'S7_C_AMB.wav': -20.4, 'S7_H_AMB.wav': -21.7,
  'S8_C_AMB_BOARDROOM.wav': -16.9, 'S8_C_AMB.wav': -19.9,
  'S8_H_AMB_STORE.wav': -14.4, 'S8_H_AMB.wav': -22.5
};
const AMBIENCE_TARGET_LUFS = -18;
const AMBIENCE_TRIM_MAX_DB = 6;

// Per-one-shot trims from measured sample peaks (dBFS), target -8 dBFS.
// The stapler peaked at -1.8 dBFS while the keyboard sat at -22.4: a 20 dB
// gap between two cues fired in adjacent scenes.
const SFX_PEAK_DBFS = {
  'S5_C_SFX_STAPLER.wav': -1.8, 'S2_X_SFX_RECEPTIONIST.wav': -4.7,
  'S5_C_SFX_CRT_ON.wav': -4.9, 'S2_C_SFX_SPEAKER.wav': -5.5,
  'S2_H_SFX_SPEAKER.wav': -5.2, 'S3_H_SFX_DOOR.wav': -5.3,
  'S4_C_SFX_PAPERS.wav': -13.0, 'S3_C_SFX_CURTAIN.wav': -15.8,
  'S4_H_SFX_FOOTSTEPS.wav': -21.4, 'S5_H_SFX_CARALARM.wav': -21.5,
  'S6_C_SFX_KEYBOARD.wav': -22.4
};
const SFX_TARGET_DBFS = -8;

// Files routed to the voice bus (ducks the beds) instead of the sfx bus.
const VOICE_FILES = new Set(['S2_X_SFX_RECEPTIONIST.wav']);

// Retrigger guard per file: a second trigger of the same file inside this
// window is dropped (MG-05 fires keyboard-press on every keydown; MG-02 H
// fires door-rattle on every push). Older instances beyond MAX_VOICES per
// file are faded out instead of stacking.
const RETRIGGER_MIN_MS = 70;
const MAX_VOICES_PER_FILE = 2;

function dbToGain(db) { return Math.pow(10, db / 20); }

export function ambienceTrimFor(file) {
  const lufs = AMBIENCE_LUFS[file];
  if (lufs === undefined) return 1;
  const db = Math.min(AMBIENCE_TRIM_MAX_DB, AMBIENCE_TARGET_LUFS - lufs);
  return dbToGain(db);
}

export function sfxTrimFor(file) {
  const peak = SFX_PEAK_DBFS[file];
  if (peak === undefined) return 1;
  return dbToGain(SFX_TARGET_DBFS - peak);
}

// Equal-power crossfade curves (sin/cos), so the midpoint of an ambience
// swap doesn't dip by 6 dB the way two linear ramps do.
const CURVE_N = 64;
const FADE_SEGMENTS = 8;
const FADE_IN_CURVE = new Float32Array(CURVE_N);
const FADE_OUT_CURVE = new Float32Array(CURVE_N);
for (let i = 0; i < CURVE_N; i++) {
  const t = i / (CURVE_N - 1);
  FADE_IN_CURVE[i] = Math.sin(t * Math.PI / 2);
  FADE_OUT_CURVE[i] = Math.cos(t * Math.PI / 2);
}

function rampGain(param, ctx, target, ms) {
  const t = ctx.currentTime;
  const seconds = Math.max(0.03, ms / 1000); // never a step: steps click
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(target, t + seconds);
}

class Drone {
  constructor(ctx, master) {
    this.ctx = ctx;
    this.started = false;

    this.osc = ctx.createOscillator();
    this.osc.type = 'sine';
    this.osc.frequency.value = DRONE_HZ;

    this.gain = ctx.createGain();
    this.gain.gain.value = DRONE_GAIN;

    // Ducking (§7.3) filters, never stops, the drone.
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000; // effectively bypassed until ducked

    this.osc.connect(this.gain).connect(this.lowpass).connect(master);

    // Second, literal 48Hz reference oscillator: silent until scene 5,
    // ramping to gain 0.02 by S8, so the beat against the detuned primary
    // is physical rather than only remembered (§7.1's "test both versions"
    // note -- shipping both, since the doc says the literal version
    // "reliably works").
    this.refOsc = ctx.createOscillator();
    this.refOsc.type = 'sine';
    this.refOsc.frequency.value = DRONE_HZ;
    this.refGain = ctx.createGain();
    this.refGain.gain.value = 0.0;
    this.refOsc.connect(this.refGain).connect(master);
  }

  start() {
    if (this.started) return;
    this.osc.start();
    this.refOsc.start();
    this.started = true;
  }

  advanceScene(sceneIndex) {
    const t = this.ctx.currentTime;
    this.osc.detune.cancelScheduledValues(t);
    this.osc.detune.linearRampToValueAtTime(sceneIndex * DETUNE_PER_SCENE, t + 8);
    // what was just scheduled, for whatever follows the drone (the hum)
    this.detuneTo = { cents: sceneIndex * DETUNE_PER_SCENE, at: t + 8 };

    if (sceneIndex >= 5) {
      const refTarget = 0.02 * Math.min(1, (sceneIndex - 5) / 3); // ramps in across S5..S8
      this.refGain.gain.cancelScheduledValues(t);
      this.refGain.gain.linearRampToValueAtTime(refTarget, t + 8);
    }
  }
}

function createAmbiencePool(ctx, bus) {
  const els = [new Audio(), new Audio()];
  const gains = els.map(() => ctx.createGain());
  els.forEach((el, i) => {
    el.loop = true;
    el.preload = 'auto';
    const src = ctx.createMediaElementSource(el);
    src.connect(gains[i]).connect(bus);
  });
  gains[0].gain.value = 0;
  gains[1].gain.value = 0;
  let active = -1;          // index of the element currently carrying the bed, -1 = none
  let currentFile = null;   // the bed that is (or is about to be) playing
  let generation = 0;       // bumps on every play() so a stale await can't act on the pool
  let pendingPause = null;

  // Equal-power fade as a short chain of linear ramps (a setValueCurveAtTime
  // in flight can't be interrupted by a new fade without throwing; ramps can).
  function fadeTo(idx, target, ms) {
    const t = ctx.currentTime;
    const seconds = Math.max(0.03, ms / 1000);
    const g = gains[idx].gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
    const from = g.value;
    g.setValueAtTime(from, t);
    const curve = target > from ? FADE_IN_CURVE : FADE_OUT_CURVE;
    const lo = Math.min(from, target), hi = Math.max(from, target);
    for (let k = 1; k <= FADE_SEGMENTS; k++) {
      const i = Math.round(((k / FADE_SEGMENTS) * (CURVE_N - 1)));
      g.linearRampToValueAtTime(lo + (hi - lo) * curve[i], t + (k / FADE_SEGMENTS) * seconds);
    }
  }

  return {
    async play(file, { crossfadeMs = AMBIENCE_CROSSFADE_MS, base = './assets/aud/' } = {}) {
      if (!file || file === currentFile) return; // null/unchanged = carry over previous bed (Doc 1 §5 S2)
      const myGen = ++generation;
      const prevIdx = active;
      const nextIdx = prevIdx === -1 ? 0 : 1 - prevIdx;
      const el = els[nextIdx];
      if (pendingPause) { clearTimeout(pendingPause); pendingPause = null; }
      el.src = `${base}${file}`;
      try {
        await el.play();
      } catch (e) {
        console.warn('audio.js: ambience play() blocked (needs a user gesture first)', e);
        return; // currentFile is NOT set, so a later retry with the same file still starts it
      }
      if (myGen !== generation) { el.pause(); return; } // a newer play() superseded this one
      currentFile = file;
      active = nextIdx;
      fadeTo(nextIdx, ambienceTrimFor(file), crossfadeMs);
      if (prevIdx !== -1) {
        fadeTo(prevIdx, 0, crossfadeMs);
        pendingPause = setTimeout(() => {
          pendingPause = null;
          if (active !== prevIdx) els[prevIdx].pause();
        }, crossfadeMs + 50);
      }
    },

    fadeOut(ms = 1500) {
      generation++;
      currentFile = null;
      for (let i = 0; i < els.length; i++) fadeTo(i, 0, ms);
      const wasActive = active;
      active = -1;
      if (pendingPause) { clearTimeout(pendingPause); pendingPause = null; }
      pendingPause = setTimeout(() => { pendingPause = null; els.forEach((el) => el.pause()); }, ms + 50);
      return wasActive;
    },

    current() { return currentFile; }
  };
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let limiter = null;
  let drone = null;
  let sfxBus = null;
  let voiceBus = null;
  let ambienceBus = null;
  let musicBus = null;
  let ambience = null;
  let music = null;
  let hum = null; // the store's hum (setHum): { osc, filter, gain, follow, detuneTo }
  // Mute gates the single master bus everything else connects to (drone,
  // ambience, sfx one-shots and synth cues alike), so one flag silences the
  // whole game. Read at context creation and whenever toggled thereafter --
  // set-before-SUBMIT is legal (it's just a flag until ensureContext() runs).
  // Defaults to SOUND ON: the game used to boot muted, so a player who never
  // found the toggle heard nothing at all.
  let muted = false;
  const oneShots = new Map(); // file -> [{ el, gain, startedAt }]
  let duckDepth = 0;

  function ensureContext() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1.0;
    master.connect(limiter);

    drone = new Drone(ctx, master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_BUS_GAIN;
    sfxBus.connect(master);

    voiceBus = ctx.createGain();
    voiceBus.gain.value = VOICE_BUS_GAIN;
    voiceBus.connect(master);

    ambienceBus = ctx.createGain();
    ambienceBus.gain.value = AMBIENCE_BUS_GAIN;
    ambienceBus.connect(master);

    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_BUS_GAIN;
    musicBus.connect(master);

    ambience = createAmbiencePool(ctx, ambienceBus);
    music = createMusic(ctx, musicBus);
    return ctx;
  }

  // Voice sidechain: while any voice-bus one-shot plays, the beds sit DUCK_DB
  // lower so the line reads over them. Nested-safe (a counter, not a flag).
  function duckBeds(on) {
    duckDepth = Math.max(0, duckDepth + (on ? 1 : -1));
    const target = duckDepth > 0 ? dbToGain(DUCK_DB) : 1;
    rampGain(ambienceBus.gain, ctx, AMBIENCE_BUS_GAIN * target, 250);
    rampGain(musicBus.gain, ctx, MUSIC_BUS_GAIN * target, 250);
  }

  function releaseOneShot(file, rec) {
    const list = oneShots.get(file);
    if (!list) return;
    const i = list.indexOf(rec);
    if (i !== -1) list.splice(i, 1);
    if (list.length === 0) oneShots.delete(file);
    try { rec.src.disconnect(); rec.gain.disconnect(); } catch (e) { /* already gone */ }
    if (rec.voice && rec.ducking) { rec.ducking = false; duckBeds(false); }
  }

  function fadeOutOneShot(file, rec, ms) {
    rampGain(rec.gain.gain, ctx, 0, ms);
    setTimeout(() => { rec.el.pause(); releaseOneShot(file, rec); }, ms + 30);
  }

  // The hum carries the drone's detune: where the drone is now, and the
  // ramp advanceScene() last scheduled for it, if that is still running.
  // Read only: nothing here writes to the drone (C7).
  function followDrone() {
    if (!hum) return;
    const d = hum.osc.detune, t = ctx.currentTime;
    d.cancelScheduledValues(t);
    const r = drone && drone.started && hum.follow ? drone.detuneTo : null;
    const now = hum.follow && drone && drone.started ? drone.osc.detune.value : 0;
    d.setValueAtTime(now, t);
    if (r && r.at > t) d.linearRampToValueAtTime(r.cents, r.at);
    hum.detuneTo = r ? r.cents : now;
  }

  return {
    // The first trusted gesture (a click to look, a key, a touch) unlocks
    // the AudioContext: room tone, footsteps and the music bus can sound
    // from the apartment on. The drone does NOT start here (C7).
    unlock() {
      ensureContext();
      music.start();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },

    // C7: the 48 Hz drone starts when the lobby doors close behind the
    // candidate (src/director.js), fades in over two seconds, and is never
    // stopped or restarted until the final card. Drone.start() is guarded,
    // so this is safe to call more than once.
    startDrone({ fadeMs = 2000 } = {}) {
      ensureContext();
      if (!drone.started) {
        // from silence: rampGain() cancels what is scheduled at this instant
        // and restarts from .value, which still reads full gain -- the fade
        // must be scheduled from 0 explicitly
        const g = drone.gain.gain;
        const t = ctx.currentTime;
        g.cancelScheduledValues(t);
        g.value = 0;
        g.setValueAtTime(0, t);
        g.linearRampToValueAtTime(DRONE_GAIN, t + Math.max(0.03, fadeMs / 1000));
        drone.start();
      }
    },

    // Old one-call path (tests, previews): unlock and start the drone at once.
    initOnGesture() {
      this.unlock();
      this.startDrone({ fadeMs: 30 });
    },

    // Doc 4 §7.4: if the context is suspended later, resume silently and log it.
    resumeIfSuspended() {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => console.log('audio.js: resumed suspended AudioContext'));
      }
    },

    advanceScene(sceneIndex) {
      if (drone) drone.advanceScene(sceneIndex);
      followDrone();
    },

    // The store's fluorescent hum (Doc 1 §6.4: "48 Hz, detuned exactly as
    // far as the building's drone. He never left."). An ambience setting
    // (scenes.json / endings.json `hum`: {hz = 48, gain = 0.018, lowpassHz =
    // 320, followDrone = true}): its own oscillator -- a buzzing saw through
    // a low-pass, on the master bus beside the drone -- that carries the
    // drone's current detune and every advanceScene() ramp after it while
    // `followDrone`. Setting it again while it plays retunes and re-levels
    // it, never restarts it; `null` fades it out over `ms` and frees it.
    // The drone is never started, stopped or retuned from here (C7).
    setHum(spec, { ms = 1500 } = {}) {
      if (!ctx) return;
      if (!spec) {
        if (!hum) return;
        const h = hum;
        hum = null;
        rampGain(h.gain.gain, ctx, 0, ms);
        h.osc.stop(ctx.currentTime + Math.max(0.03, ms / 1000) + 0.05);
        h.osc.onended = () => { try { h.osc.disconnect(); h.filter.disconnect(); h.gain.disconnect(); } catch (e) { /* already gone */ } };
        return;
      }
      if (!hum) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 0.7;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(filter).connect(gain).connect(master);
        osc.frequency.value = spec.hz || DRONE_HZ;
        osc.start();
        hum = { osc, filter, gain, follow: true, detuneTo: 0 };
      }
      rampGain(hum.osc.frequency, ctx, spec.hz || DRONE_HZ, ms);
      rampGain(hum.filter.frequency, ctx, spec.lowpassHz || 320, ms);
      rampGain(hum.gain.gain, ctx, spec.gain === undefined ? 0.018 : spec.gain, ms);
      hum.follow = spec.followDrone !== false;
      followDrone();
    },

    playAmbience(file, opts) {
      if (ambience) ambience.play(file, opts);
    },

    // Music bed (music.js): a mood name from scenes.json's `music` field, or
    // null to fade the bed out for the scene. Render-aware: the same mood
    // resolves warmer in C and colder in H.
    setMusic(spec, renderLetter) {
      if (music) music.setMood(spec, renderLetter);
    },

    // Real delivered one-shots, routed through the sfx bus (or the voice bus
    // for spoken lines, which ducks the beds underneath). Tracked so they
    // can be trimmed, capped, and faded on scene exit -- previously every
    // call leaked a fresh <audio> + two nodes and nothing ever stopped them.
    playOneShot(file, { base = './assets/aud/', gain = 1.0, fadeOutMs = 0 } = {}) {
      if (!ctx || !sfxBus || !file) return null;
      const now = performance.now();
      const list = oneShots.get(file) || [];
      const last = list[list.length - 1];
      if (last && now - last.startedAt < RETRIGGER_MIN_MS) return null; // debounce machine-gun retriggers
      while (list.length >= MAX_VOICES_PER_FILE) {
        const oldest = list.shift();
        oneShots.set(file, list);
        fadeOutOneShot(file, oldest, 120);
      }

      const el = new Audio(`${base}${file}`);
      const src = ctx.createMediaElementSource(el);
      const g = ctx.createGain();
      const voice = VOICE_FILES.has(file);
      g.gain.value = gain * sfxTrimFor(file);
      src.connect(g).connect(voice ? voiceBus : sfxBus);
      const rec = { el, src, gain: g, startedAt: now, voice, ducking: false };
      list.push(rec);
      oneShots.set(file, list);
      if (voice) { rec.ducking = true; duckBeds(true); }
      el.addEventListener('ended', () => releaseOneShot(file, rec), { once: true });
      el.addEventListener('error', () => releaseOneShot(file, rec), { once: true });
      el.play().catch((e) => {
        console.warn(`audio.js: one-shot play() blocked for ${file}`, e);
        releaseOneShot(file, rec);
      });
      if (fadeOutMs > 0) setTimeout(() => fadeOutOneShot(file, rec, 200), fadeOutMs);
      return {
        stop(ms = 150) { fadeOutOneShot(file, rec, ms); }
      };
    },

    // Scene-exit hygiene: fade every live one-shot (e.g. the 15s
    // receptionist line, which used to run through the S2->S3 transition
    // and over S3's ambience). Called by router.js before each transition.
    stopOneShots({ ms = 300 } = {}) {
      if (!ctx) return;
      for (const [file, list] of Array.from(oneShots.entries())) {
        for (const rec of Array.from(list)) fadeOutOneShot(file, rec, ms);
      }
    },

    // Filters, never stops, the drone (Doc 4 §7.3): underwater in the dive.
    duckDrone({ lowpassHz = 400, gain = 0.5, ms = 1200 } = {}) {
      if (!drone) return;
      const t = ctx.currentTime;
      const seconds = Math.max(0.03, ms / 1000);
      drone.lowpass.frequency.cancelScheduledValues(t);
      drone.lowpass.frequency.setValueAtTime(drone.lowpass.frequency.value, t);
      drone.lowpass.frequency.linearRampToValueAtTime(lowpassHz, t + seconds);
      rampGain(drone.gain.gain, ctx, DRONE_GAIN * gain, ms);
    },

    restoreDrone({ ms = 800 } = {}) {
      if (!drone) return;
      const t = ctx.currentTime;
      const seconds = Math.max(0.03, ms / 1000);
      drone.lowpass.frequency.cancelScheduledValues(t);
      drone.lowpass.frequency.setValueAtTime(drone.lowpass.frequency.value, t);
      drone.lowpass.frequency.linearRampToValueAtTime(20000, t + seconds);
      rampGain(drone.gain.gain, ctx, DRONE_GAIN, ms);
    },

    // Ending / bail: the beds, music and one-shots go first; the drone runs
    // to the final card (C7) and only then fades, over `droneMs`. Nothing
    // used to stop at all -- the S8 bed looped under the ending card forever.
    fadeOutForEnding({ bedsMs = 1500, droneMs = 6000 } = {}) {
      if (!ctx) return;
      if (ambience) ambience.fadeOut(bedsMs);
      if (music) music.stop(bedsMs);
      this.setHum(null, { ms: bedsMs });
      this.stopOneShots({ ms: Math.min(bedsMs, 600) });
      rampGain(drone.gain.gain, ctx, 0, droneMs);
      rampGain(drone.refGain.gain, ctx, 0, droneMs);
    },

    // Sound toggle (src/soundToggle.js). Ramped, not stepped, so flipping it
    // mid-scene isn't an audible click of its own. Safe to call before the
    // AudioContext exists (pre-SUBMIT) -- just updates the flag ensureContext()
    // reads when it eventually runs.
    setMuted(value) {
      muted = !!value;
      if (master) rampGain(master.gain, ctx, muted ? 0 : 1.0, 150);
    },
    toggleMute() {
      this.setMuted(!muted);
      return muted;
    },
    isMuted() { return muted; },

    // Exposed for sfx.js (Phase 6) and mini-games (Doc 4 §6.3: "requests
    // nodes from audio.js; must not create an AudioContext").
    getContext() { return ctx; },
    getSfxBus() { return sfxBus; },
    getMaster() { return master; },
    getMusic() { return music; },

    // Test-only introspection (test/cases/audio.drone.js, audio.mix.js).
    _debugDroneStartCount() { return drone && drone.started ? 1 : 0; },
    _debugDetuneValue() { return drone ? drone.osc.detune.value : null; },
    _debugDroneDetuneTo() { return drone && drone.detuneTo ? drone.detuneTo.cents : null; },
    _debugHum() { return hum ? { hz: hum.osc.frequency.value, follow: hum.follow, detuneTo: hum.detuneTo } : null; },
    _debugBusGains() {
      return ctx ? { ambience: ambienceBus.gain.value, sfx: sfxBus.gain.value, music: musicBus.gain.value, voice: voiceBus.gain.value, limiterThreshold: limiter.threshold.value } : null;
    },
    _debugOneShotCount() { let n = 0; for (const l of oneShots.values()) n += l.length; return n; }
  };
}
