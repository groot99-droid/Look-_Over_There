// Stair paths in a room: one player takes every stair link up (B1 -> L1 -> L2 -> L3 -> L4) and back down, exactly as goLink does (loadScene with the link's arrival),
// while a second player stays on B1. After each arrival: the server sees the player on the new floor, runs that floor, sends its state and snapshots; the other player sees them move.
// Usage: node tools/stairs_test.mjs [--bot]   (--bot opens the pages as bot clients, the way tools/bots.mjs does)
import {createRequire} from "node:module";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0; const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) failed++; };
const BOT = process.argv.includes("--bot");
const srv = await createServer({port: 0, countdownMs: 500});
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const open = async (name, char) => {
  const page = await (await browser.newContext({viewport: {width: 320, height: 200}})).newPage(); page.on("pageerror", e => console.log(`[${name} pageerror]`, e.message));
  await page.goto(`http://localhost:${srv.port}/?room=STAIRS&name=${name}&char=${char}&auto=1&ready=1${BOT ? "&bot=1" : ""}`);
  await page.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 240000}); return page;
};
const room = () => srv.rooms.get("STAIRS");
const serverView = id => { const p = room().players.get(id); return {scene: p.scene, floor: !!room().floors[p.scene], st: !!p.st}; };
// in bot mode nothing runs the game clock by itself: step it from here (what the bots' brain does)
const pump = page => BOT ? page.evaluate(() => { const g = window.__game; if (!window.__pump) window.__pump = setInterval(() => g.step(0.05), 50); }) : null;
try {
  const a = await open("Ann", 0), b = await open("Bob", 3);
  await Promise.all([a, b].map(p => p.waitForFunction(() => window.__game.net.phase === "playing" && !window.__game.loading, null, {timeout: 120000})));
  await Promise.all([pump(a), pump(b)].filter(Boolean));
  const aid = await a.evaluate(() => window.__game.net.id);
  const stateKey = { L1: "SW", L2: "KP" };
  const up = ["L1", "L2", "L3", "L4"];
  for (const target of up) {
    const from = await a.evaluate(() => window.__game.S.id);
    await a.evaluate(async () => { const g = window.__game, l = g.upDoor().d.link; await g.loadScene(l.scene, {pos: l.arrive, face: l.face, door: l.door}); });
    const t0 = Date.now(); let sv; while (Date.now() - t0 < 15000) { sv = serverView(aid); if (sv.scene === target && sv.floor && sv.st) break; await sleep(200); }
    check(`${from} -> ${target}: the server sees Ann on ${target}, runs that floor and has her position`, sv.scene === target && sv.floor && sv.st, JSON.stringify(sv));
    await a.waitForFunction(() => !!window.__game.net.snap || window.__game.monsters.length === 0, null, {timeout: 15000}).catch(() => {});
    const info = await a.evaluate(k => { const g = window.__game; return {id: g.S.id, snap: !!g.net.snap, mons: g.monsters.length, state: k ? (k === "SW" ? !!g.SW.st[g.S.id] : !!g.KP.st[g.S.id]) : null, loading: g.loading, hp: g.HP.h.hp}; }, stateKey[target] || null);
    check(`${target}: Ann gets monster snapshots and the floor's state`, info.id === target && (info.mons === 0 || info.snap) && info.state !== false && !info.loading, JSON.stringify(info));
    await b.waitForFunction(id => { const p = window.__game.net.peers.get(id); return !!p && p.scene !== undefined; }, aid, {timeout: 15000}).catch(() => {});
    const peer = await b.evaluate(id => { const p = window.__game.net.peers.get(id); return p && p.scene; }, aid);
    check(`Bob (on B1) hears Ann is on ${target}`, peer === target, String(peer));
    check("Bob's floor keeps running", serverView(await b.evaluate(() => window.__game.net.id)).floor);
  }
  // back down to B1 through each down link
  for (const target of ["L3", "L2", "L1", "B1"]) {
    const ok = await a.evaluate(async () => { const g = window.__game, d = g.doors.find(x => x.link && /_down$/.test(x.d.name)); if (!d) return false; const l = d.link; await g.loadScene(l.scene, {pos: l.arrive, face: l.face, door: l.door}); return true; });
    await sleep(1500); const sv = serverView(aid), id = await a.evaluate(() => window.__game.S.id);
    check(`down to ${target}: a down link exists and the server follows`, ok && id === target && sv.scene === target && sv.floor, JSON.stringify({ok, id, sv}));
  }
  const left = Object.keys(room().floors).sort().join(",");
  check("floors nobody is on are dropped, the occupied ones kept", left === "B1", left);
} catch (e) { console.log("ERROR", e.message); failed++; }
await browser.close(); await srv.close(); console.log(failed ? `${failed} FAILED` : "ALL PASSED"); process.exit(failed ? 1 : 0);
