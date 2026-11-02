// Doc 4 §10 Phase 6 / plan §7: originally no VO or mechanical SFX files were
// generated (README "Not generated" list -- speaker click/hiss, receptionist
// lines, stapler thud, CRT degauss, door screech, car alarm, package drag,
// concrete grains, chute scrape), so every cue below was a procedural Web
// Audio stand-in: noise bursts + envelopes, filtered clicks, oscillator
// sweeps. Most of that list has since been recorded for real (REAL_FILES
// below) and routed through audio.js's playOneShot() instead of synthesis --
// see each cue's real-file entry. The receptionist's spoken lines are the
// one deliberate exception kept out of CUES entirely: her words are already
// full UI text in text/system.json, presented as on-screen text cards, and
// this module still does not fake dialogue with TTS. `receptionist-voice`
// is real recorded audio (REAL_FILES only, no synthesized fallback) played
// alongside those cards, not a replacement for them.
//
// For everything still without a real recording, this module keeps
// providing the clearly-labeled engine-synthesized stand-in so mini-games
// get *some* diegetic audio feedback instead of silence. Doc 4 §6.3:
// mini-games request nodes from audio.js's bus; this module is itself the
// only thing allowed to build synthesis graphs, and it never creates its
// own AudioContext -- it uses audio.getContext()/getSfxBus().

function noiseBurst(ctx, bus, { durationMs = 120, filterHz = 2000, filterType = 'bandpass', gain = 0.3 }) {
  const sampleCount = Math.max(1, Math.floor((ctx.sampleRate * durationMs) / 1000));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterHz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);

  src.connect(filter).connect(g).connect(bus);
  src.start();
  src.stop(ctx.currentTime + durationMs / 1000 + 0.05);
}

function toneClick(ctx, bus, { freq = 220, durationMs = 60, gain = 0.4, type = 'square' }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
  osc.connect(g).connect(bus);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000 + 0.05);
}

function pitchSweep(ctx, bus, { from = 800, to = 80, durationMs = 400, gain = 0.35, type = 'sawtooth' }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), ctx.currentTime + durationMs / 1000);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
  osc.connect(g).connect(bus);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000 + 0.05);
}

// A breath, not a click: low-passed noise that swells and falls away (an
// exhale); with `inhale` a quieter, brighter draw comes first. Synthesized,
// a labelled stand-in for one's own breathing -- never a voice.
function breathe(ctx, bus, { durationMs = 300, filterHz = 800, gain = 0.08, inhale = false }) {
  const one = (at, ms, hz, g) => {
    const s = ms / 1000;
    const n = Math.max(1, Math.floor(ctx.sampleRate * s));
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, g), at + s * 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, at + s);
    src.connect(filter).connect(env).connect(bus);
    src.start(at);
    src.stop(at + s + 0.05);
  };
  const t = ctx.currentTime;
  if (inhale) {
    one(t, durationMs * 0.7, filterHz * 1.7, gain * 0.4);
    one(t + (durationMs * 0.85) / 1000, durationMs, filterHz, gain);
  } else one(t, durationMs, filterHz, gain);
}

