// Two-browser multiplayer check. Starts server/server.js on a free port, opens two game pages in one room and checks:
// presence on the same floor, one host per floor, monsters following the host's snapshots, shared doors, and a host monster catching the other player.
// Usage: node tools/mp_test.mjs      (needs Playwright + Chromium and internet for three.js from unpkg)
import {createRequire} from "node:module";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) failed++; };

const srv = await createServer({port: 0});
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
async function join(name) {
  const page = await browser.newPage();
  page.on("pageerror", e => console.log(`[${name} pageerror]`, e.message));
  await page.goto(`http://localhost:${srv.port}/?room=TEST&name=${name}&auto=1`);
  await page.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 120000});
  return page;
}
try {
  const a = await join("Ann"), b = await join("Bob");
  await sleep(1500);
  const info = p => p.evaluate(() => { const g = window.__game, n = g.net; return {id: n.id, on: n.on, scene: g.S.id, host: n.host(), peers: [...n.peers.values()].map(q => ({name: q.name, scene: q.scene})),
    mons: g.monsters.map(m => [m.pos.x, m.pos.z]), state: g.monsters.map(m => m.state)}; });
  let A = await info(a), B = await info(b);
  check("both connected", A.on && B.on && A.id !== B.id);
  check("each sees the other on B1", A.peers.length === 1 && A.peers[0].name === "Bob" && A.peers[0].scene === "B1" && B.peers[0].name === "Ann" && B.peers[0].scene === "B1");
  check("exactly one host for B1", A.host !== B.host);
  check("same monster count", A.mons.length > 0 && A.mons.length === B.mons.length, `(${A.mons.length})`);
  await sleep(1500);
  A = await info(a); B = await info(b);
  const maxd = Math.max(...A.mons.map((m, i) => Math.hypot(m[0] - B.mons[i][0], m[1] - B.mons[i][1])));
  check("monsters agree across clients", maxd < 1.5, `(max gap ${maxd.toFixed(2)} m)`);
  // B1 only has the stair door, so move both to L1 (127 doors) for the rest
  await Promise.all([a, b].map(p => p.evaluate(() => window.__game.loadScene("L1"))));
  await sleep(1500);
  A = await info(a); B = await info(b);
  check("both on L1 with one host", A.scene === "L1" && B.scene === "L1" && A.host !== B.host && A.peers[0]?.scene === "L1");
  const [host, guest] = A.host ? [a, b] : [b, a];

  // a door opened by the guest opens for the host
  const door = await guest.evaluate(() => { const g = window.__game, d = g.doors.find(x => !x.link && x.target === 0); if (!d) return null; g.openDoor(d, true); return d.d.name; });
  await sleep(600);
  const seen = door && await host.evaluate(n => window.__game.doors.find(x => x.d.name === n).target, door);
  check("door opened by one is open for the other", door && seen === 1, door || "no door found");

  // the host's monster catches the guest
  await guest.evaluate(() => { const g = window.__game; g.net.ws.send(JSON.stringify({t: "noop"})); });
  const target = await host.evaluate(() => { const m = window.__game.monsters[0]; return [m.pos.x, m.pos.z]; });
  await guest.evaluate(t => { const g = window.__game; g.P.p.set(t[0], g.S.floor + 0.02, t[1]); }, target);
  await guest.waitForFunction(() => window.__game.dead, null, {timeout: 8000}).then(() => check("host's monster caught the guest", true), () => check("host's monster caught the guest", false));
  await sleep(700);
  const seenDead = await host.evaluate(() => [...window.__game.net.peers.values()][0].dead);
  check("host sees the guest as down", seenDead === true);

  // leaving hands the floor over
  await guest.close(); await sleep(800);
  const after = await info(host);
  check("host alone: peer removed, still host", after.peers.length === 0 && after.host);
} catch (e) { console.log("ERROR", e); failed++; }
await browser.close(); await srv.close();
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
