// The game's audio engine (Web Audio). Sounds are built at deploy time from the author's sound library (tools/build_audio.py -> audio/files/*.ogg);
// if they are missing the engine stays silent and the game plays on. Rules that need no audio device live in shared/mix.js.
import {levelMix, danger, smooth, occlusion, audibleRange, monsterStepInterval, stepInterval, stepGain, alarmPeriod, sirenFreq, growlFor, LAYERS} from "../shared/mix.js";

const CUE_GAIN = {step_tile: .5, step_floor: .5, hurt: .9, pickup: .5, ui: .4, door_open: .7, door_close: .7, door_creak: .6, lock: .6, unlock: .6, locker: .7, fuse_take: .6, fuse_slot: .8, fuse_drop: .7,
  switch: .7, power: .7, key_press: .35, key_ok: .5, key_bad: .5, key_lock: .5, gun: .85, gun_dry: .4, zap: .8, beacon_roll: .5, beacon_tick: .25, beacon_end: .5, cloak_on: .5, cloak_off: .5, cloak_flat: .4,
  mon_growl_1: 1, mon_growl_2: 1, mon_growl_3: 1, mon_roar: 1, mon_idle: .5, mon_step: .8, st_notice: .7, st_down: .8, st_lift: .5, st_fuse: .6, st_power: .6, st_finale: .7, st_exit: .6, heart: .8, heart_fast: .8};
const STORE = "lot-audio", MAX_VOICES = 34;

