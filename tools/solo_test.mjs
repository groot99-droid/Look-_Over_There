// Solo-mode regression: no room, no server involvement in the rules. Checks the fuse rules offline, the old die-and-respawn rule,
// and the optional models/fuse.glb loader (with and without the file).
// Usage: node tools/solo_test.mjs      (needs Playwright + Chromium and internet for three.js from unpkg)
import {createRequire} from "node:module";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) failed++; };
const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const errors = [];
async function solo(port) {
  const page = await (await browser.newContext({viewport: {width: 900, height: 700}})).newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`); await page.click("#l-solo");
  await page.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 120000});
  return page;
}
const until = (name, page, fn, arg) => page.waitForFunction(fn, arg, {timeout: 60000, polling: 200}).then(() => check(name, true), () => check(name, false));

// a second root that has a models/fuse.glb (a stand-in model), made from symlinks so nothing in the repo changes
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lot-")); fs.mkdirSync(path.join(tmp, "models"));
for (const n of ["index.html", "world", "monsters", "characters", "shared"]) fs.symlinkSync(path.join(here, n), path.join(tmp, n));
fs.copyFileSync(path.join(here, "characters", "shorts.glb"), path.join(tmp, "models", "fuse.glb"));
const plain = await createServer({countdownMs: 60000}), withModel = await createServer({root: tmp, countdownMs: 60000});
try {
  const p = await solo(plain.port);
  check("solo: no room, you are the host", await p.evaluate(() => !window.__game.net.on && window.__game.net.host()));
  check("solo: three fuses and a locked stair door on B1", await p.evaluate(() => { const g = window.__game; return g.FZ.vis.items.length === 3 && g.isLocked(g.upDoor()); }));
  check("without models/fuse.glb the placeholder stays", await p.evaluate(() => !window.__game.FZ.vis.items[0].o.userData.model));
  const load = id => p.evaluate(i => window.__game.loadScene(i), id).then(() => p.waitForFunction(i => window.__game.S.id === i && !window.__game.loading, id, {timeout: 60000}));
  const at = i => p.evaluate(i => { const g = window.__game, f = g.FZ.st.B1[i]; return f.s === 3 ? [f.x, f.z] : g.FZ.vis.items[i].home; }, i);
  const go = xz => p.evaluate(t => { const g = window.__game; g.P.p.set(t[0], g.S.floor + 0.02, t[1]); g.P.v.set(0, 0, 0); }, xz);
  await go(await at(0)); await p.keyboard.press("KeyE");
  await until("pressing E picks up the fuse", p, () => window.__game.myCarry() === 0);
  await p.evaluate(() => window.__game.step(0.016));
  check("the counter shows you are carrying", await p.evaluate(() => /CARRYING/.test(document.getElementById("fusehud").textContent)));
  // down with a fuse in hand: it stays where you fell; the old solo rule still applies (3 s, then back up somewhere random)
  await p.evaluate(() => window.__game.die());
  const drop = await p.evaluate(() => { const f = window.__game.FZ.st.B1[0]; return {s: f.s, near: Math.hypot(f.x - window.__game.P.p.x, f.z - window.__game.P.p.z) < 0.01}; });
  check("a downed carrier drops the fuse where they fell", drop.s === 3 && drop.near);
  const respawn = await p.evaluate(() => { const g = window.__game; let n = 0; while (g.dead && n < 200) { g.update(0.05); n++; } return +(n * 0.05).toFixed(2); });
  check("solo respawn is still about 3 s", respawn > 3 && respawn < 3.6, `(${respawn} s)`);
  // a fuse carried off the floor goes back to where it started
  await go(await at(1)); await p.keyboard.press("KeyE");
  await until("a fuse picked up on B1", p, () => window.__game.myCarry() === 1);
  await load("L1"); await load("B1");
  check("a fuse carried off B1 went back to its start", await p.evaluate(() => window.__game.FZ.st.B1[1].s === 0));
  for (let i = 0; i < 3; i++) {
    await go(await at(i)); await p.keyboard.press("KeyE");
    await until(`fuse ${i + 1} picked up`, p, () => window.__game.myCarry() >= 0);
    await p.evaluate(() => window.__game.openDoor(window.__game.upDoor(), true));
    await until(`fuse ${i + 1} in the door`, p, n => window.__game.FZ.st.B1.filter(f => f.s === 2).length === n + 1, i);
  }
  check("three fuses power the door", await p.evaluate(() => { const g = window.__game; g.step(0.016); return !g.isLocked(g.upDoor()) && /DOOR POWERED/.test(document.getElementById("fusehud").textContent); }));
  // L1 has switches instead: flip them one at a time, in any order; each clunk sends the monsters to look
  await load("L1");
  check("L1: two switches, no fuses, door locked", await p.evaluate(() => { const g = window.__game, v = g.FZ.vis; return v.sws.length === 2 && v.items.length === 0 && g.isLocked(g.upDoor()) && g.puzzle().kind === "SWITCHES"; }));
  const swAt = i => p.evaluate(i => window.__game.FZ.vis.sws[i].home, i);
  const s0 = await swAt(0), s1 = await swAt(1);
  check("the two switches are far apart", Math.hypot(s0[0] - s1[0], s0[1] - s1[1]) >= 14, `(${Math.hypot(s0[0] - s1[0], s0[1] - s1[1]).toFixed(1)} m)`);
  await p.evaluate(([x, z]) => { const g = window.__game; for (const m of g.monsters) { m.state = "patrol"; m.path = []; } const m = g.monsters[0]; m.pos.set(x + 8, m.fy, z); }, s1);     // one monster within earshot of switch 1
  await go(s1); await p.keyboard.press("KeyE");
  await until("flipping the second switch first works (any order)", p, () => { const st = window.__game.SW.st.L1; return !st[0].on && st[1].on; });
  check("one switch is not enough: the door stays locked", await p.evaluate(() => { const g = window.__game; g.step(0.016); return g.isLocked(g.upDoor()) && /SWITCHES 1\/2/.test(document.getElementById("fusehud").textContent); }));
  check("the clunk sent a monster to look", await p.evaluate(() => { const m = window.__game.monsters[0]; return m.state === "search" || m.state === "chase"; }));
  check("a flipped switch stays flipped (E again does not undo it)", await p.evaluate(() => { const g = window.__game; g.swAct(1); return g.SW.st.L1[1].on === true; }));
  await go(s0); await p.keyboard.press("KeyE");
  await until("the other switch is flipped one at a time", p, () => window.__game.SW.st.L1.every(x => x.on));
  check("both on: the door is powered", await p.evaluate(() => { const g = window.__game; g.step(0.016); return !g.isLocked(g.upDoor()) && /DOOR POWERED/.test(document.getElementById("fusehud").textContent); }));
  // L2 has a keypad: four notes, each with one digit of the code
  await load("L2");
  check("L2: four notes and a panel, no fuses or switches, door locked", await p.evaluate(() => { const g = window.__game, v = g.FZ.vis; return v.notes.length === 4 && v.pan.length === 2 && v.items.length === 0 && v.sws.length === 0 && g.isLocked(g.upDoor()) && g.puzzle().kind === "CODE"; }));
  const notes = await p.evaluate(() => window.__game.FZ.vis.notes.map(n => n.home));
  let near = 1e9; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) near = Math.min(near, Math.hypot(notes[i][0] - notes[j][0], notes[i][1] - notes[j][1]));
  check("the notes are spread out", near >= 8, `(closest pair ${near.toFixed(1)} m)`);
  const code = await p.evaluate(() => window.__game.KP.local.L2.code);                                  // solo: the game holds the code
  await go(notes[2]); await p.keyboard.press("KeyE");
  await until("reading note 3 shows its digit", p, d => window.__game.KP.st.L2.found[2] === d, code[2]);
  check("the others stay hidden, and the HUD shows what is known", await p.evaluate(() => { const g = window.__game; g.step(0.016); return g.KP.st.L2.found.filter(d => d !== null).length === 1 && /CODE _ _ \d _/.test(document.getElementById("fusehud").textContent); }));
  check("a note is read once", await p.evaluate(() => window.__game.nearNote() === -1));
  // the keypad: a wrong code is loud and locks it
  const doorAt = await p.evaluate(() => { const d = window.__game.upDoor(); return [d.cx, d.cz]; });
  await p.evaluate(([x, z]) => { const g = window.__game; for (const m of g.monsters) { m.state = "patrol"; m.path = []; } const m = g.monsters[0]; m.pos.set(x + 8, m.fy, z); g.openDoor(g.upDoor(), true); }, doorAt);
  check("using the locked door opens the keypad", await p.evaluate(() => window.__game.KPUI.open && getComputedStyle(document.getElementById("kp")).display === "flex"));
  const wrong = code.map(d => (d + 1) % 10).join("");
  await p.evaluate(w => { for (const c of w) window.__game.kpPress(c); window.__game.kpPress("OK"); }, wrong);
  await until("a wrong code counts as a fail and locks the keypad", p, () => { const v = window.__game.KP.st.L2; return v.fails === 1 && v.lockMs > 7000 && !v.solved; });
  check("the wrong code sent a monster to the door", await p.evaluate(() => { const m = window.__game.monsters[0]; return m.state === "search" || m.state === "chase"; }));
  await p.evaluate(c => { for (const d of c) window.__game.kpPress(String(d)); window.__game.kpPress("OK"); }, code);
  check("even the right code does nothing while it is locked", await p.evaluate(() => !window.__game.KP.st.L2.solved));
  await p.evaluate(() => { window.__game.KP.local.L2.lockUntil = 0; window.__game.KP.st.L2.until = 0; });          // skip the 8 s wait
  await p.keyboard.type(code.join("")); await p.keyboard.press("Enter");                                              // the keyboard works while it is up
  await until("the right code opens the door", p, () => window.__game.KP.st.L2.solved);
  check("the keypad closes and the door is powered", await p.evaluate(() => { const g = window.__game; g.step(0.016); return !g.KPUI.open && !g.isLocked(g.upDoor()) && /DOOR POWERED/.test(document.getElementById("fusehud").textContent); }));
  await load("L1");
  check("coming back to L1 the switches are still on", await p.evaluate(() => window.__game.SW.st.L1.every(x => x.on) && !window.__game.isLocked(window.__game.upDoor())));

  const q = await solo(withModel.port);
  await until("with models/fuse.glb the model replaces the placeholder", q, () => window.__game.FZ.vis.items.every(i => i.o.userData.model));
  check("the placeholder art is hidden behind it", await q.evaluate(() => window.__game.FZ.vis.items[0].o.userData.art.visible === false));
} catch (e) { console.log("ERROR", e); failed++; }
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); await plain.close(); await withModel.close(); fs.rmSync(tmp, {recursive: true, force: true});
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
