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
  for (let i = 0; i < 3; i++) {
    await go(await at(i)); await p.keyboard.press("KeyE");
    await until(`fuse ${i + 1} picked up`, p, () => window.__game.myCarry() >= 0);
    await p.evaluate(() => window.__game.openDoor(window.__game.upDoor(), true));
    await until(`fuse ${i + 1} in the door`, p, n => window.__game.FZ.st.B1.filter(f => f.s === 2).length === n + 1, i);
  }
  check("three fuses power the door", await p.evaluate(() => { const g = window.__game; g.step(0.016); return !g.isLocked(g.upDoor()) && /DOOR POWERED/.test(document.getElementById("fusehud").textContent); }));
  // a fuse carried off the floor goes back to where it started
  await p.evaluate(() => window.__game.loadScene("L1")); await p.waitForFunction(() => window.__game.S.id === "L1" && !window.__game.loading, null, {timeout: 60000});
  check("L1 has its own three fuses, locked", await p.evaluate(() => { const g = window.__game; return g.FZ.vis.items.length === 3 && g.isLocked(g.upDoor()); }));
  await go(await p.evaluate(() => window.__game.FZ.vis.items[0].home)); await p.keyboard.press("KeyE");
  await until("a fuse picked up on L1", p, () => window.__game.myCarry() === 0);
  await p.evaluate(() => window.__game.loadScene("B1")); await p.waitForFunction(() => window.__game.S.id === "B1" && !window.__game.loading, null, {timeout: 60000});
  await p.evaluate(() => window.__game.loadScene("L1")); await p.waitForFunction(() => window.__game.S.id === "L1" && !window.__game.loading, null, {timeout: 60000});
  check("a fuse carried off L1 went back to its start", await p.evaluate(() => window.__game.FZ.st.L1[0].s === 0));

  const q = await solo(withModel.port);
  await until("with models/fuse.glb the model replaces the placeholder", q, () => window.__game.FZ.vis.items.every(i => i.o.userData.model));
  check("the placeholder art is hidden behind it", await q.evaluate(() => window.__game.FZ.vis.items[0].o.userData.art.visible === false));
} catch (e) { console.log("ERROR", e); failed++; }
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); await plain.close(); await withModel.close(); fs.rmSync(tmp, {recursive: true, force: true});
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
