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
const until = (name, page, fn, arg) => page.waitForFunction(fn, arg, {timeout: 60000, polling: 200}).then(() => check(name, true), () => check(name, false));
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
  check("each player spawns on their own spot", Math.hypot(A.pos[0] - B.pos[0], A.pos[1] - B.pos[1]) > 0.5, `(${Math.hypot(A.pos[0] - B.pos[0], A.pos[1] - B.pos[1]).toFixed(1)} m apart)`);
  check("each sees the other on B1", A.peers.length === 1 && A.peers[0].name === "Bob" && A.peers[0].scene === "B1" && B.peers[0].name === "Ann" && B.peers[0].scene === "B1");
  check("characters match the picks and their models loaded", A.peers[0].char === 3 && B.peers[0].char === 0 && A.peers[0].model && B.peers[0].model);
  check("exactly one host for B1", A.host !== B.host);
  check("same monster count", A.mons.length > 0 && A.mons.length === B.mons.length, `(${A.mons.length})`);
  await sleep(1500);
  A = await info(a); B = await info(b);
  const maxd = Math.max(...A.mons.map((m, i) => Math.hypot(m[0] - B.mons[i][0], m[1] - B.mons[i][1])));
  check("monsters agree across clients", maxd < 1.5, `(max gap ${maxd.toFixed(2)} m)`);

  // ---- guns: one gun each from the B1 lockers, shared state, and a leaver's locker opens again
  const standBy = (pg, k, i) => pg.evaluate(([k, i]) => { const g = window.__game, it = g.LT.vis[k][i]; g.P.p.set(it.home[0] + 0.5, g.S.floor + 0.02, it.home[1]); g.P.v.set(0, 0, 0); g.step(0.016); g.tryLoot(); }, [k, i]);
  await until("the floor's lockers reach both players", a, () => window.__game.LT.vis.lockers.length === 8 && window.__game.LT.st.B1 && window.__game.LT.st.B1.lockers.length === 8);
  await until("and the other", b, () => window.__game.LT.st.B1 && window.__game.LT.st.B1.lockers.length === 8);
  await standBy(a, "lockers", 0);
  await until("Ann opens a locker and has the gun with 3 rounds", a, () => window.__game.LT.gun && window.__game.LT.rounds === 3);
  await until("Bob sees that locker taken by Ann", b, id => window.__game.LT.st.B1.lockers[0] === id, A.id);
  check("Bob has no gun yet", await b.evaluate(() => !window.__game.LT.gun));
  await standBy(b, "lockers", 0); await sleep(500);
  check("a locker that is already open gives Bob nothing", await b.evaluate(() => !window.__game.LT.gun));
  await standBy(b, "lockers", 3);
  await until("Bob opens another locker", b, () => window.__game.LT.gun && window.__game.LT.rounds === 3);
  await until("Ann sees Bob's locker taken", a, id => window.__game.LT.st.B1.lockers[3] === id, B.id);
  await standBy(a, "lockers", 5); await sleep(500);
  check("Ann cannot take a second gun", await a.evaluate(() => window.__game.LT.st.B1.lockers[5] === 0) && srv.rooms.get("TEST").loot.B1.lockers[5] === 0);
  await standBy(a, "packs", 0);
  await until("a pack gives Ann 3 more rounds", a, () => window.__game.LT.rounds === 6);
  await until("Bob sees the pack gone", b, () => window.__game.LT.st.B1.packs[0] !== 0);
  // ---- the gun across the network: the guest fires, the server sends the shot to the floor's host, who banishes its monster; both see it
  const fighter = A.host ? b : a, owner = A.host ? a : b;
  const aim = await fighter.evaluate(() => {
    const g = window.__game, eye = [g.P.p.x, g.P.p.y + g.P.eye, g.P.p.z]; g.P.imm = 999;
    for (let k = 0; k < 18; k++) { const ang = k * 0.35, d = [-Math.sin(ang), 0, -Math.cos(ang)], x = g.P.p.x + d[0] * 6, z = g.P.p.z + d[2] * 6; if (g.rayClear(eye, d, 7) && g.S.nav[g.cellOf(x, z)]) return {ang, x, z}; }
    return null;
  });
  check("the guest finds open floor to aim across", !!aim);
  await owner.evaluate(sp => { const g = window.__game, m = g.monsters[0]; g.P.imm = 999; m.cfg = {...m.cfg, patrol: 0, alert: 0, chase: 0}; m.pos.set(sp.x, m.fy, sp.z); m.state = "patrol"; }, aim);
  await until("the guest sees the host's monster where it was put", fighter, sp => { const m = window.__game.monsters[0]; return Math.hypot(m.pos.x - sp.x, m.pos.z - sp.z) < 1; }, aim);
  const roundsBefore = await fighter.evaluate(() => window.__game.LT.rounds);
  await fighter.evaluate(sp => { const g = window.__game; g.P.yaw = sp.ang; g.P.pitch = 0; g.GUN.cool = 0; g.fire(); }, aim);
  await until("the host's monster is deleted to a far spot", owner, sp => { const m = window.__game.monsters[0]; return Math.hypot(m.pos.x - sp.x, m.pos.z - sp.z) > 20 && m.state === "patrol"; }, aim);
  await until("the guest sees it there too", fighter, sp => { const m = window.__game.monsters[0]; return Math.hypot(m.pos.x - sp.x, m.pos.z - sp.z) > 20; }, aim);
  check("the shot cost the guest a round", await fighter.evaluate(n => window.__game.LT.rounds === n - 1, roundsBefore));
  // ---- fuses on B1: the stair door stays shut until three fuses are in it
  const spotsA = await a.evaluate(() => window.__game.FZ.vis.items.map(i => i.home)), spotsB = await b.evaluate(() => window.__game.FZ.vis.items.map(i => i.home));
  check("three fuses, in the same places on both clients", spotsA.length === 3 && JSON.stringify(spotsA) === JSON.stringify(spotsB), JSON.stringify(spotsA));
  const lockedAtStart = await a.evaluate(() => { const g = window.__game, d = g.upDoor(); g.openDoor(d, true); return {locked: g.isLocked(d), target: d.target}; });
  check("the stair door is locked and stays shut without a fuse", lockedAtStart.locked && lockedAtStart.target === 0);
  const fuseAt = (page, i) => page.evaluate(i => { const g = window.__game, f = g.FZ.st.B1[i], it = g.FZ.vis.items[i]; return f.s === 3 ? [f.x, f.z] : it.home; }, i);
  const goTo = (page, xz) => page.evaluate(t => { const g = window.__game; g.P.p.set(t[0], g.S.floor + 0.02, t[1]); g.P.v.set(0, 0, 0); }, xz);
  // Bob takes fuse 1 and goes down with it: it drops where he fell
  await goTo(b, spotsB[1]); await b.keyboard.press("KeyE");
  await until("Bob carries fuse 1 (and Ann sees the glow)", a, () => { const g = window.__game, f = g.FZ.st.B1[1]; return f.s === 1 && [...g.net.peers.values()][0].carry === true; });
  await b.evaluate(() => window.__game.die());
  await until("a downed carrier drops the fuse where he fell", a, () => { const f = window.__game.FZ.st.B1[1]; return f.s === 3 && Number.isFinite(f.x); });
  await b.evaluate(() => window.__game.revived());
  // Ann carries all three to the door, one at a time
  for (let i = 0; i < 3; i++) {
    await goTo(a, await fuseAt(a, i)); await a.keyboard.press("KeyE");
    await until(`Ann picks up fuse ${i + 1}`, a, n => window.__game.FZ.st.B1[n].s === 1, i);
    if (i === 0) { await until("a second client sees who carries it", b, () => window.__game.FZ.st.B1[0].s === 1);
      check("a carrier cannot take a second fuse", await a.evaluate(() => { const g = window.__game; g.tryFuse(); return g.FZ.st.B1.filter(f => f.s === 1).length === 1; })); }
    await a.evaluate(() => window.__game.openDoor(window.__game.upDoor(), true));
    await until(`fuse ${i + 1} is in the door`, a, n => window.__game.FZ.st.B1.filter(f => f.s === 2).length === n + 1, i);
    if (i < 2) check(`the door is still locked with ${i + 1} fuse(s)`, await a.evaluate(() => window.__game.isLocked(window.__game.upDoor())));
  }
  await until("Bob sees the door powered", b, () => window.__game.FZ.st.B1.every(f => f.s === 2));
  // hearing: running is the full range, walking half, crouching silent (a carrier still heard), walls halve it (checked on whichever client runs the monsters)
  const hostPage = A.host ? a : b;
  const noise = await hostPage.evaluate(() => { const g = window.__game, m = g.monsters[0], c = m.cfg;
    const at = (d, o) => ({id: 99, x: m.pos.x + Math.sin(m.yaw) * d, y: m.fy, z: m.pos.z + Math.cos(m.yaw) * d, crouch: false, moving: true, carry: false, ...o});      // behind it, so it cannot see them
    const run = (t, clear) => { m.los = () => clear; m.state = "patrol"; m.path = []; m.update(0.01, [t]); return m.state; };
    const out = {runFar: run(at(c.hear * 0.8, {run: true}), true), walkFar: run(at(c.hear * 0.8, {}), true), walkNear: run(at(c.hear * 0.4, {}), true),
      crouchQuiet: run(at(c.hear * 0.5, {crouch: true}), true), carryCrouchNear: run(at(c.hear * 0.3, {crouch: true, carry: true}), true), carryCrouchFar: run(at(c.hear * 0.6, {crouch: true, carry: true}), true),
      runThroughWall: run(at(c.hear * 0.8, {run: true}), false), runNearWall: run(at(c.hear * 0.4, {run: true}), false)};
    delete m.los; return out; });
  check("running is heard at the full range, walking at half", noise.runFar === "search" && noise.walkFar === "patrol" && noise.walkNear === "search", JSON.stringify(noise));
  check("crouching is silent, but a crouching carrier is heard up close", noise.crouchQuiet === "patrol" && noise.carryCrouchNear === "search" && noise.carryCrouchFar === "patrol");
  check("a wall halves what is heard", noise.runThroughWall === "patrol" && noise.runNearWall === "search");
  // Ann takes the real stair door to L1; Bob is moved there
  await a.evaluate(() => { const g = window.__game; g.openDoor(g.upDoor(), true); });
  await a.evaluate(async () => { const g = window.__game; for (let i = 0; i < 40 && g.S.id === "B1"; i++) { g.update(0.05); await new Promise(r => setTimeout(r, 30)); } });
  await Promise.all([a.waitForFunction(() => window.__game.S.id === "L1" && !window.__game.loading, null, {timeout: 60000}), b.evaluate(() => window.__game.loadScene("L1"))]);
  check("the powered stair door took Ann to L1", await a.evaluate(() => window.__game.S.id === "L1"));
  await Promise.all([a, b].map(p => p.waitForFunction(() => { const g = window.__game; return g.S.id === "L1" && !g.loading && [...g.net.peers.values()].every(q => q.scene === "L1"); }, null, {timeout: 60000})));
  await sleep(500);
  A = await info(a); B = await info(b);
  check("both on L1 with one host", A.scene === "L1" && B.scene === "L1" && A.host !== B.host && A.peers[0]?.scene === "L1" && B.peers[0]?.scene === "L1", JSON.stringify({A: [A.scene, A.host, A.peers[0]?.scene], B: [B.scene, B.host, B.peers[0]?.scene]}));
  let [host, guest] = A.host ? [a, b] : [b, a];

  // ---- L1 switches: flipped one at a time by different players, in any order; each flip draws the monsters
  const swSpots = await a.evaluate(() => window.__game.FZ.vis.sws.map(i => i.home)), swSpotsB = await b.evaluate(() => window.__game.FZ.vis.sws.map(i => i.home));
  check("two switches, in the same places on both clients", swSpots.length === 2 && JSON.stringify(swSpots) === JSON.stringify(swSpotsB));
  check("the L1 stair door starts locked", await a.evaluate(() => window.__game.isLocked(window.__game.upDoor())));
  const goSw = (page, xz) => page.evaluate(t => { const g = window.__game; g.P.p.set(t[0], g.S.floor + 0.02, t[1]); g.P.v.set(0, 0, 0); }, xz);
  await host.evaluate(([x, z]) => { const g = window.__game; for (const m of g.monsters) { m.state = "patrol"; m.path = []; } const m = g.monsters[0]; m.pos.set(x + 8, m.fy, z); }, swSpots[1]);     // a monster within earshot of switch 1
  await goSw(guest, swSpots[1]); await guest.keyboard.press("KeyE");
  await until("the guest flips switch 2 (the host sees it)", host, () => { const st = window.__game.SW.st.L1; return !!st && st[1].on && !st[0].on; });
  check("one switch is not enough", await host.evaluate(() => window.__game.isLocked(window.__game.upDoor())));
  check("the host's monsters went to look at the clunk", await host.evaluate(() => { const m = window.__game.monsters[0]; return m.state === "search" || m.state === "chase"; }));
  await goSw(host, swSpots[0]); await host.keyboard.press("KeyE");
  await until("the host flips the other switch; the guest sees the door powered", guest, () => { const st = window.__game.SW.st.L1; return !!st && st.every(x => x.on) && !window.__game.isLocked(window.__game.upDoor()); });

  // ---- L2 keypad: notes read by different players are shared; the code stays on the server; a wrong code locks it for everyone
  await Promise.all([a, b].map(pg => pg.evaluate(() => window.__game.loadScene("L2"))));
  await Promise.all([a, b].map(pg => pg.waitForFunction(() => { const g = window.__game; return g.S.id === "L2" && !g.loading && [...g.net.peers.values()].every(q => q.scene === "L2") && !!g.KP.st.L2; }, null, {timeout: 60000})));
  A = await info(a); B = await info(b); [host, guest] = A.host ? [a, b] : [b, a];
  const noteSpotsA = await a.evaluate(() => window.__game.FZ.vis.notes.map(n => n.home)), noteSpotsB = await b.evaluate(() => window.__game.FZ.vis.notes.map(n => n.home));
  check("four notes, in the same places on both clients", noteSpotsA.length === 4 && JSON.stringify(noteSpotsA) === JSON.stringify(noteSpotsB));
  check("the L2 stair door starts locked", await a.evaluate(() => window.__game.isLocked(window.__game.upDoor())));
  const kpRoom = srv.rooms.get("TEST").keypads.L2, code = kpRoom.code;                  // the test peeks at the server; no client has the code
  check("no client holds the code", await a.evaluate(() => !window.__game.KP.local.L2) && await b.evaluate(() => !window.__game.KP.local.L2));
  await goSw(guest, noteSpotsA[0]); await guest.keyboard.press("KeyE");
  await goSw(host, noteSpotsA[3]); await host.keyboard.press("KeyE");
  await until("each player sees both notes that were read", host, c => { const f = window.__game.KP.st.L2.found; return f[0] === c[0] && f[3] === c[3] && f[1] === null && f[2] === null; }, code);
  await until("the other player sees them too (and still not the rest)", guest, c => { const f = window.__game.KP.st.L2.found; return f[0] === c[0] && f[3] === c[3] && f[1] === null && f[2] === null; }, code);
  const wrongCode = code.map(d => (d + 1) % 10).join("");
  await host.evaluate(([x, z]) => { const g = window.__game; for (const m of g.monsters) { m.state = "patrol"; m.path = []; } const m = g.monsters[0], d = g.upDoor(); m.pos.set(d.cx + 8, m.fy, d.cz); }, [0, 0]);
  await guest.evaluate(w => window.__game.kpAct({a: "try", code: w}), wrongCode);
  await until("a wrong code locks the keypad for both", host, () => { const v = window.__game.KP.st.L2; return v.fails === 1 && v.lockMs > 7000; });
  await until("the guest sees the lock too", guest, () => window.__game.KP.st.L2.fails === 1);
  check("the wrong code sent the host's monster to the door", await host.evaluate(() => { const m = window.__game.monsters[0]; return m.state === "search" || m.state === "chase"; }));
  srv.rooms.get("TEST").keypads.L2.lockUntil = Date.now() + 60000;                         // hold the lock open: this slow browser can take more than its 8 s to get here
  await host.evaluate(c => window.__game.kpAct({a: "try", code: c}), code.join(""));
  await new Promise(r => setTimeout(r, 600));
  check("the right code does nothing while it is locked", !srv.rooms.get("TEST").keypads.L2.solved);
  srv.rooms.get("TEST").keypads.L2.lockUntil = 0;                                       // skip the 8 s wait
  await host.evaluate(c => window.__game.kpAct({a: "try", code: c}), code.join(""));
  await until("the right code opens the door for both", guest, () => window.__game.KP.st.L2.solved && !window.__game.isLocked(window.__game.upDoor()));
  await until("and for the host", host, () => window.__game.KP.st.L2.solved);

  // ---- power: the host throws the L3 box (the quick way); the guest, who comes to L4 afterwards, finds the doors open
  const onFloor = id => Promise.all([a, b].map(pg => pg.evaluate(i => window.__game.loadScene(i), id).then(() => pg.waitForFunction(i => { const g = window.__game; return g.S.id === i && !g.loading && [...g.net.peers.values()].every(q => q.scene === i); }, id, {timeout: 60000}))));
  await onFloor("L3");
  A = await info(a); B = await info(b); [host, guest] = A.host ? [a, b] : [b, a];
  check("the power starts off for both players", await a.evaluate(() => !window.__game.POWER.on) && await b.evaluate(() => !window.__game.POWER.on));
  await host.evaluate(() => { const g = window.__game, sp = g.S.pw.spot; g.P.p.set(sp[0], g.S.floor + 0.02, sp[1] + 1.4); g.P.v.set(0, 0, 0); });
  await host.keyboard.press("KeyE");
  await until("the host throws the L3 box: both hear of it", guest, () => window.__game.POWER.on && window.__game.POWER.by === "L3");
  await until("and the host", host, () => window.__game.POWER.on);
  check("the server holds it for the room", srv.rooms.get("TEST").power.on === true && srv.rooms.get("TEST").power.by === "L3");
  await onFloor("L4");
  check("on arrival both find the L4 doors open", await a.evaluate(() => { const g = window.__game; return g.S.shutter.off && !g.collide({x: 0, y: g.S.floor + 0.3, z: 27.2}) && !g.S.glass.visible; }) && await b.evaluate(() => { const g = window.__game; return g.S.shutter.off && !g.collide({x: 0, y: g.S.floor + 0.3, z: 27.2}) && !g.S.glass.visible; }));
  await onFloor("L2");
  A = await info(a); B = await info(b); [host, guest] = A.host ? [a, b] : [b, a];

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
  let steps = 0;
  for (let attempt = 1; attempt <= 3 && steps < 78; attempt++) {
    await host.evaluate(b => { const g = window.__game; g.P.p.set(b.x, g.S.floor + 0.02, b.z); g.P.v.set(0, 0, 0); g.P.yaw = Math.PI / 2; }, body);
    await until("host is offered the revive", host, () => !!window.__game.reviveTarget());
    // hold E and advance the host's game clock by hand (software rendering is too slow to wait for 4 s of frames)
    steps = await host.evaluate(() => { const g = window.__game; g.keys.KeyE = true; let n = 0; while (g.reviveTarget() && n < 400) { g.update(0.05); n++; } g.keys.KeyE = false; return n; });
    if (steps < 78) console.log(`WARN revive attempt ${attempt} ended after ${steps} steps`, JSON.stringify(await host.evaluate(() => { const g = window.__game; return {dead: g.dead, loading: g.loading, scene: g.S.id, me: [g.P.p.x, g.P.p.y, g.P.p.z], peers: [...g.net.peers.values()].map(q => [q.scene, q.dead, q.tx, q.ty, q.tz])}; })));
  }
  check("lifting takes a 4 s hold, not a tap", steps >= 78 && steps <= 90, `(${steps} steps of 0.05 s)`);
  await until("the guest is lifted", guest, () => !window.__game.dead);
  check("both players compute the cameras from the same clock (offsets agree within 0.3 s)", Math.abs((await guest.evaluate(() => window.__game.net.off)) - (await host.evaluate(() => window.__game.net.off))) < 300);
  check("the lifted player is briefly safe", await guest.evaluate(() => window.__game.P.imm > 1));
  await guest.evaluate(() => { const g = window.__game; g.BC.have = 1; let best = 0, bl = -1; const eye = [g.P.p.x, g.P.p.y + g.P.eye, g.P.p.z]; for (let y = 0; y < 6.28; y += 0.2) { let L = 0; while (L < 12 && g.rayClear(eye, [-Math.sin(y), 0, -Math.cos(y)], L + 1)) L++; if (L > bl) { bl = L; best = y; } } g.P.yaw = best; g.throwBeacon(); });
  await until("the host's floor shows the guest's beacon", host, () => window.__game.BC.list.length === 1);
  check("the beacon is the same place for both", await (async () => { const a = await guest.evaluate(() => { const b = window.__game.BC.list[0]; return [b.x, b.z]; }), b = await host.evaluate(() => { const b = window.__game.BC.list[0]; return [b.x, b.z]; }); return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01; })());
  await host.evaluate(() => { window.__game.BC.list.length = 0; });

  // the host's monster catches the guest (once the safety has run out)
  await guest.evaluate(() => { window.__game.P.imm = 0; });
  await sleep(300);
  const target = await host.evaluate(() => { const m = window.__game.monsters[0]; return [m.pos.x, m.pos.z]; });
  await guest.evaluate(t => { const g = window.__game; g.P.p.set(t[0], g.S.floor + 0.02, t[1]); }, target);
  await until("the host knows where the guest stands, and that it is no longer safe", host, t => { const p = [...window.__game.net.peers.values()][0]; return Math.hypot(p.tx - t[0], p.tz - t[1]) < 0.5 && !p.imm && !p.dead; }, target);
  await host.evaluate(() => { for (let i = 0; i < 20; i++) window.__game.update(0.05); });        // run the host's monsters by hand rather than wait on its frame rate
  await until("host's monster hit the lifted guest (50 HP): at most 15 left", guest, () => window.__game.HP.h.hp <= 15);
  await until("the host sees the guest's low HP under their name", host, () => [...window.__game.net.peers.values()][0].hp <= 15);
  await guest.evaluate(() => { const g = window.__game; g.HP.h.hurtAt = -Infinity; g.applyHit(35); g.HP.h.hurtAt = -Infinity; g.applyHit(35); });     // the next hit, past the grace second
  await until("the next hit downs the guest", guest, () => window.__game.dead);
  await until("host sees the guest down, with the scream arrow", host, () => { const g = window.__game; return [...g.net.peers.values()][0].dead === true && !!g.net.alert && document.getElementById("scream").style.display === "block"; });

  // leaving hands the floor over
  const leaverId = await guest.evaluate(() => window.__game.net.id);
  await until("the host knows the guest carries the ray gun and has its model ready", host, () => { const p = [...window.__game.net.peers.values()][0]; return p.gun === true && !!p.gunObj; });                    // (the guest is down by now, and a downed player's gun is hidden)
  check("before leaving, the guest holds a locker", srv.rooms.get("TEST").loot.B1.lockers.includes(leaverId));
  await guest.close();
  await sleep(500);
  check("a player who leaves puts their locker back", !srv.rooms.get("TEST").loot.B1.lockers.includes(leaverId));
  await until("host alone: peer removed, still host", host, () => window.__game.net.peers.size === 0 && window.__game.net.host());

  // ---- another room that never touches the L3 box: L4 is shut, the far switch opens it, and the first room was not affected
  const solo2 = await (await browser.newContext({viewport: {width: 320, height: 200}})).newPage();
  solo2.on("pageerror", e => console.log("[Cy pageerror]", e.message));
  await solo2.goto(`http://localhost:${srv.port}/?room=OTHER&name=Cy&char=2&auto=1&ready=1`);
  await inGame(solo2);
  await solo2.evaluate(() => window.__game.loadScene("L4")); await solo2.waitForFunction(() => window.__game.S.id === "L4" && !window.__game.loading, null, {timeout: 60000});
  check("a room that did not use the L3 box finds L4 shut", await solo2.evaluate(() => { const g = window.__game; return !g.POWER.on && !g.S.shutter.off && !!g.collide({x: 0, y: g.S.floor + 0.3, z: 27.2}); }));
  await solo2.evaluate(() => { const g = window.__game, sp = g.S.pw.spot; g.P.p.set(sp[0] + 1.2, g.S.floor + 0.02, sp[1]); g.P.v.set(0, 0, 0); });
  await solo2.keyboard.press("KeyE");
  await until("the L4 far switch powers it through the server", solo2, () => window.__game.POWER.on && window.__game.POWER.by === "L4" && !window.__game.S.shutter.off === false);
  check("the room's state is its own", srv.rooms.get("OTHER").power.by === "L4" && srv.rooms.get("TEST").power.by === "L3");

  // ---- the finale in a third room: the alarm for both, the first out is place 1, the results come when the second is out
  for (const pg of [a, b, solo2]) await pg.close().catch(() => {});             // software rendering: free the CPU for the last room
  const mk = async (name, char) => { const pg = await (await browser.newContext({viewport: {width: 320, height: 200}})).newPage(); pg.on("pageerror", e => console.log(`[${name} pageerror]`, e.message)); await pg.goto(`http://localhost:${srv.port}/?room=FIN&name=${name}&char=${char}&auto=1&ready=1`); await inGame(pg); return pg; };
  const x = await mk("Xia", 1), y = await mk("Yul", 4);
  const toL4 = pg => pg.evaluate(() => window.__game.loadScene("L4")).then(() => pg.waitForFunction(() => window.__game.S.id === "L4" && !window.__game.loading, null, {timeout: 170000}));
  await toL4(x); await toL4(y);
  await x.evaluate(() => { const g = window.__game, sp = g.S.pw.spot; g.P.imm = 99; g.P.p.set(sp[0] + 1.2, g.S.floor + 0.02, sp[1]); g.P.v.set(0, 0, 0); });
  await x.keyboard.press("KeyE");
  await until("the L4 switch sets off the alarm for both players", y, () => window.__game.POWER.on && window.__game.FIN.alarmUntil > 0);
  await until("and for the one who threw it", x, () => window.__game.FIN.alarmUntil > 0);
  await y.evaluate(() => { const g = window.__game; g.P.imm = 99; g.step(0.05); });
  check("the alarm shows a countdown", await y.evaluate(() => /ALARM \d:\d\d/.test(document.getElementById("alarm").textContent)));
  await x.evaluate(() => { const g = window.__game; g.P.p.set(0, g.S.floor + 0.02, g.EXIT_Z + 0.5); g.step(0.02); });
  await until("the first one out is place 1, and the other hears of it", y, () => { const e = window.__game.FIN.exited.get([...window.__game.net.peers.keys()][0]); return e && e.place === 1; });
  await y.evaluate(() => window.__game.step(0.05));
  check("nobody gets results while one is still inside", !(await x.evaluate(() => !!window.__game.FIN.results)) && !(await y.evaluate(() => !!window.__game.FIN.results)));
  check("the one who is out sees how many are out", await x.evaluate(() => { window.__game.step(0.05); return /OUT · 1\/2/.test(document.getElementById("alarm").textContent); }));
  await y.evaluate(() => { const g = window.__game; g.P.p.set(1, g.S.floor + 0.02, g.EXIT_Z + 0.5); g.step(0.02); });
  await until("when the second is out both see the results", x, () => !!window.__game.FIN.results);
  await until("and the other one", y, () => !!window.__game.FIN.results);
  check("places are 1 and 2, in the order they left", await x.evaluate(() => window.__game.FIN.results.map(r => r.place + r.name).join()) === "1Xia,2Yul");
  check("the results screen shows", await y.evaluate(() => getComputedStyle(document.getElementById("results")).display === "flex" && document.querySelectorAll("#r-rows tr").length === 2));
} catch (e) { console.log("ERROR", e); failed++; }
await browser.close(); await srv.close();
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
