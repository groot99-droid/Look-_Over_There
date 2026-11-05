// Liminal music bed. Entirely generative Web Audio -- no licensed tracks,
// nothing to download, nothing to attribute -- so "free liminal music" is
// literally free and ships inside the repo's no-build static model (Doc 4
// §1). Hangs off audio.js's music bus (it never creates an AudioContext,
// Doc 4 §6.3 applies to it the same as to a mini-game) and starts on the
// same S0 gesture as the drone.
//
// Two engines, chosen per scene by scenes.json's `music` field:
//
//   "muzak"  Doc 1 §5 S1: "Muzak, tinny, from a speaker you cannot locate ...
//            the same eight bars, forever." An 8-bar loop on a band-passed
//            triangle, a lounge bass under it, small room reverb. In the
//            hostile render it runs at 80% speed AND pitch (Doc 1: "Muzak at
//            80% speed"), the same treatment S1_H_AMB.wav got.
//   "pad"    The liminal bed proper: slow detuned chords a fifth above the
//            48 Hz drone (G), 5-second attacks, a breathing low-pass, a long
//            procedurally-generated reverb tail. Compliant renders get major
//            sevenths and suspensions; hostile renders get minor/half-
//            diminished voicings of the same roots, so the room is the same
//            room, angrier (Doc 1 §1.2). "deep" and "water" are pad presets
//            that sit lower / darker for the descent and the pool.
//
// Optional external track: `music: { file: "some.mp3" }` in scenes.json
// loops a file from assets/aud/music/ through the same bus with the same
// crossfade, if a real recording is ever dropped in. Nothing ships there.

const PAD_GAIN = 0.11;
const MUZAK_GAIN = 0.06;
const FILE_GAIN = 0.35;
const MOOD_CROSSFADE_MS = 2500;
const CHORD_HOLD_MS = 14000;
const CHORD_FADE_S = 5.0;

// Frequencies relative to G2 (98 Hz): intervals in semitones.
const G2 = 98.0;
const st = (n) => G2 * Math.pow(2, n / 12);

// Chord tables per preset and render. Every chord is a list of semitone
// offsets from G2; roots stay in G so the bed never fights the drone.
const PAD_CHORDS = {
  pad: {
    C: [[0, 7, 11, 14], [5, 12, 16, 19], [-3, 4, 7, 14], [7, 11, 14, 21]],           // Gmaj7 Cmaj9 Em9 D6/9
    H: [[0, 3, 7, 14], [-4, 3, 7, 13], [5, 8, 12, 17], [-1, 2, 5, 11]]                // Gm(add9) Ebmaj7#11 Cm(add9) F#dim(add4)
  },
  deep: {
    C: [[-12, -5, 2, 7], [-7, 0, 4, 11], [-12, -1, 7, 11], [-9, -2, 5, 12]],
    H: [[-12, -9, -2, 3], [-13, -6, -1, 6], [-12, -5, 1, 8], [-11, -8, -2, 4]]
  },
  water: {
    C: [[-12, 2, 7, 16], [-7, 4, 11, 18], [-12, 0, 9, 14], [-10, 2, 9, 16]],
    H: [[-12, -2, 3, 10], [-13, -6, 1, 8], [-12, -3, 3, 13], [-14, -5, 1, 8]]
  }
};
const PAD_PRESET = {
  pad:   { cutoff: 900,  lfoHz: 0.045, lfoDepth: 350, detuneCents: 7, reverbSeconds: 5.0 },
  deep:  { cutoff: 520,  lfoHz: 0.03,  lfoDepth: 220, detuneCents: 9, reverbSeconds: 6.5 },
  water: { cutoff: 700,  lfoHz: 0.02,  lfoDepth: 400, detuneCents: 5, reverbSeconds: 8.0 }
};

// Muzak: 8 bars in G major at 92 bpm, [semitone offset from G3, beats].
// Deliberately square and forgettable -- the kind of thing that plays over
// hold music -- and it never resolves on the last bar, so the loop seam is
// the tune.
const MUZAK_BPM = 92;
const MUZAK_MELODY = [
  [12, 1], [16, 1], [19, 1.5], [16, 0.5], [14, 1], [12, 1], [11, 2],
  [12, 1], [16, 1], [19, 1], [21, 1], [19, 2], [16, 2],
  [14, 1], [16, 1], [17, 1.5], [16, 0.5], [14, 1], [12, 1], [9, 2],
  [11, 1], [12, 1], [14, 1], [16, 1], [14, 3], [null, 1]
];
const MUZAK_BASS = [[0, 2], [7, 2], [-3, 2], [4, 2], [5, 2], [0, 2], [2, 2], [-5, 2]];