const CUES = {
  'speaker-click': (ctx, bus) => toneClick(ctx, bus, { freq: 1200, durationMs: 15, gain: 0.25, type: 'square' }),
  'speaker-hiss': (ctx, bus) => noiseBurst(ctx, bus, { durationMs: 250, filterHz: 4000, filterType: 'highpass', gain: 0.15 }),
  'stapler-thud': (ctx, bus) => {
    toneClick(ctx, bus, { freq: 90, durationMs: 40, gain: 0.5, type: 'square' });
    noiseBurst(ctx, bus, { durationMs: 30, filterHz: 1500, gain: 0.2 });
  },
  'flag-reject-beep': (ctx, bus) => toneClick(ctx, bus, { freq: 320, durationMs: 90, gain: 0.3, type: 'square' }),
  'requisition-chime': (ctx, bus, { detuneCents = 0 } = {}) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.detune.value = detuneCents;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.connect(g).connect(bus);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  },
  'door-rattle': (ctx, bus, opts = {}) => noiseBurst(ctx, bus, { durationMs: 80, filterHz: 300, filterType: 'lowpass', gain: 0.35, ...opts }),
  'metal-tear-screech': (ctx, bus) => pitchSweep(ctx, bus, { from: 1800, to: 200, durationMs: 900, gain: 0.3, type: 'sawtooth' }),
  'crt-degauss': (ctx, bus) => pitchSweep(ctx, bus, { from: 60, to: 400, durationMs: 350, gain: 0.25, type: 'triangle' }),
  'car-alarm': (ctx, bus) => {
    toneClick(ctx, bus, { freq: 1100, durationMs: 120, gain: 0.3, type: 'square' });
  },
  'concrete-grains': (ctx, bus) => noiseBurst(ctx, bus, { durationMs: 600, filterHz: 3000, filterType: 'highpass', gain: 0.12 }),
  'chute-scrape': (ctx, bus) => noiseBurst(ctx, bus, { durationMs: 1200, filterHz: 800, filterType: 'lowpass', gain: 0.2 }),
  'package-drag': (ctx, bus) => noiseBurst(ctx, bus, { durationMs: 500, filterHz: 500, filterType: 'lowpass', gain: 0.18 }),
  'starter-motor': (ctx, bus) => {
    noiseBurst(ctx, bus, { durationMs: 200, filterHz: 600, gain: 0.25 });
    toneClick(ctx, bus, { freq: 60, durationMs: 200, gain: 0.3, type: 'square' });
  },
  // Added alongside the RETAINED ending / real-SFX pass -- no synthesized
  // stand-in previously existed because nothing called these yet.
  'curtain-rustle': (ctx, bus) => noiseBurst(ctx, bus, { durationMs: 350, filterHz: 1200, filterType: 'lowpass', gain: 0.15 }),
  'paper-handoff': (ctx, bus) => noiseBurst(ctx, bus, { durationMs: 300, filterHz: 2500, filterType: 'highpass', gain: 0.15 }),
  'keyboard-press': (ctx, bus) => toneClick(ctx, bus, { freq: 1800, durationMs: 12, gain: 0.15, type: 'square' }),
  // Walk mode (src/walk/): one soft footfall per stride, surface-tinted via
  // opts.filterHz (marble rings higher than carpet); a `footfall` beat
  // makes them heavier (gain up, filterHz down, durationMs longer).
  // Always synthesized.
  'footstep': (ctx, bus, opts = {}) => noiseBurst(ctx, bus, { durationMs: opts.durationMs || 70, filterHz: opts.filterHz || 700, filterType: 'bandpass', gain: opts.gain || 0.12 }),
  // His breathing (S6 H's run: director.js `breath` layer, deeper and
  // further apart down the run -- filterHz down, durationMs and gain up).
  // Synthesized; the delivered S6_H bed is deliberately event-free (MANIFEST).
  'breath': (ctx, bus, opts = {}) => breathe(ctx, bus, opts),
  // Deliberately silent with no real file: see the header comment. Exists
  // so branch.sfxCue entries can reference it without an "unknown cue" log.
  'receptionist-voice': () => {},
  // The continuous building: doors that seal behind the candidate, the
  // lobby's buzzer, the deadbolt in the apartment, the cab's motor, the
  // splash into the pool.
  'door-thud': (ctx, bus) => { noiseBurst(ctx, bus, { durationMs: 160, filterHz: 180, filterType: 'lowpass', gain: 0.45 }); toneClick(ctx, bus, { freq: 70, durationMs: 120, gain: 0.25, type: 'sine' }); },
  'door-buzz': (ctx, bus) => pitchSweep(ctx, bus, { from: 118, to: 122, durationMs: 700, gain: 0.12, type: 'sawtooth' }),
  'deadbolt': (ctx, bus) => { toneClick(ctx, bus, { freq: 900, durationMs: 25, gain: 0.25, type: 'square' }); noiseBurst(ctx, bus, { durationMs: 90, filterHz: 1400, filterType: 'bandpass', gain: 0.25 }); },
  // `durationMs`: as long as the ride (rideCab passes its seconds)
  'elevator-motor': (ctx, bus, o = {}) => pitchSweep(ctx, bus, { from: 62, to: 44, durationMs: o.durationMs || 4000, gain: 0.22, type: 'triangle' }),
  'splash': (ctx, bus) => { noiseBurst(ctx, bus, { durationMs: 900, filterHz: 1300, filterType: 'bandpass', gain: 0.35 }); noiseBurst(ctx, bus, { durationMs: 1800, filterHz: 300, filterType: 'lowpass', gain: 0.2 }); },
  'stamp': (ctx, bus) => toneClick(ctx, bus, { freq: 140, durationMs: 60, gain: 0.18, type: 'square' })
};

