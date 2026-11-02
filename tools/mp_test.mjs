// Two-browser multiplayer check. Starts server/server.js on a free port, opens two game pages in one room and checks:
// waiting room, group spawn, character models, presence, one host per floor, monsters following the host's snapshots,
// shared doors (open and close), downed + revive, a host monster catching the other player, and host handover.
// Usage: node tools/mp_test.mjs      (needs Playwright + Chromium and internet for three.js from unpkg)
import {createRequire} from "node:module";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) failed++; };

const srv = await createServer({port: 0, countdownMs: 400});
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
async function open(name, char) {                                  // joins the room and stops in the waiting room
  const page = await (await browser.newContext({viewport: {width: 320, height: 200}})).newPage();          // one window each: a background tab's animation is paused, which would stall that player's game clock
  page.on("pageerror", e => console.log(`[${name} pageerror]`, e.message));
  await page.goto(`http://localhost:${srv.port}/?room=TEST&name=${name}&char=${char}&auto=1`);
  await page.waitForFunction(() => getComputedStyle(document.getElementById("l-wait")).display === "flex", null, {timeout: 60000});
  return page;
}
// wait (up to 40 s: the headless browser renders in software and may run at a few frames a second) for a condition in the page, and record it as a check
const until = (name, page, fn, arg) => page.waitForFunction(fn, arg, {timeout: 40000}).then(() => check(name, true), () => check(name, false));
const inGame = p => p.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 180000});
try {
  const a = await open("Ann", 0), b = await open("Bob", 3);
  await sleep(300);
  const list = await a.evaluate(() => document.getElementById("l-players").textContent);
  check("waiting room lists both players", list.includes("Ann") && list.includes("Bob"));
  check("the round has not started", await a.evaluate(() => !window.__game));
  await a.click("#l-ready"); await sleep(700);
  check("one ready is not enough", await a.evaluate(() => !window.__game));
  await b.click("#l-ready");
  await Promise.all([inGame(a), inGame(b)]);
  await sleep(1500);
  const info = p => p.evaluate(() => { const g = window.__game, n = g.net; return {id: n.id, on: n.on, scene: g.S.id, host: n.host(), pos: [g.P.p.x, g.P.p.z],
    peers: [...n.peers.values()].map(q => ({name: q.name, scene: q.scene, char: q.char, model: !!q.mixer})),
    mons: g.monsters.map(m => [m.pos.x, m.pos.z])}; });
  let A = await info(a), B = await info(b);
  check("both connected", A.on && B.on && A.id !== B.id);
  check("the group spawns together", Math.hypot(A.pos[0] - B.pos[0], A.pos[1] - B.pos[1]) < 3.5, `(${Math.hypot(A.pos[0] - B.pos[0], A.pos[1] - B.pos[1]).toFixed(1)} m apart)`);
  check("each sees the other on B1", A.peers.length === 1 && A.peers[0].name === "Bob" && A.peers[0].scene === "B1" && B.peers[0].name === "Ann" && B.peers[0].scene === "B1");
  check("characters match the picks and their models loaded", A.peers[0].char === 3 && B.peers[0].char === 0 && A.peers[0].model && B.peers[0].model);
  check("exactly one host for B1", A.host !== B.host);
  check("same monster count", A.mons.length > 0 && A.mons.length === B.mons.length, `(${A.mons.length})`);
  await sleep(1500);
  A = await info(a); B = await info(b);
  const maxd = Math.max(...A.mons.map((m, i) => Math.hypot(m[0] - B.mons[i][0], m[1] - B.mons[i][1])));
  check("monsters agree across clients", maxd < 1.5, `(max gap ${maxd.toFixed(2)} m)`);

  // B1 only has the stair door, so move both to L1 (127 doors) for the rest
  await Promise.all([a, b].map(p => p.evaluate(() => window.__game.loadScene("L1"))));
  await Promise.all([a, b].map(p => p.waitForFunction(() => { const g = window.__game; return g.S.id === "L1" && !g.loading && [...g.net.peers.values()].every(q => q.scene === "L1"); }, null, {timeout: 60000})));
  await sleep(500);
  A = await info(a); B = await info(b);
  check("both on L1 with one host", A.scene === "L1" && B.scene === "L1" && A.host !== B.host && A.peers[0]?.scene === "L1" && B.peers[0]?.scene === "L1", JSON.stringify({A: [A.scene, A.host, A.peers[0]?.scene], B: [B.scene, B.host, B.peers[0]?.scene]}));
  const [host, guest] = A.host ? [a, b] : [b, a];

  // doors: opened by the guest, open for the host; then shut by the guest, shut for the host
  const door = await guest.evaluate(() => { const g = window.__game, d = g.doors.find(x => !x.link && x.target === 0); if (!d) return null; g.openDoor(d, true); return d.d.name; });
  if (door) await until("door opened by one is open for the other", host, n => window.__game.doors.find(x => x.d.name === n).target === 1, door); else check("door opened by one is open for the other", false, "no door found");
  const closedOk = await guest.evaluate(n => { const g = window.__game; return g.closeDoor(g.doors.find(x => x.d.name === n)); }, door);
  await sleep(600);
  await until("a door shut by one is shut for the other", host, n => window.__game.doors.find(x => x.d.name === n).target === 0, door);
  check("closeDoor reported success", closedOk);
  const blocked = await guest.evaluate(n => { const g = window.__game, d = g.doors.find(x => x.d.name === n); g.openDoor(d, true); d.p = 1; g.P.p.set(d.cx, d.cy + 0.02, d.cz); return g.closeDoor(d); }, door);
  check("a door will not shut on someone standing in it", blocked === false);
  await guest.evaluate(() => { const g = window.__game; g.teleport(g.randomSpawn(g.S.id)); });
  await sleep(500);

  // downed and revive: the guest goes down where it stands, the host holds E beside the body
  await host.evaluate(() => { for (const m of window.__game.monsters) m.cfg = {...m.cfg, patrol: 0, alert: 0, chase: 0}; });     // keep the monsters from interfering
  await guest.evaluate(() => window.__game.die());
  await until("guest sees DOWNED", guest, () => /DOWNED/.test(document.getElementById("death").textContent));
  await until("host sees the guest down", host, () => [...window.__game.net.peers.values()][0].dead === true);
  const body = await host.evaluate(() => { const p = [...window.__game.net.peers.values()][0]; return {dead: p.dead, x: p.tx, z: p.tz}; });
  await host.evaluate(b => { const g = window.__game; g.P.p.set(b.x + 0.1, g.S.floor + 0.02, b.z); g.P.yaw = Math.PI / 2; }, body);
  await until("host is offered the revive", host, () => !!window.__game.reviveTarget());
  // hold E and advance the host's game clock by hand (software rendering is too slow to wait for 4 s of frames)
  const steps = await host.evaluate(() => { const g = window.__game; g.keys.KeyE = true; let n = 0; while (g.reviveTarget() && n < 400) { g.update(0.05); n++; } g.keys.KeyE = false; return n; });
  check("lifting takes a 4 s hold, not a tap", steps >= 78 && steps <= 90, `(${steps} steps of 0.05 s)`);
  await until("the guest is lifted", guest, () => !window.__game.dead);
  check("the lifted player is briefly safe", await guest.evaluate(() => window.__game.P.imm > 1));

  // the host's monster catches the guest (once the safety has run out)
  await guest.evaluate(() => { window.__game.P.imm = 0; });
  await sleep(300);
  const target = await host.evaluate(() => { const m = window.__game.monsters[0]; return [m.pos.x, m.pos.z]; });
  await guest.evaluate(t => { const g = window.__game; g.P.p.set(t[0], g.S.floor + 0.02, t[1]); }, target);
  await until("host's monster caught the guest", guest, () => window.__game.dead);
  await until("host sees the guest down, with the scream arrow", host, () => { const g = window.__game; return [...g.net.peers.values()][0].dead === true && !!g.net.alert && document.getElementById("scream").style.display === "block"; });

  // leaving hands the floor over
  await guest.close();
  await until("host alone: peer removed, still host", host, () => window.__game.net.peers.size === 0 && window.__game.net.host());
} catch (e) { console.log("ERROR", e); failed++; }
await browser.close(); await srv.close();
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