function makeImpulse(ctx, seconds, decay = 2.4) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - Math.exp(-i / 800));
    }
  }
  return buf;
}

export function createMusic(ctx, bus) {
  let started = false;
  let current = null;       // { key, stop(ms) }
  let currentKey = null;
  const reverbs = new Map();

  function reverbFor(seconds) {
    const key = seconds.toFixed(1);
    if (!reverbs.has(key)) {
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx, seconds);
      reverbs.set(key, conv);
    }
    return reverbs.get(key);
  }

  function rampTo(param, target, seconds) {
    const t = ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(target, t + Math.max(0.03, seconds));
  }

  // ---- pad engine --------------------------------------------------------
  function startPad(presetName, render) {
    const preset = PAD_PRESET[presetName] || PAD_PRESET.pad;
    const chords = (PAD_CHORDS[presetName] || PAD_CHORDS.pad)[render === 'H' ? 'H' : 'C'];
    const out = ctx.createGain();
    out.gain.value = 0;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = preset.cutoff;
    lowpass.Q.value = 0.7;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = preset.lfoHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = preset.lfoDepth;
    lfo.connect(lfoGain).connect(lowpass.frequency);
    lfo.start();

    const dry = ctx.createGain();
    dry.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    const reverb = reverbFor(preset.reverbSeconds);
    lowpass.connect(dry).connect(out);
    lowpass.connect(reverb);
    reverb.connect(wet).connect(out);
    out.connect(bus);

    let voices = [];
    let chordIndex = Math.floor(Math.random() * chords.length);
    let timer = null;
    let alive = true;

    function playChord(offsets) {
      const t = ctx.currentTime;
      const chordGain = ctx.createGain();
      chordGain.gain.setValueAtTime(0.0001, t);
      chordGain.gain.linearRampToValueAtTime(1, t + CHORD_FADE_S);
      chordGain.connect(lowpass);
      const oscs = [];
      offsets.forEach((semi, i) => {
        for (const [type, cents] of [['triangle', -preset.detuneCents], ['sine', preset.detuneCents]]) {
          const osc = ctx.createOscillator();
          osc.type = type;
          osc.frequency.value = st(semi);
          osc.detune.value = cents * (i % 2 === 0 ? 1 : -1);
          const g = ctx.createGain();
          g.gain.value = (type === 'sine' ? 0.6 : 0.45) / offsets.length;
          osc.connect(g).connect(chordGain);
          osc.start(t);
          oscs.push(osc);
        }
      });
      const voice = { chordGain, oscs };
      // Retire the previous chord over the same fade so the two overlap.
      for (const old of voices) {
        old.chordGain.gain.cancelScheduledValues(t);
        old.chordGain.gain.setValueAtTime(old.chordGain.gain.value, t);
        old.chordGain.gain.linearRampToValueAtTime(0.0001, t + CHORD_FADE_S);
        for (const o of old.oscs) o.stop(t + CHORD_FADE_S + 0.1);
      }
      voices = [voice];
    }

    function next() {
      if (!alive) return;
      playChord(chords[chordIndex]);
      chordIndex = (chordIndex + 1 + Math.floor(Math.random() * (chords.length - 1))) % chords.length;
      timer = setTimeout(next, CHORD_HOLD_MS + Math.random() * 4000);
    }
    next();
    rampTo(out.gain, PAD_GAIN, MOOD_CROSSFADE_MS / 1000);

    return {
      key: `${presetName}:${render}`,
      stop(ms = MOOD_CROSSFADE_MS) {
        alive = false;
        if (timer) clearTimeout(timer);
        rampTo(out.gain, 0, ms / 1000);
        setTimeout(() => {
          for (const v of voices) for (const o of v.oscs) { try { o.stop(); } catch (e) { /* already stopped */ } }
          try { lfo.stop(); } catch (e) { /* noop */ }
          out.disconnect();
        }, ms + 100);
      }
    };
  }

  // ---- muzak engine ------------------------------------------------------
  function startMuzak(render) {
    const rate = render === 'H' ? 0.8 : 1.0; // 80% speed + pitch in the hostile render
    const beat = 60 / (MUZAK_BPM * rate);
    const out = ctx.createGain();
    out.gain.value = 0;

    // "Tinny, from a speaker you cannot locate": a narrow band-pass is the
    // whole speaker model.
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 1.1;
    const reverb = reverbFor(1.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    bp.connect(out);
    bp.connect(reverb);
    reverb.connect(wet).connect(out);
    out.connect(bus);

    let alive = true;
    let timer = null;
    const scheduled = [];

    function note(semi, when, dur, type, level, octave = 0) {
      if (semi === null) return;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = st(semi + 12 + octave) * rate;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(level, when + 0.02);
      g.gain.setValueAtTime(level, when + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g).connect(bp);
      osc.start(when);
      osc.stop(when + dur + 0.05);
      scheduled.push(osc);
    }

    function scheduleLoop(startAt) {
      let t = startAt;
      for (const [semi, beats] of MUZAK_MELODY) {
        note(semi, t, beats * beat * 0.95, 'triangle', 0.5);
        t += beats * beat;
      }
      let tb = startAt;
      for (let bar = 0; bar < 2; bar++) {
        for (const [semi, beats] of MUZAK_BASS) {
          note(semi, tb, beats * beat * 0.9, 'sine', 0.35, -12);
          tb += beats * beat;
        }
      }
      return t; // 8 bars later
    }

    let nextStart = ctx.currentTime + 0.1;
    function pump() {
      if (!alive) return;
      while (nextStart < ctx.currentTime + 2.0) nextStart = scheduleLoop(nextStart);
      while (scheduled.length > 200) scheduled.shift();
      timer = setTimeout(pump, 500);
    }
    pump();
    rampTo(out.gain, MUZAK_GAIN, MOOD_CROSSFADE_MS / 1000);

    return {
      key: `muzak:${render}`,
      stop(ms = MOOD_CROSSFADE_MS) {
        alive = false;
        if (timer) clearTimeout(timer);
        rampTo(out.gain, 0, ms / 1000);
        setTimeout(() => {
          for (const o of scheduled) { try { o.stop(); } catch (e) { /* already stopped */ } }
          out.disconnect();
        }, ms + 100);
      }
    };
  }

  // ---- external file (optional) ------------------------------------------
  function startFile(file, base = './assets/aud/music/') {
    const el = new Audio(`${base}${file}`);
    el.loop = true;
    const src = ctx.createMediaElementSource(el);
    const out = ctx.createGain();
    out.gain.value = 0;
    src.connect(out).connect(bus);
    el.play().then(() => rampTo(out.gain, FILE_GAIN, MOOD_CROSSFADE_MS / 1000)).catch((e) => console.warn('music.js: file play() blocked', e));
    return {
      key: `file:${file}`,
      stop(ms = MOOD_CROSSFADE_MS) {
        rampTo(out.gain, 0, ms / 1000);
        setTimeout(() => { el.pause(); src.disconnect(); out.disconnect(); }, ms + 100);
      }
    };
  }

  function keyFor(spec, render) {
    if (!spec) return null;
    if (typeof spec === 'string') return `${spec}:${render}`;
    if (spec.file) return `file:${spec.file}`;
    if (spec.mood) return `${spec.mood}:${render}`;
    return null;
  }

  return {
    start() { started = true; },

    // spec: "muzak" | "pad" | "deep" | "water" | { mood } | { file } | null
    setMood(spec, render = 'C') {
      if (!started) return;
      const key = keyFor(spec, render);
      if (key === currentKey) return;
      if (current) current.stop(MOOD_CROSSFADE_MS);
      current = null;
      currentKey = key;
      if (!key) return;
      if (typeof spec === 'object' && spec.file) current = startFile(spec.file);
      else {
        const mood = typeof spec === 'string' ? spec : spec.mood;
        current = mood === 'muzak' ? startMuzak(render) : startPad(mood, render);
      }
    },

    stop(ms = MOOD_CROSSFADE_MS) {
      if (current) current.stop(ms);
      current = null;
      currentKey = null;
    },

    isStarted() { return started; },
    currentKey() { return currentKey; },
    presets: Object.keys(PAD_PRESET).concat(['muzak'])
  };
}