// Real recordings that replace a synthesized CUES entry above, keyed by the
// same cue name. play() below checks here first; if audio.playOneShot()
// exists, the file plays instead of the procedural stand-in. Filenames
// follow the S{n}_{R}_SFX_* scheme (README's "outside §1" table); X means a
// file shared by both branches of a scene, same convention as S0_X_*.
const REAL_FILES = {
  'speaker-click': 'S2_C_SFX_SPEAKER.wav',
  'speaker-hiss': 'S2_H_SFX_SPEAKER.wav',
  'receptionist-voice': 'S2_X_SFX_RECEPTIONIST.wav',
  'curtain-rustle': 'S3_C_SFX_CURTAIN.wav',
  'door-rattle': 'S3_H_SFX_DOOR.wav',
  'paper-handoff': 'S4_C_SFX_PAPERS.wav',
  'stapler-thud': 'S5_C_SFX_STAPLER.wav',
  'crt-degauss': 'S5_C_SFX_CRT_ON.wav',
  'car-alarm': 'S5_H_SFX_CARALARM.wav',
  'keyboard-press': 'S6_C_SFX_KEYBOARD.wav'
};

export const REAL_SFX_FILES = REAL_FILES; // exported for test/cases/manifest.validate.js

export function createSfx(audio) {
  return {
    play(name, opts) {
      const ctx = audio && audio.getContext ? audio.getContext() : null;
      const bus = audio && audio.getSfxBus ? audio.getSfxBus() : null;
      // silent no-op before the first activating gesture (Doc 4 §7.4), and
      // while the context is suspended: cues scheduled on a frozen clock all
      // fire at once when it resumes
      if (!ctx || !bus || ctx.state !== 'running') return;

      const realFile = REAL_FILES[name];
      if (realFile && audio.playOneShot) {
        // opts (e.g. MG-02 H's per-push `gain`) used to be dropped on this
        // path, so "each push fractionally quieter" never happened.
        const o = opts || {};
        audio.playOneShot(realFile, typeof o.volume === 'number' ? { ...o, gain: (typeof o.gain === 'number' ? o.gain : 1) * o.volume } : o);
        return;
      }

      const cue = CUES[name];
      if (!cue) {
        console.debug(`sfx.js: unknown cue "${name}"`);
        return;
      }
      // `volume` scales any synthesized cue (a door closing 20 m off is a
      // click); a cue's own `gain` option, where it has one, is its level
      if (opts && typeof opts.volume === 'number' && opts.volume !== 1) {
        const g = ctx.createGain();
        g.gain.value = Math.max(0, opts.volume);
        g.connect(bus);
        cue(ctx, g, opts);
        setTimeout(() => { try { g.disconnect(); } catch (e) { /* already gone */ } }, 6000);
        return;
      }
      cue(ctx, bus, opts);
    },
    availableCues: Object.keys(CUES)
  };
}
