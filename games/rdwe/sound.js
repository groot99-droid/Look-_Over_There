// Small synthesized sounds for the walk scenes (WebAudio, no files): the hum of the
// mutated room, the digital chime of the anomaly, a drip, a metal groan and the radar
// ping, and for the mini games a pickup thunk, a wrong-guess blip and a three-note win.
// The chapter's own track (script.js's sectionAudio) keeps playing underneath; these sit
// on a master gain that follows the game's SOUND ON / OFF toggle.
let ctx = null;
let master = null;
let enabled = true;
let humNodes = null;
let buzzNodes = null;

function context() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 1 : 0;
  master.connect(ctx.destination);
  return ctx;
}

export function setEnabled(on) {
  enabled = !!on;
  if (master) master.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.05);
}

// Call from a user gesture path (the walk starts after NEXT was pressed).
export function resume() {
  const c = context();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function env(node, t0, attack, hold, release, peak = 1) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  node.gain.setValueAtTime(peak, t0 + attack + hold);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

// A two-note digital chime (the anomaly / the radar's "1 FOUND").
export function chime() {
  const c = context();
  if (!c) return;
  const t = c.currentTime;
  [[880, 0], [1318.5, 0.16]].forEach(([f, d]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    env(g, t + d, 0.01, 0.12, 0.5, 0.18);
    o.connect(g).connect(master);
    o.start(t + d);
    o.stop(t + d + 0.8);
  });
}

// Radar ping: a short filtered blip.
export function ping() {
  const c = context();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(1500, t);
  o.frequency.exponentialRampToValueAtTime(900, t + 0.12);
  env(g, t, 0.005, 0.03, 0.18, 0.06);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.3);
}

// A drop hitting water: a pitched-down blip with a little noise.
export function drip(pan = 0) {
  const c = context();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(1900 + Math.random() * 600, t);
  o.frequency.exponentialRampToValueAtTime(500, t + 0.09);
  env(g, t, 0.003, 0.01, 0.12, 0.05);
  let out = g;
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); out = p; }
  o.connect(g);
  out.connect(master);
  o.start(t);
  o.stop(t + 0.2);
}

// A low groan of stressed metal.
export function groan() {
  const c = context();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(48, t);
  o.frequency.linearRampToValueAtTime(34, t + 1.6);
  f.type = 'lowpass';
  f.frequency.value = 180;
  f.Q.value = 6;
  env(g, t, 0.3, 0.6, 0.9, 0.14);
  o.connect(f).connect(g).connect(master);
  o.start(t);
  o.stop(t + 2.0);
}

// The room's hum: a detuned pair of low oscillators; level 0..1 sets loudness and pitch.
export function hum(level) {
  const c = context();
  if (!c) return;
  if (!humNodes) {
    const g = c.createGain();
    g.gain.value = 0.0001;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    const a = c.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 55;
    const b = c.createOscillator(); b.type = 'sawtooth'; b.frequency.value = 55.7;
    a.connect(f); b.connect(f);
    f.connect(g).connect(master);
    a.start(); b.start();
    humNodes = { g, f, a, b };
  }
  const l = Math.max(0, Math.min(1, level));
  const t = c.currentTime;
  humNodes.g.gain.setTargetAtTime(0.0001 + l * 0.12, t, 0.15);
  humNodes.f.frequency.setTargetAtTime(160 + l * 500, t, 0.2);
  humNodes.a.frequency.setTargetAtTime(52 + l * 14, t, 0.3);
  humNodes.b.frequency.setTargetAtTime(52.7 + l * 14.4, t, 0.3);
}

// The fluorescent buzz of the hallway: a thin 120 Hz sawtooth with its harmonics through a
// band-pass, so it sits above the hum rather than under it. level 0..1.
export function buzz(level) {
  const c = context();
  if (!c) return;
  if (!buzzNodes) {
    const g = c.createGain();
    g.gain.value = 0.0001;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 1.2;
    const a = c.createOscillator(); a.type = 'sawtooth'; a.frequency.value = 120;
    const b = c.createOscillator(); b.type = 'square'; b.frequency.value = 240.5;
    const bg = c.createGain(); bg.gain.value = 0.25;
    a.connect(f); b.connect(bg).connect(f);
    f.connect(g).connect(master);
    a.start(); b.start();
    buzzNodes = { g, f, a, b };
  }
  const l = Math.max(0, Math.min(1, level));
  const t = c.currentTime;
  buzzNodes.g.gain.setTargetAtTime(0.0001 + l * 0.045, t, 0.2);
  buzzNodes.f.frequency.setTargetAtTime(900 + l * 1600, t, 0.3);
}

// A light switch: a short, dry click (a filtered noise burst with a tiny pitched tail).
export function click() {
  const c = context();
  if (!c) return;
  const t = c.currentTime;
  const len = 0.03;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1800;
  const g = c.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.02);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(2600, t);
  o.frequency.exponentialRampToValueAtTime(900, t + 0.04);
  env(og, t, 0.002, 0.005, 0.05, 0.08);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.1);
}

// Taking or placing something in a mini game: a dull thunk with a scrape of paper or tin.
export function pickup() {
  const c = context();
  if (!c) return;
  const t = c.currentTime;
  const len = 0.07;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1400;
  f.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.03);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
  env(og, t, 0.004, 0.02, 0.14, 0.2);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.25);
}

// A wrong guess: a low square blip that falls away.
export function wrong() {
  const c = context();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  const f = c.createBiquadFilter();
  o.type = 'square';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.22);
  f.type = 'lowpass';
  f.frequency.value = 900;
  env(g, t, 0.005, 0.08, 0.2, 0.06);
  o.connect(f).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.4);
}

// A mini game finished: three soft rising notes, the anomaly's chime stretched out.
export function win() {
  const c = context();
  if (!c) return;
  const t = c.currentTime;
  [[659.25, 0], [880, 0.18], [1318.5, 0.36]].forEach(([fr, dl]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = fr;
    env(g, t + dl, 0.01, 0.16, 0.8, 0.15);
    o.connect(g).connect(master);
    o.start(t + dl);
    o.stop(t + dl + 1.1);
  });
}

// Stops the sustained sounds (the hum and the buzz) when a walk ends.
export function stopHum() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const n of [humNodes, buzzNodes]) {
    if (!n) continue;
    n.g.gain.setTargetAtTime(0.0001, t, 0.1);
    setTimeout(() => { try { n.a.stop(); n.b.stop(); } catch (_) { /* ignore */ } }, 600);
  }
  humNodes = null;
  buzzNodes = null;
}
