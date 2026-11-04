// The audio engine against the real built files (python3 tools/build_audio.py first): music per level, danger layers, voices, alarm, mute, silence without files.
//   node tools/audio_test.mjs      (needs Playwright + Chromium and audio/files)
import {createRequire} from "node:module";
import fs from "node:fs";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
let fails = 0; const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? "  " + extra : ""}`); if (!ok) fails++; };
if (!fs.existsSync(new URL("../audio/files/index.json", import.meta.url))) { console.log("no audio/files: run python3 tools/build_audio.py first"); process.exit(2); }
const srv = await createServer({port: 0, countdownMs: 60000});
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]});
const page = await (await browser.newContext({viewport: {width: 960, height: 600}})).newPage();
const errors = []; page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://localhost:${srv.port}/`); await page.click("#l-solo");
await page.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 240000});
const A = f => page.evaluate(f);
const sleep = ms => new Promise(r => setTimeout(r, ms));
await A(() => window.__game.AUD.unlock()); await sleep(800);
let d = await A(() => window.__game.AUD.debug());
check("the engine finds the files and the context runs", d.status === "ok" && d.state === "running", JSON.stringify({status: d.status, state: d.state}));
await A(() => window.__game.AUD.setLevel("B1")); await sleep(2500); d = await A(() => window.__game.AUD.debug());
check("B1 music is playing with its danger layers and heartbeat ready", d.music && d.music.id === "B1" && ["t_1", "t_2", "t_3", "heart", "heart_fast"].every(k => d.music.layers.includes(k)), JSON.stringify(d.music));
check("the audio clock advances (sound is really being rendered)", await A(async () => { const a = window.__game.AUD; const t0 = a.debug().time; await new Promise(r => setTimeout(r, 600)); return a.debug().time > t0 + 0.3; }));
check("the music bus is open", d.musicGain > 0.3, `(${d.musicGain})`);
// danger layers follow the nearest hunter, and ease off afterwards
const up = await A(async () => { const a = window.__game.AUD; for (let i = 0; i < 40; i++) a.update(0.1, {chasers: [{d: 4}], hp: 100}); return a.debug().smoothed; });
check("a hunter 4 m away brings in the danger layers and ducks the score", up.t1 > 0.7 && up.t2 > 0.5 && up.duck < 0.8, JSON.stringify(up));
const down = await A(async () => { const a = window.__game.AUD; for (let i = 0; i < 80; i++) a.update(0.1, {chasers: [], hp: 100}); return a.debug().smoothed; });
check("they fade when the hunt ends", down.t1 < 0.2 && down.t3 < 0.05 && down.duck > 0.9, JSON.stringify(down));
const hb = await A(async () => { const a = window.__game.AUD; for (let i = 0; i < 60; i++) a.update(0.1, {chasers: [], hp: 12}); return a.debug().smoothed; });
check("a heartbeat comes in at low HP", hb.heart + hb.heartFast > 0.5, JSON.stringify(hb));
// levels
await A(() => window.__game.AUD.setLevel("L3")); await sleep(2500); d = await A(() => window.__game.AUD.debug());
check("L3, the breather, has music but no danger layers", d.music.id === "L3" && d.music.layers.length === 0, JSON.stringify(d.music));
await A(() => window.__game.AUD.setLevel("L4")); await sleep(2500); d = await A(() => window.__game.AUD.debug());
check("L4 has its own mix", d.music.id === "L4" && d.music.layers.length === 5);
// voices
const v = await A(async () => { const a = window.__game.AUD; a.setListener(0, 1.6, 0, 0); const base = a.debug().played; a.play("gun"); a.play("door_open", {pos: [3, 1, 2]}); a.play("mon_step", {pos: [500, 0, 500]}); await new Promise(r => setTimeout(r, 300)); return {played: a.debug().played - base, voices: a.debug().voices, dropped: a.debug().dropped}; });
check("effects play, and a sound 500 m away is not started", v.played === 2 && v.dropped >= 1 && v.voices >= 1, JSON.stringify(v));
check("voices are given back when sounds end", await A(async () => { await new Promise(r => setTimeout(r, 3500)); return window.__game.AUD.debug().voices === 0; }));
const cap = await A(async () => { const a = window.__game.AUD; for (let i = 0; i < 60; i++) a.play("beacon_tick", {loop: true}); await new Promise(r => setTimeout(r, 300)); const n = a.debug().voices; return n; });
check("there is a cap on simultaneous voices", cap <= 34, `(${cap})`);
// monsters in 3D
const mon = await A(async () => { const a = window.__game.AUD; a.clearMonsters(); const base = a.debug().played; const m = {id: 3, x: 6, y: 0, z: 0, state: "patrol", speed: 2.7, blocked: false};
  for (let i = 0; i < 30; i++) a.monsters(0.1, [m], {x: 0, z: 0}); const idle = a.debug().played - base; m.state = "chase"; a.monsters(0.1, [m], {x: 0, z: 0}); await new Promise(r => setTimeout(r, 200)); return {idle, afterChase: a.debug().played - base}; });
check("a patrolling monster is heard (breathing and footsteps) and a growl comes when it starts hunting", mon.idle >= 2 && mon.afterChase > mon.idle, JSON.stringify(mon));
// alarm
const al = await A(async () => { const a = window.__game.AUD; a.update(0.1, {chasers: [], hp: 100, alarmMsLeft: 30000}); const on = a.debug().alarm; a.update(0.1, {chasers: [], hp: 100, alarmMsLeft: null}); return {on, off: !a.debug().alarm}; });
check("the siren starts with the alarm and stops after it", al.on && al.off, JSON.stringify(al));
// mute and volume
await A(() => window.__game.AUD.set("mute", true)); await sleep(700); d = await A(() => window.__game.AUD.debug());
check("mute silences the master bus", d.masterGain < 0.02, `(${d.masterGain})`);
await A(() => { const a = window.__game.AUD; a.set("mute", false); a.set("music", 0.3); }); await sleep(700); d = await A(() => window.__game.AUD.debug());
check("the music volume setting changes the music bus", Math.abs(d.musicGain - 0.3) < 0.05 && d.masterGain > 0.8, JSON.stringify({m: d.musicGain, master: d.masterGain}));
// the game's own hooks ran without errors while playing
await A(() => { const g = window.__game; g.AUD.set("music", 0.7); g.P.moving = true; g.P.ground = true; for (let i = 0; i < 80; i++) g.sim(0.05, performance.now() / 1000); g.applyHit(35); g.toggleCloak(); });
check("a few seconds of game frames with sound on raise no errors", errors.length === 0, errors.slice(0, 3).join(" | "));
// silence without files, and for bots
const silent = await A(async () => { const m = await import("/audio/engine.js"); const a = m.createAudio({base: "nothing-here/"}); await a.unlock(); a.setLevel("B1"); a.play("gun"); a.update(0.1, {chasers: [{d: 3}], hp: 5}); a.monsters(0.1, [{id: 1, x: 1, y: 0, z: 1, state: "chase", speed: 3}], {x: 0, z: 0}); return a.status; });
check("with the files missing the engine is silent and does not throw", silent === "silent", silent);
await browser.close();
const bot = await (await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]})).newPage();
await bot.goto(`http://localhost:${srv.port}/?bot=1&auto=1&ready=1&room=AUDT&name=B`); await bot.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 240000});
check("bots get no sound at all", await bot.evaluate(() => window.__game.AUD.status === "off"));
await srv.close(); console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