export function createAudio({base = "audio/files/", enabled = true} = {}) {
  const A = {status: enabled ? "idle" : "off", ctx: null, index: null, settings: {master: 0.9, music: 0.7, sfx: 0.9, mute: false}, level: null, voices: 0, listener: {x: 0, y: 0, z: 0}, stats: {played: 0, dropped: 0}};
  try { Object.assign(A.settings, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch (e) { /* private window: defaults */ }
  const bufs = new Map(); let bus = null, reverb = null, music = null, token = 0, duckUntil = 0, alarm = null, noticeAt = -99; const mons = new Map(), peers = new Map();
  const smoothed = {t1: 0, t2: 0, t3: 0, heart: 0, heartFast: 0, duck: 1};

  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(A.settings)); } catch (e) { /* ignore */ } };
  const ramp = (param, v, tc = 0.08) => { try { param.setTargetAtTime(v, A.ctx.currentTime, tc); } catch (e) { param.value = v; } };
  function applyVolumes() { if (!bus) return; ramp(bus.master.gain, A.settings.mute ? 0 : A.settings.master); ramp(bus.music.gain, A.settings.music); ramp(bus.sfx.gain, A.settings.sfx); ramp(bus.ui.gain, A.settings.sfx); }

  // ---- start-up: the context needs a user gesture; the index says which files exist
  A.unlock = async function () {
    if (!enabled || A.status === "off") return false;
    if (!A.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) { A.status = "off"; return false; }
      A.ctx = new Ctx({latencyHint: "interactive"});
      const c = A.ctx, master = c.createGain(), comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
      bus = {master, music: c.createGain(), sfx: c.createGain(), ui: c.createGain(), rvIn: c.createGain()};
      bus.music.connect(master); bus.sfx.connect(master); bus.ui.connect(master); master.connect(comp); comp.connect(c.destination);
      reverb = c.createConvolver(); reverb.buffer = impulse(c); bus.rvIn.gain.value = 0.16; bus.rvIn.connect(reverb); reverb.connect(master);
      applyVolumes();
      try { const r = await fetch(base + "index.json"); A.index = r.ok ? await r.json() : null; } catch (e) { A.index = null; }
      let failed = false; try { failed = (await fetch(base + "FAILED")).ok; } catch (e) { /* none */ }
      A.status = A.index && Object.keys(A.index).length && !failed ? "ok" : "silent";
    }
    if (A.ctx.state === "suspended") { try { await A.ctx.resume(); } catch (e) { /* needs another gesture */ } }
    if (A.status === "ok" && A.pendingLevel) A.setLevel(A.pendingLevel);
    return A.ctx.state === "running";
  };
  function impulse(c) {                                                                  // a short generated reverb tail, no asset
    const len = Math.floor(c.sampleRate * 2.0), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    return b;
  }
  const have = key => !!(A.index && A.index[key]);
  function buf(key) {
    if (!have(key)) return Promise.resolve(null);
    if (!bufs.has(key)) bufs.set(key, fetch(base + A.index[key].file).then(r => r.arrayBuffer()).then(d => A.ctx.decodeAudioData(d)).catch(() => null));
    return bufs.get(key);
  }
  A.preload = keys => Promise.all(keys.map(buf));

  // ---- voices: one-shots and loops, optionally placed in 3D
  function panner(o) {
    const c = A.ctx, p = c.createPanner(); p.panningModel = "HRTF"; p.distanceModel = "inverse"; p.refDistance = 2.2; p.maxDistance = 55; p.rolloffFactor = 1.5;
    setPos(p, o.pos[0], o.pos[1], o.pos[2]); return p;
  }
  function setPos(p, x, y, z) { if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); }
  A.setListener = function (x, y, z, yaw) {
    A.listener = {x, y, z}; if (!A.ctx) return; const l = A.ctx.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (l.positionX) { l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z; l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
    else { l.setPosition(x, y, z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
  };
  // play(key, {gain, rate, pos: [x,y,z], bus: "sfx"|"ui"|"music", loop, occluded}) -> a handle at once ({stop, set}); the sound starts when its file has loaded
  A.play = function (key, o = {}) {
    const h = {stopped: false, node: null, stop() { h.stopped = true; try { h.src && h.src.stop(); } catch (e) { /* ended */ } }, setOcclusion() {}, setPos() {}, setGain() {}};
    if (A.status !== "ok" || !A.ctx || A.ctx.state !== "running" || !have(key)) return h;
    if (A.voices >= MAX_VOICES && !o.priority) { A.stats.dropped++; return h; }
    const d = o.pos ? Math.hypot(o.pos[0] - A.listener.x, o.pos[2] - A.listener.z) : 0;
    if (o.pos && d > audibleRange(o.loud)) { A.stats.dropped++; return h; }
    A.voices++; A.stats.played++;
    buf(key).then(b => {
      if (!b || h.stopped) { A.voices--; return; }
      const c = A.ctx, src = c.createBufferSource(), g = c.createGain(), lp = c.createBiquadFilter(); src.buffer = b; src.loop = !!o.loop; src.playbackRate.value = o.rate || 1;
      g.gain.value = (o.gain ?? 1) * (CUE_GAIN[key] ?? 0.7); lp.type = "lowpass"; lp.frequency.value = 18000; let pan = null;
      src.connect(lp); lp.connect(g);
      if (o.pos) { pan = panner(o); g.connect(pan); pan.connect(bus[o.bus || "sfx"]); const send = c.createGain(); send.gain.value = 1; pan.connect(send); send.connect(bus.rvIn); } else g.connect(bus[o.bus || "sfx"]);
      h.src = src; h.setGain = v => ramp(g.gain, v * (CUE_GAIN[key] ?? 0.7)); h.setPos = (x, y, z) => pan && setPos(pan, x, y, z);
      h.setOcclusion = (blocked, dist) => { const oc = occlusion(blocked, dist); ramp(lp.frequency, oc.cutoff, 0.1); ramp(g.gain, (o.gain ?? 1) * (CUE_GAIN[key] ?? 0.7) * oc.gain, 0.1); };
      if (o.occluded) h.setOcclusion(true, d);
      src.onended = () => { A.voices--; try { src.disconnect(); g.disconnect(); lp.disconnect(); pan && pan.disconnect(); } catch (e) { /* gone */ } };
      src.start();
    });
    return h;
  };
  A.stinger = (key, o = {}) => { if (A.ctx) duckUntil = A.ctx.currentTime + (A.index && A.index[key] ? Math.min(3, A.index[key].dur) : 2); return A.play(key, {bus: "ui", priority: true, ...o}); };

  // ---- music: per level a score piece and an atmosphere (cross-faded 2.5 s), danger layers and the heartbeat on top
  function layerSrc(c, b, rate, dest, gain, loop = true) { const s = c.createBufferSource(); s.buffer = b; s.loop = loop; s.playbackRate.value = rate; const g = c.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest); s.start(); return {s, g}; }
  A.setLevel = async function (id) {
    A.level = id; A.pendingLevel = id;
    if (A.status !== "ok" || !A.ctx || A.ctx.state !== "running") return;
    const my = ++token, mix = levelMix(id), keys = [mix.score, mix.bed, ...(mix.danger ? [...LAYERS, "heart", "heart_fast"] : [])];
    const got = await Promise.all(keys.map(buf)); if (my !== token) return;
    const c = A.ctx, grp = c.createGain(), old = music; grp.gain.value = 0; grp.connect(bus.music); const parts = [];
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600 + 12000 * mix.dark ** 2; lp.connect(grp);                     // the score is darkened
    if (got[0]) parts.push(layerSrc(c, got[0], mix.rate, lp, 0.85)); if (got[1]) parts.push(layerSrc(c, got[1], 1, grp, 0.7));
    const layers = {};
    if (mix.danger) [...LAYERS, "heart", "heart_fast"].forEach((k, i) => { if (got[2 + i]) { const p = layerSrc(c, got[2 + i], 1, grp, 0); parts.push(p); layers[k] = p.g; } });
    grp.gain.setTargetAtTime(1, c.currentTime, 0.9); music = {grp, parts, layers, id};
    if (old) { old.grp.gain.setTargetAtTime(0, c.currentTime, 0.7); setTimeout(() => old.parts.forEach(p => { try { p.s.stop(); } catch (e) { /* ended */ } }), 4500); }
  };
  A.stopMusic = () => { token++; if (music) { const m = music; music = null; m.grp.gain.setTargetAtTime(0, A.ctx.currentTime, 0.4); setTimeout(() => m.parts.forEach(p => { try { p.s.stop(); } catch (e) { /* ended */ } }), 2500); } };
  A.resultMusic = async function () { A.stopMusic(); const b = await buf("m_result"); if (b && A.ctx && A.status === "ok") { const g = A.ctx.createGain(); g.gain.value = 0.9; g.connect(bus.music); layerSrc(A.ctx, b, 1, g, 1, false); } };

  // ---- per frame: st = {chasers: [{d}], hp, alarmMsLeft: number|null, danger: bool}
  A.update = function (dt, st) {
    if (A.status !== "ok" || !A.ctx || A.ctx.state !== "running") return;
    const mix = levelMix(A.level), d = danger(st.chasers || [], st.hp ?? 100, mix.danger);
    for (const k of ["t1", "t2", "t3", "heart", "heartFast"]) smoothed[k] = smooth(smoothed[k], d[k], dt, 1.6, 0.45);
    smoothed.duck = smooth(smoothed.duck, d.duck, dt, 2, 0.6);
    if (music) {
      const L = music.layers, v = {t_1: smoothed.t1, t_2: smoothed.t2, t_3: smoothed.t3, heart: smoothed.heart, heart_fast: smoothed.heartFast};
      for (const k in L) ramp(L[k], v[k] * (k.startsWith("heart") ? 0.8 : 0.6), 0.12);
      ramp(music.grp.gain, (A.ctx.currentTime < duckUntil ? 0.55 : 1) * smoothed.duck, 0.2);
    }
    if (st.alarmMsLeft != null) alarmTick(st.alarmMsLeft); else alarmStop();
  };
  A.debug = () => ({status: A.status, state: A.ctx && A.ctx.state, time: A.ctx && A.ctx.currentTime, level: A.level, voices: A.voices, music: music && {id: music.id, layers: Object.keys(music.layers)}, smoothed: {...smoothed},
                    musicGain: bus && bus.music.gain.value, masterGain: bus && bus.master.gain.value, alarm: !!alarm, played: A.stats.played, dropped: A.stats.dropped, settings: {...A.settings}});

  // ---- the alarm: a synthesised two-tone siren (the library has none), quickening as the countdown runs out
  function alarmTick(msLeft) {
    const c = A.ctx;
    if (!alarm) {
      const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(); o1.type = "sawtooth"; o2.type = "square"; lp.type = "lowpass"; lp.frequency.value = 1600; g.gain.value = 0;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(bus.ui); o1.start(); o2.start(); ramp(g.gain, 0.07, 0.3); alarm = {o1, o2, g};
    }
    const f = sirenFreq(c.currentTime, alarmPeriod(msLeft)); ramp(alarm.o1.frequency, f, 0.03); ramp(alarm.o2.frequency, f * 1.5, 0.03);
  }
  function alarmStop() { if (!alarm) return; const a = alarm; alarm = null; ramp(a.g.gain, 0, 0.2); setTimeout(() => { try { a.o1.stop(); a.o2.stop(); } catch (e) { /* ended */ } }, 900); }

  // ---- monsters in 3D: [{id, x, y, z, state, speed, blocked, name}] -> idle breathing, footsteps, a growl and a sting when one starts hunting
  A.monsters = function (dt, list, me) {
    if (A.status !== "ok" || !A.ctx || A.ctx.state !== "running") return;
    const seen = new Set();
    for (const m of list) {
      seen.add(m.id); let s = mons.get(m.id); if (!s) mons.set(m.id, s = {idle: null, step: 0, state: m.state});
      const d = Math.hypot(m.x - me.x, m.z - me.z);
      if (d > audibleRange(false)) { if (s.idle) { s.idle.stop(); s.idle = null; } s.state = m.state; continue; }
      if (!s.idle || s.idle.stopped) s.idle = A.play("mon_idle", {loop: true, pos: [m.x, m.y + 1.2, m.z], gain: 1, rate: 0.85 + (m.id % 5) * 0.04});
      s.idle.setPos(m.x, m.y + 1.2, m.z); s.idle.setOcclusion(m.blocked, d); s.idle.setGain(m.state === "chase" ? 0.15 : m.state === "search" ? 0.8 : 0.45);
      s.step += dt; const iv = monsterStepInterval(m.speed);
      if (s.step >= iv) { s.step = 0; A.play("mon_step", {pos: [m.x, m.y, m.z], gain: 1, rate: 0.62 + Math.random() * 0.1, occluded: m.blocked, loud: true}); }
      if (m.state === "chase" && s.state !== "chase") {
        A.play(growlFor(m.id), {pos: [m.x, m.y + 1.4, m.z], gain: 1, rate: 0.9 + Math.random() * 0.2, occluded: m.blocked, loud: true, priority: true});
        if (d < 28 && A.ctx.currentTime - noticeAt > 6) { noticeAt = A.ctx.currentTime; A.stinger("st_notice"); }
      }
      s.state = m.state;
    }
    for (const [id, s] of mons) if (!seen.has(id)) { if (s.idle) s.idle.stop(); mons.delete(id); }
  };
  A.clearMonsters = () => { for (const s of mons.values()) if (s.idle) s.idle.stop(); mons.clear(); for (const s of peers.values()) s.n = 0; };
  // teammates' footfalls, in 3D: [{id, x, y, z, moving, run, crouch, blocked}]
  A.peers = function (dt, list, step) {
    if (A.status !== "ok" || !A.ctx || A.ctx.state !== "running") return;
    for (const p of list) {
      let s = peers.get(p.id); if (!s) peers.set(p.id, s = {t: 0});
      if (!p.moving) { s.t = 0; continue; }
      const mode = p.crouch ? "crouch" : p.run ? "run" : "walk"; s.t += dt;
      if (s.t >= stepInterval(mode)) { s.t = 0; A.play(step, {pos: [p.x, p.y, p.z], gain: stepGain(mode) * 1.6, rate: 0.92 + Math.random() * 0.16, occluded: p.blocked}); }
    }
  };

  // ---- settings
  A.set = (k, v) => { A.settings[k] = v; applyVolumes(); save(); };
  A.toggleMute = () => { A.set("mute", !A.settings.mute); return A.settings.mute; };
  return A;
}
