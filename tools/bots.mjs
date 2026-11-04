// Bot players for tuning: N real game clients (headless browsers, the game's own code, no rendering) play whole rounds in one room on a local server,
// and the run prints a report: time per floor, downs, revives, stuck moments, and each bot's place, time and the alarm left when it got out.
//   node tools/bots.mjs [bots=4] [--timeout=900] [--json=file]
// The bots work as a team (runner, bait, scout) and plan with path-time maths: see tools/bot_brain.mjs. They know where every monster, fuse, switch and
// door is (they read the game's state); they do not hide behind doors or read the monsters' minds, so "downs" is still a rough measure of a floor.
// Needs Playwright + Chromium and internet for three.js from unpkg. Run locally; it is slow in software rendering.
import {createRequire} from "node:module";
import fs from "node:fs";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
const args = process.argv.slice(2);
const N = Math.max(1, Math.min(8, parseInt(args.find(a => /^\d+$/.test(a)) || "4", 10)));
const opt = (k, d) => (args.find(a => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const TIMEOUT_S = parseInt(opt("timeout", "900"), 10), JSON_OUT = opt("json", "");

import {brain} from "./bot_brain.mjs";                                     // the bots' mind: path-time maths and team roles, run inside each page

const srv = await createServer({port: 0, countdownMs: 3000});
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const pages = [], room = "BOTS" + Math.floor(Math.random() * 1000);
const report = () => Promise.all(pages.map(p => p.evaluate(() => { const g = window.__game, b = window.__bot; return {idx: b.idx, floor: g.S.id, downs: b.downs, revives: b.revives, stuck: b.stuck, role: b.role, shots: b.shots, hits: b.hits, beacons: b.beacons, cloakS: Math.round(b.cloakS), hurts: b.hurts, cloakWaste: Math.round(b.cloakWaste || 0), firstFuse: b.firstFuse === null ? null : Math.round(b.firstFuse), carryS: Math.round(b.carryS || 0), camSeen: Math.round(b.camSeen || 0), armedAt: b.armedAt, rounds: g.LT.rounds, gun: g.LT.gun, slotted: ((g.FZ.st.B1 || []).filter(f => f && f.s === 2)).length, waited: Math.round(b.waited || 0), perf: b.perf, fled: Math.round(b.fled || 0), deaths: b.deaths || [], trail: b.trail || [], floors: b.floors, out: g.FIN.out, alarm: g.FIN.alarmUntil ? Math.max(0, (g.FIN.alarmUntil - performance.now()) / 1000) : null, results: g.FIN.results, t: (performance.now() - g.FIN.t0) / 1000, dbg: {x: +g.P.p.x.toFixed(1), z: +g.P.p.z.toFixed(1), dead: g.dead, loading: g.loading, path: b.path.length, cur: b.cur, kw: !!g.keys.KeyW, carry: g.myCarry(), locked: g.upDoor() ? g.isLocked(g.upDoor()) : null, imm: g.P.imm}}; }).catch(() => null)));
let rows = [];
try {
  for (let i = 0; i < N; i++) {
    const page = await (await browser.newContext({viewport: {width: 160, height: 100}})).newPage();
    page.on("pageerror", e => console.log(`[bot ${i} pageerror]`, e.message));
    await page.goto(`http://localhost:${srv.port}/?room=${room}&name=Bot${i + 1}&char=${i % 5}&auto=1&ready=1&bot=1`);
    pages.push(page);
  }
  await Promise.all(pages.map(p => p.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 240000})));
  await Promise.all(pages.map((p, i) => p.evaluate(`(${brain.toString()})(${i}, ${N}, ${JSON.stringify({nogun: args.includes("--nogun"), nocloak: args.includes("--nocloak"), nobeacons: args.includes("--nobeacons"), omniscient: args.includes("--omniscient"), legacyItems: args.includes("--legacy-items"), nocams: args.includes("--nocams")})})`)));
  const relay = setInterval(async () => {                                          // the team's blackboard: every bot's position, role and claim, shared with all of them
    try { const pubs = (await Promise.all(pages.map(p => p.evaluate(() => (window.__bot && window.__bot.pub) || null)))).filter(Boolean); await Promise.all(pages.map(p => p.evaluate(bb => { window.__bb = bb; }, pubs))); } catch (e) {}
  }, 400);
  console.log(`${N} bots in room ${room}; a round ends when all are out (timeout ${TIMEOUT_S} s)`);
  const t0 = Date.now();
  for (;;) {
    await new Promise(r => setTimeout(r, 5000));
    rows = (await report()).filter(Boolean);
    const line = rows.map(r => `${r.idx + 1}:${r.floor}${r.out ? "✓" : ""}${r.downs ? "!" + r.downs : ""}`).join("  ");
    console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${line}`);
    if (args.includes("--debug")) for (const r of rows) console.log("   ", r.idx + 1, JSON.stringify(r.dbg));
    if (rows.length && rows.every(r => r.results)) break;
    if ((Date.now() - t0) / 1000 > TIMEOUT_S) { console.log("TIMEOUT: not everyone got out"); break; }
  }
} catch (e) { console.log("ERROR", e); }
console.log("\nBOT REPORT");
for (const r of rows) if (r.perf) console.log(`Bot${r.idx + 1} tick: avg ${(r.perf.sum / r.perf.n).toFixed(0)} ms, max ${r.perf.max.toFixed(0)} ms, ${r.perf.over150} gaps over 150 ms, ${r.perf.over500} over 500 ms (of ${r.perf.n})`);
if (args.includes("--trail")) for (const r of rows) console.log(`Bot${r.idx + 1} trail:`, JSON.stringify(r.trail.slice(0, 25)));
if (args.includes("--deaths")) for (const r of rows) console.log(`Bot${r.idx + 1} first downs:`, JSON.stringify(r.deaths));
for (const r of rows) {
  const fl = Object.entries(r.floors).map(([k, f]) => `${k} ${f.in.toFixed(0)}s${f.downs ? " (" + f.downs + " down)" : ""}`).join(", ");
  console.log(`Bot${r.idx + 1} (${r.role}): ${r.out ? "OUT" : "stuck on " + r.floor}  downs ${r.downs}  revives ${r.revives}  stuck ${r.stuck}  fled ${r.fled}s  waited ${r.waited}s  hurt ${r.hurts}x  cam-only ${r.camSeen}s  beacons thrown ${r.beacons}  cloak ${r.cloakS}s (${r.cloakWaste}s wasted)  first fuse ${r.firstFuse === null ? "-" : r.firstFuse + "s"}  carried ${r.carryS}s  gun ${r.gun ? "yes" : "no"} (armed at ${r.armedAt === null ? "-" : r.armedAt.toFixed(0) + "s"}, shots ${r.shots}, rounds left ${r.rounds})  fuses in the door ${r.slotted}/3  alarm left ${r.alarm === null ? "-" : r.alarm.toFixed(0) + "s"}  floors: ${fl}`);
}
const res = rows.find(r => r.results)?.results;
if (res) console.log("RESULTS " + res.map(x => `${x.place}.${x.name} ${Math.floor(x.ms / 60000)}:${String(Math.floor(x.ms / 1000) % 60).padStart(2, "0")}`).join("  "));
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2));
await browser.close(); await srv.close();
process.exit(rows.length && rows.every(r => r.results) ? 0 : 1);
