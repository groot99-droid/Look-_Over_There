// The page's world (built from the glb colliders in the browser) and the server's (shared/world.js from world/*.json) must be the same: same boxes, same doors, same navigation grid, same monster spawns.
//   node tools/world_parity.mjs     (needs Playwright + Chromium)
import {createRequire} from "node:module";
import fs from "node:fs";
import crypto from "node:crypto";
import {createServer} from "../server/server.js";
import {worldFromDoc, FLOORS, mainRegion} from "../shared/world.js";
import {spawnPlan} from "../shared/monsters.js";
const {chromium} = createRequire(import.meta.url)("playwright");
let fails = 0; const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? "  " + x : ""}`); if (!ok) fails++; };
const json = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const monCfg = json("../world/monsters.json");
const hash = a => crypto.createHash("sha1").update(Buffer.from(a)).digest("hex").slice(0, 12);
const srv = await createServer({port: 0, countdownMs: 60000});
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const page = await (await browser.newContext({viewport: {width: 960, height: 600}})).newPage();
const errors = []; page.on("pageerror", e => errors.push(e.message));
await page.goto(`http://localhost:${srv.port}/`); await page.click("#l-solo");
await page.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 240000});
for (const id of Object.keys(FLOORS)) {
  await page.evaluate(i => window.__game.loadScene(i), id); await page.waitForFunction(i => window.__game.S.id === i && !window.__game.loading, id, {timeout: 120000});
  const c = await page.evaluate(() => { const g = window.__game; return {nav: Array.from(g.S.nav), boxes: g.S.boxes.length, doors: g.doors.map(d => [d.d.name, !!d.link, +d.cx.toFixed(3), +d.cz.toFixed(3)]), spawns: g.monsters.map(m => [+m.home[0].toFixed(3), +m.home[1].toFixed(3), m.cfg.name]), shutter: !!g.S.shutter}; });
  const W = worldFromDoc(json(`../world/${id}.json`), id), plan = spawnPlan(W, monCfg, id);
  check(`${id}: same navigation grid`, hash(c.nav) === hash(W.nav), `${hash(c.nav)} ${hash(W.nav)} (${c.nav.reduce((a, b) => a + b, 0)} cells)`);
  check(`${id}: same boxes and doors`, c.boxes === W.boxes.length && JSON.stringify(c.doors) === JSON.stringify(W.doors.map(d => [d.d.name, !!d.link, +d.cx.toFixed(3), +d.cz.toFixed(3)])), `${c.boxes} boxes, ${c.doors.length} doors`);
  check(`${id}: same monster spawns`, JSON.stringify(c.spawns) === JSON.stringify(plan.map(p => [+p.x.toFixed(3), +p.z.toFixed(3), p.cfg.name])), `${c.spawns.length} monsters`);
}
check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close(); await srv.close(); console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
