// Bot players for tuning: N real game clients (headless browsers, the game's own code, no rendering) play whole rounds in one room on a local server,
// and the run prints a report: time per floor, downs, revives, stuck moments, and each bot's place, time and the alarm left when it got out.
//   node tools/bots.mjs [bots=4] [--timeout=900] [--json=file]
// A bot walks the game's own walkable grid (A*) to what its floor needs: fuses on B1, switches on L1, notes and the code on L2, the power box on L3,
// the doors on L4. It lifts downed teammates. It does not hide or avoid monsters, so "downs" is the raw danger of a floor.
// Needs Playwright + Chromium and internet for three.js from unpkg. Run locally; it is slow in software rendering.
import {createRequire} from "node:module";
import fs from "node:fs";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
const args = process.argv.slice(2);
const N = Math.max(1, Math.min(8, parseInt(args.find(a => /^\d+$/.test(a)) || "4", 10)));
const opt = (k, d) => (args.find(a => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const TIMEOUT_S = parseInt(opt("timeout", "900"), 10), JSON_OUT = opt("json", "");

// ---- runs inside each page (serialised by Playwright, so it can use nothing from this file)
function brain(idx) {
  const g = window.__game, B = window.__bot = {idx, floors: {}, downs: 0, revives: 0, stuck: 0, cur: null, path: [], pathAt: 0, last: performance.now(), prev: null, prevAt: 0, was: false, hold: 0, log: []};
  const now = () => performance.now() / 1000;
  const face = (x, z) => { g.P.yaw = Math.atan2(-(x - g.P.p.x), -(z - g.P.p.z)); };
  const dist = (x, z) => Math.hypot(x - g.P.p.x, z - g.P.p.z);
  const stop = () => { g.keys.KeyW = false; g.keys.KeyE = false; };
  function walkTo(x, z, close) {                                          // follow an A* path to (x, z); the last stretch is a straight walk (a door can sit off the grid)
    const key = x.toFixed(1) + "," + z.toFixed(1) + g.S.id;
    if (B.cur !== key || now() - B.pathAt > 2) {
      B.cur = key; B.pathAt = now();
      const a = g.nearestWalk(g.S.nav, g.P.p.x, g.P.p.z), b = g.nearestWalk(g.S.nav, x, z);
      B.path = (a >= 0 && b >= 0 && g.astar(g.S.nav, a, b)) || []; if (B.path.length) B.path.shift();
    }
    while (B.path.length && dist(B.path[0][0], B.path[0][1]) < 0.7) B.path.shift();
    const [wx, wz] = B.path.length ? B.path[Math.min(1, B.path.length - 1)] : [x, z];
    if (dist(x, z) <= close) { stop(); return true; }
    face(wx, wz); g.keys.KeyW = true; g.P.crouch = !!B.sneak;
    if (!B.prev || now() - B.prevAt > 3) {                                // stuck: hardly moved in 3 s, so hop to the next waypoint
      if (B.prev && Math.hypot(B.prev[0] - g.P.p.x, B.prev[1] - g.P.p.z) < 0.3) { B.stuck++; if (B.path.length) { const [sx, sz] = B.path[0]; g.P.p.set(sx, g.P.p.y + 0.05, sz); } }
      B.prev = [g.P.p.x, g.P.p.z]; B.prevAt = now();
    }
    return false;
  }
  function openNear() {                                                   // a shut door right ahead: open it
    for (const dr of g.doors) if (!dr.link && dr.target === 0 && Math.abs(dr.cy - g.P.p.y) < 1.5 && dist(dr.cx, dr.cz) < 1.5) { g.openDoor(dr, true); return; }
  }
  const upDoor = () => g.upDoor();
  function goUp() {
    const d = upDoor(); if (!d) return;
    if (walkTo(d.cx, d.cz, 1.3)) { face(d.cx, d.cz); g.useDoor(); }
  }
  function decide() {
    const id = g.S.id, st = g.FZ.st, me = B.idx;
    if (g.FIN.out) { stop(); return; }
    if (g.reviveTarget()) { stop(); g.keys.KeyE = true; B.hold += 0.05; return; }
    if (B.hold > 3.5) B.revives++; B.hold = 0; g.keys.KeyE = false;
    openNear();
    // some sense: crouch (quiet, slow) when a monster is near and has not noticed us; run straight away from one that is chasing
    let near = 99, chaser = null;
    for (const m of g.monsters) { if (!m.onFloorY(g.P.p.y)) continue; const d = dist(m.pos.x, m.pos.z); if (d < near) near = d; if (m.state === "chase" && d < 14 && (!chaser || d < dist(chaser.pos.x, chaser.pos.z))) chaser = m; }
    B.sneak = near < 16 && !chaser;
    if (chaser) { const fx = g.P.p.x - chaser.pos.x, fz = g.P.p.z - chaser.pos.z, L = Math.hypot(fx, fz) || 1; face(g.P.p.x + fx / L * 5, g.P.p.z + fz / L * 5); g.keys.KeyW = true; g.P.crouch = false; B.fled = (B.fled || 0) + 0.05; return; }
    if (id === "B1") {
      const door = upDoor(), v = g.FZ.vis, fs = st.B1 || [];
      if (door && g.isLocked(door)) {
        if (g.myCarry() >= 0) { if (walkTo(door.cx, door.cz, 1.6)) { face(door.cx, door.cz); g.fuseAct({a: "slot"}); } return; }
        const free = fs.map((f, i) => [f, i]).filter(([f]) => f && (f.s === 0 || f.s === 3));
        if (!free.length) { stop(); return; }
        const [f, i] = free[me % free.length], [x, z] = f.s === 3 ? [f.x, f.z] : v.items[i].home;
        if (walkTo(x, z, 1.1)) { face(x, z); g.tryFuse(); }
      } else goUp();
    } else if (id === "L1") {
      const sw = (g.SW.st.L1 || []), off = sw.map((s, i) => [s, i]).filter(([s]) => s && !s.on);
      if (off.length) { const [, i] = off[me % off.length], [x, z] = g.FZ.vis.sws[i].home; if (walkTo(x, z, 1.2)) { face(x, z); g.trySwitch(); } } else goUp();
    } else if (id === "L2") {
      const k = g.KP.st.L2; if (!k) return;
      const unread = k.found.map((d, i) => [d, i]).filter(([d]) => d === null);
      if (k.solved) goUp();
      else if (unread.length) { const [, i] = unread[me % unread.length], [x, z] = g.FZ.vis.notes[i].home; if (walkTo(x, z, 1.2)) { face(x, z); g.tryNote(); } }
      else { const d = upDoor(); if (walkTo(d.cx, d.cz, 1.6) && now() - (B.tried || 0) > 2) { B.tried = now(); g.kpAct({a: "try", code: k.found.join("")}); } }
    } else if (id === "L3") {
      if (!g.POWER.on && me % 2 === 0 && g.S.pw) { const [x, z] = g.S.pw.spot; if (walkTo(x, z + 1.0, 0.8)) { face(x, z); g.tryPower(); } } else goUp();
    } else if (id === "L4") {
      if (!g.POWER.on && g.S.pw) { const [x, z] = g.S.pw.spot; if (walkTo(x + 1.2, z, 0.8)) { face(x, z); g.tryPower(); } }
      else walkTo(0, g.EXIT_Z + 1.2, 0.3);
    }
  }
  setInterval(() => {
    const t = performance.now(), dt = Math.min(0.1, (t - B.last) / 1000); B.last = t;
    if (!g.loading) {
      const id = g.S.id; B.floors[id] ||= {in: g.FIN ? (t - g.FIN.t0) / 1000 : 0, out: null, downs: 0};
      for (const k in B.floors) if (k !== id && B.floors[k].out === null) B.floors[k].out = (t - g.FIN.t0) / 1000;
      if (B.floors[id].out !== null) B.floors[id].out = null;
      if (g.dead && !B.was) { B.downs++; B.floors[id].downs++; } B.was = g.dead;
      if (g.dead) stop(); else decide();
    }
    g.sim(dt, t / 1000);
  }, 50);
}

const srv = await createServer({port: 0, countdownMs: 3000});
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const pages = [], room = "BOTS" + Math.floor(Math.random() * 1000);
const report = () => Promise.all(pages.map(p => p.evaluate(() => { const g = window.__game, b = window.__bot; return {idx: b.idx, floor: g.S.id, downs: b.downs, revives: b.revives, stuck: b.stuck, fled: Math.round(b.fled || 0), floors: b.floors, out: g.FIN.out, alarm: g.FIN.alarmUntil ? Math.max(0, (g.FIN.alarmUntil - performance.now()) / 1000) : null, results: g.FIN.results, t: (performance.now() - g.FIN.t0) / 1000, dbg: {x: +g.P.p.x.toFixed(1), z: +g.P.p.z.toFixed(1), dead: g.dead, loading: g.loading, path: b.path.length, cur: b.cur, kw: !!g.keys.KeyW, carry: g.myCarry(), locked: g.upDoor() ? g.isLocked(g.upDoor()) : null, imm: g.P.imm}}; }).catch(() => null)));
let rows = [];
try {
  for (let i = 0; i < N; i++) {
    const page = await (await browser.newContext({viewport: {width: 160, height: 100}})).newPage();
    page.on("pageerror", e => console.log(`[bot ${i} pageerror]`, e.message));
    await page.goto(`http://localhost:${srv.port}/?room=${room}&name=Bot${i + 1}&char=${i % 5}&auto=1&ready=1&bot=1`);
    pages.push(page);
  }
  await Promise.all(pages.map(p => p.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 240000})));
  await Promise.all(pages.map((p, i) => p.evaluate(brain, i)));
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
for (const r of rows) {
  const fl = Object.entries(r.floors).map(([k, f]) => `${k} ${f.in.toFixed(0)}s${f.downs ? " (" + f.downs + " down)" : ""}`).join(", ");
  console.log(`Bot${r.idx + 1}: ${r.out ? "OUT" : "stuck on " + r.floor}  downs ${r.downs}  revives ${r.revives}  stuck ${r.stuck}  fled ${r.fled}s  alarm left ${r.alarm === null ? "-" : r.alarm.toFixed(0) + "s"}  floors: ${fl}`);
}
const res = rows.find(r => r.results)?.results;
if (res) console.log("RESULTS " + res.map(x => `${x.place}.${x.name} ${Math.floor(x.ms / 60000)}:${String(Math.floor(x.ms / 1000) % 60).padStart(2, "0")}`).join("  "));
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2));
await browser.close(); await srv.close();
process.exit(rows.length && rows.every(r => r.results) ? 0 : 1);
