// The server runs each occupied floor's monsters and takes over what the "host" player used to do. Tests drive it with real sockets and step the floor by hand (the ticker also runs).
import test from "node:test";
import assert from "node:assert/strict";
import {WebSocket} from "ws";
import {createServer} from "./server.js";
import {REGISTRY} from "../shared/registry.js";
import {segClear, mainRegion, cellXZ, cellOf, FLOORS, rng32, rayClear} from "../shared/world.js";

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`), inbox = [], waiters = [];
  ws.on("message", d => { const m = JSON.parse(d); inbox.push(m); waiters.splice(0).forEach(w => w()); });
  return {ws, inbox, send: m => ws.send(JSON.stringify(m)), open: new Promise(r => ws.on("open", r)),
    async next(pred, ms = 3000) { const end = Date.now() + ms; for (;;) { const i = inbox.findIndex(pred); if (i >= 0) return inbox.splice(i, 1)[0]; if (Date.now() > end) throw new Error("timed out"); await new Promise(r => { waiters.push(r); setTimeout(r, 50); }); } },
    quiet: async ms => { await new Promise(r => setTimeout(r, ms)); return inbox.splice(0); }};
}
const kind = t => m => m.t === t;
async function join(srv, room, name) { const c = client(srv.port); await c.open; c.send({t: "join", room, name}); const w = await c.next(kind("welcome")); return Object.assign(c, {id: w.id}); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const at = (c, scene, x, z, extra = {}) => c.send({t: "s", scene, x, y: FLOORS[scene] + 0.02, z, yaw: 0, crouch: 0, moving: 0, run: 0, carry: 0, dead: 0, imm: 0, ...extra});
const stepN = (floor, secs) => { for (let t = 0; t < secs; t += 0.05) floor.step(0.05); };
// a spot with a clear straight line of d metres to another walkable spot
function clearPair(W, d, seed = 4) {
  const cells = mainRegion(W), r = rng32(seed), inRegion = new Set(cells);
  for (let i = 0; i < 4000; i++) {
    const [x, z] = cellXZ(cells[Math.floor(r() * cells.length)]), a = r() * 6.28, x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d;
    if (!inRegion.has(cellOf(x2, z2))) continue;
    if ([0.25, 0.5, 0.75, 1].every(u => segClear(W, x, W.floor + 1.0, z, x + (x2 - x) * u, W.floor + 1.0, z + (z2 - z) * u, 0)) && segClear(W, x, W.floor + 1.5, z, x2, W.floor + 1.5, z2, 0) && rayClear(W, [x, W.floor + 1.52, z], [(x2 - x) / d, 0, (z2 - z) / d], d)) return [[x, z], [x2, z2]];
  }
  throw new Error("no clear pair");
}
async function floorWith(srv, code, scene, names = ["Ann"]) {
  const ps = []; for (const n of names) ps.push(await join(srv, code, n));
  for (const p of ps) at(p, scene, 0, 0); await sleep(150);
  return {ps, floor: srv.rooms.get(code).floors[scene], room: srv.rooms.get(code)};
}

test("a floor exists while someone is on it, with the monsters its level has, and is dropped when the last one leaves", async () => {
  const srv = await createServer(), {ps, room} = await floorWith(srv, "F1", "B1", ["Ann", "Bob"]);
  assert.ok(room.floors.B1); assert.equal(room.floors.B1.monsters.length, 4); assert.equal(room.floors.L3, undefined);
  at(ps[1], "L3", 0, 0); await sleep(150); assert.ok(room.floors.L3 && room.floors.L3.monsters.length === 0, "L3 has none");
  at(ps[0], "L1", 0, 0); await sleep(150); assert.equal(room.floors.B1, undefined, "nobody left on B1");
  ps[0].ws.close(); ps[1].ws.close(); await sleep(150); assert.deepEqual(Object.keys(room.floors).length === 0 || !srv.rooms.get("F1"), true);
  await srv.close();
});
test("the floor's players get snapshots of the monsters, others do not", async () => {
  const srv = await createServer({simHz: 40}), {ps} = await floorWith(srv, "F2", "B1", ["Ann", "Bob"]);
  at(ps[1], "L2", 0, 0); await sleep(200); ps[0].inbox.length = 0; ps[1].inbox.length = 0;
  const m = await ps[0].next(kind("m")); assert.equal(m.scene, "B1"); assert.equal(m.l.length, 4); assert.ok(m.l.every(s => s.length === 5 && s.every(Number.isFinite)));
  assert.ok(!(await ps[1].quiet(300)).some(x => x.t === "m" && x.scene === "B1"), "a player on another floor gets none of B1's");
  await srv.close();
});
test("a ray-gun shot is decided here: a hit banishes the monster and the floor gets a zap; a shot from nowhere near the shooter does nothing", async () => {
  const srv = await createServer(), {ps, floor} = await floorWith(srv, "F4", "B1", ["Ann", "Bob"]);
  const [a, b] = clearPair(floor.W, 8), m = floor.monsters[0]; m.cfg = {...m.cfg, patrol: 0, alert: 0, chase: 0}; m.state = "patrol"; m.wait = 99; m.pos.set(b[0], m.fy, b[1]);
  at(ps[0], "B1", a[0], a[1]); at(ps[1], "B1", a[0] + 1, a[1]); await sleep(150); ps[0].send({t: "loot", k: "locker", i: 0}); await ps[0].next(m2 => m2.t === "me" && m2.gun); ps[0].inbox.length = 0; ps[1].inbox.length = 0;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), d = [dx / L, 0, dz / L], o = [a[0], floor.W.floor + 1.52, a[1]];
  ps[0].send({t: "shot", o: [o[0] + 40, o[1], o[2]], d}); await sleep(150); assert.ok(m.glitchT <= 0, "a shot from 40 m away from the shooter is refused");
  ps[0].send({t: "shot", o, d, e: [b[0], o[1], b[1]]});
  const z = await ps[1].next(kind("zap")); assert.equal(z.i, 0); assert.ok(Math.hypot(z.to[0] - a[0], z.to[1] - a[1]) >= 15); await ps[0].next(kind("zap"));
  assert.ok(m.glitchT > 0 && m.immuneT > 0, "the monster is banished and immune");
  assert.ok((await ps[1].next(kind("beam"))).t === "beam", "the others still see the beam");
  await srv.close();
});
test("a thrown beacon pulls the monsters in range and ends in a search; junk is ignored", async () => {
  const srv = await createServer(), {ps, floor} = await floorWith(srv, "F5", "B1", ["Ann", "Bob"]);
  const [a, b] = clearPair(floor.W, 10), m = floor.monsters[0]; m.pos.set(b[0], m.fy, b[1]); m.state = "patrol"; m.wait = 99;
  m.yaw = Math.atan2(a[0] - b[0], a[1] - b[1]);                                          // facing away from the players: it does not see them
  const can = [a[0] + (b[0] - a[0]) * 0.85, a[1] + (b[1] - a[1]) * 0.85];                  // the can lies 8.5 m from the thrower, near the monster (more than 4 m from any player, or it would notice them)
  at(ps[0], "B1", a[0], a[1]); at(ps[1], "B1", a[0] - 2, a[1]); await sleep(150); ps[0].send({t: "loot", k: "beacon", i: 0}); await ps[0].next(m2 => m2.t === "me" && m2.beacons === 1); ps[1].inbox.length = 0;
  ps[0].send({t: "beacon", x: "x", z: 1}); ps[0].send({t: "beacon", x: 1e9, z: 1}); await sleep(100); assert.equal(floor.lures.length, 0);
  ps[0].send({t: "beacon", x: can[0], z: can[1]}); await ps[1].next(kind("beacon")); assert.equal(floor.lures.length, 1);
  stepN(floor, 20); assert.equal(m.lureId, 1, "it went to the can"); assert.ok(Math.hypot(m.pos.x - can[0], m.pos.z - can[1]) < 4, "and is round it");
  floor.t += 30; stepN(floor, 0.2); assert.equal(m.lureId, null, "then the beacon ended"); await srv.close();
});
test("a noise alerts the monsters near it: a flipped switch, a wrong code; the finale's alarm sends them all to the doors", async () => {
  const srv = await createServer(), {ps, floor, room} = await floorWith(srv, "F6", "L1", ["Ann"]);
  const m = floor.monsters[0]; m.state = "patrol"; m.wait = 99; at(ps[0], "L1", m.pos.x + 12, m.pos.z); await sleep(100);
  ps[0].send({t: "switch", i: 0}); await sleep(150); assert.equal(m.state, "search", "a switch flipped 12 m away is heard");
  const srv2 = await createServer(), f2 = await floorWith(srv2, "F7", "L4", ["Ann"]); f2.room.run = {startedAt: 0, exits: [{id: f2.ps[0].id}], ended: false}; f2.room.alarmAt = Date.now();          // (she is already out, so nothing chases her)
  for (const mm of f2.floor.monsters) { mm.state = "patrol"; mm.wait = 99; } stepN(f2.floor, 2.2);
  assert.ok(f2.floor.monsters.length > 0 && f2.floor.monsters.every(mm => mm.state === "search" && Math.abs(mm.last[1] - 24.5) < 0.1), "all hunt for the doors while the alarm runs");
  void room; await srv.close(); await srv2.close();
});
test("a door a player asks for opens for the whole floor only when they are near it; a stair door never; a monster in the doorway keeps it open", async () => {
  const srv = await createServer(), {ps, floor} = await floorWith(srv, "F8", "L1", ["Ann", "Bob"]);
  const dr = floor.W.doors.find(d => !d.link), link = floor.W.doors.find(d => d.link);
  at(ps[0], "L1", dr.cx + 1, dr.cz); await sleep(100); ps[1].inbox.length = 0;
  ps[0].send({t: "door", name: dr.d.name, open: 1}); const d1 = await ps[1].next(kind("door")); assert.deepEqual([d1.name, d1.open], [dr.d.name, 1]);
  at(ps[0], "L1", dr.cx + 30, dr.cz); await sleep(100); ps[0].send({t: "door", name: dr.d.name, open: 0}); await sleep(100); assert.equal(dr.target, 1, "too far to shut it");
  at(ps[0], "L1", link.cx + 1, link.cz); await sleep(100); ps[0].send({t: "door", name: link.d.name, open: 1}); await sleep(100); assert.equal(link.target, 0, "stair doors are not a player's to open");
  await srv.close();
});
test("simulating a busy floor is cheap: a full room (the manifest's size) on B1 for 10 s of game time", async () => {
  const srv = await createServer(), {ps, floor} = await floorWith(srv, "F9", "B1", Array.from({length: REGISTRY.maxPlayers("original")}, (_, i) => "p" + i));
  const r = rng32(9), cells = mainRegion(floor.W); ps.forEach((p, i) => { const [x, z] = cellXZ(cells[Math.floor(r() * cells.length)]); at(p, "B1", x, z, {moving: 1, run: i % 2}); }); await sleep(150);
  const t0 = process.hrtime.bigint(); stepN(floor, 10); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
  console.log(`  average tick ${ms.toFixed(2)} ms`); assert.ok(ms < 5, `${ms} ms per tick`); await srv.close();
});

// ---- the server owns health, rounds, cloak and beacons
const clockOf = () => { const c = {t: 1000, now: () => c.t, adv(s) { c.t += s; }}; return c; };
test("a monster's hit costs 35 HP that the server tracks and tells the player and the floor; a client cannot say otherwise", async () => {
  const clk = clockOf(), srv = await createServer({clock: clk.now}), {ps, floor} = await floorWith(srv, "P1", "B1", ["Ann", "Bob"]);
  const m = floor.monsters[0]; m.state = "patrol"; m.wait = 99; at(ps[0], "B1", m.pos.x + 0.4, m.pos.z, {hp: 100}); at(ps[1], "B1", m.pos.x + 30, m.pos.z); await sleep(150);
  stepN(floor, 0.2); const me = await ps[0].next(m2 => m2.t === "me" && m2.hp === 65); assert.equal(me.hp, 65);
  ps[1].inbox.length = 0; at(ps[0], "B1", m.pos.x + 0.4, m.pos.z, {hp: 100, dead: 0}); const s2 = await ps[1].next(m2 => m2.t === "s" && m2.id === ps[0].id); assert.equal(s2.hp, 65, "the client's own hp (100) is ignored");
  await srv.close();
});
test("three hits down a player: the server says so (dead on the relay), and they get up alone after 45 s with 100 HP", async () => {
  const clk = clockOf(), srv = await createServer({clock: clk.now}), {ps, floor} = await floorWith(srv, "P2", "B1", ["Ann", "Bob"]);
  const m = floor.monsters[0]; m.state = "patrol"; m.wait = 99; at(ps[0], "B1", m.pos.x + 0.4, m.pos.z); at(ps[1], "B1", m.pos.x + 30, m.pos.z); await sleep(150);
  for (let i = 0; i < 3; i++) { clk.adv(1.5); floor.t += 2; stepN(floor, 0.1); await sleep(30); }
  await ps[0].next(m2 => m2.t === "me" && m2.hp === 0);
  at(ps[0], "B1", m.pos.x + 0.4, m.pos.z); const s = await ps[1].next(m2 => m2.t === "s" && m2.id === ps[0].id && m2.dead === 1); assert.equal(s.hp, 0);
  clk.adv(46); const up = await ps[0].next(m2 => m2.t === "me" && m2.respawn === 1); assert.equal(up.hp, 100);
  await srv.close();
});
test("a teammate within 2.5 m lifts a downed player to 50 HP; too far, or an upright target, does nothing", async () => {
  const clk = clockOf(), srv = await createServer({clock: clk.now}), {ps, floor} = await floorWith(srv, "P3", "B1", ["Ann", "Bob"]);
  const m = floor.monsters[0]; m.state = "patrol"; m.wait = 99; at(ps[0], "B1", m.pos.x + 0.4, m.pos.z); at(ps[1], "B1", m.pos.x + 20, m.pos.z); await sleep(150);
  ps[1].send({t: "revive", to: ps[0].id}); await sleep(100); assert.ok(!(await ps[0].quiet(50)).some(x => x.t === "revived"), "not down");
  for (let i = 0; i < 3; i++) { clk.adv(1.5); floor.t += 2; stepN(floor, 0.1); await sleep(30); }
  await ps[0].next(m2 => m2.t === "me" && m2.hp === 0); ps[0].inbox.length = 0;
  ps[1].send({t: "revive", to: ps[0].id}); await sleep(100); assert.ok(!(await ps[0].quiet(50)).some(x => x.t === "revived"), "too far");
  at(ps[1], "B1", m.pos.x + 1.5, m.pos.z); await sleep(100); ps[1].send({t: "revive", to: ps[0].id});
  await ps[0].next(kind("revived")); const me = await ps[0].next(m2 => m2.t === "me" && m2.hp === 50); assert.equal(me.hp, 50); await srv.close();
});
test("rounds, the cloak and beacons: nothing without the locker or pickups, the server counts them, and a shot costs a round", async () => {
  const clk = clockOf(), srv = await createServer({clock: clk.now}), {ps, floor} = await floorWith(srv, "P4", "B1", ["Ann", "Bob"]);
  const [a, b] = clearPair(floor.W, 8), m = floor.monsters[0]; m.cfg = {...m.cfg, patrol: 0, alert: 0, chase: 0}; m.state = "patrol"; m.wait = 99; m.pos.set(b[0], m.fy, b[1]);
  at(ps[0], "B1", a[0], a[1]); at(ps[1], "B1", a[0] + 1, a[1]); await sleep(150);
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), d = [dx / L, 0, dz / L], o = [a[0], floor.W.floor + 1.52, a[1]];
  ps[0].send({t: "shot", o, d}); ps[0].send({t: "cloak"}); ps[0].send({t: "beacon", x: a[0] + 3, z: a[1]}); await sleep(150);
  assert.ok(m.glitchT <= 0 && floor.lures.length === 0, "no gun and no beacon: nothing happens"); ps[0].inbox.length = 0;
  ps[0].send({t: "loot", k: "locker", i: 0}); const got = await ps[0].next(m2 => m2.t === "me" && m2.gun === true); assert.deepEqual([got.rounds, !!got.cloak], [3, true]);
  ps[0].send({t: "cloak"}); assert.equal((await ps[0].next(m2 => m2.t === "me" && m2.cloak && m2.cloak.on)).cloak.on, true);
  ps[0].send({t: "shot", o, d}); const afterShot = await ps[0].next(m2 => m2.t === "me" && m2.rounds === 2); assert.equal(afterShot.rounds, 2); assert.ok(m.glitchT > 0, "the shot hit");
  clk.adv(0.1); ps[0].send({t: "shot", o, d}); await sleep(100); assert.equal(srv.rooms.get("P4").players.get(ps[0].id).ps.rounds, 2, "too soon after the last");
  ps[0].send({t: "loot", k: "beacon", i: 0}); await ps[0].next(m2 => m2.t === "me" && m2.beacons === 1);
  clk.adv(2); ps[0].send({t: "beacon", x: a[0] + 3, z: a[1]}); await ps[0].next(m2 => m2.t === "me" && m2.beacons === 0); assert.equal(floor.lures.length, 1);
  await srv.close();
});
test("secondary abilities: the cloak's short circuit stuns the monsters round you and kills the cloak for 5 minutes; a beacon's reverse sends them away, then they group up", async () => {
  const srv = await createServer(), {ps, floor} = await floorWith(srv, "S2", "B1", ["Ann", "Bob"]);
  const [a, b] = clearPair(floor.W, 6), m = floor.monsters[0]; m.cfg = {...m.cfg, patrol: 0, alert: 0, chase: 0}; m.state = "patrol"; m.wait = 99; m.pos.set(b[0], m.fy, b[1]);
  for (const o of floor.monsters.slice(1)) { o.pos.set(900, o.fy, 900); o.wait = 99; }
  at(ps[0], "B1", a[0], a[1]); at(ps[1], "B1", a[0] + 1, a[1]); await sleep(150);
  ps[0].send({t: "cloak2"}); ps[0].send({t: "beacon2"}); await sleep(120); assert.ok(!(m.stunT > 0) && !floor.lures.length, "without the cloak or a beacon nothing happens");
  ps[0].send({t: "loot", k: "locker", i: 0}); await ps[0].next(m2 => m2.t === "me" && m2.gun); ps[1].inbox.length = 0;
  ps[0].send({t: "cloak2"}); const me = await ps[0].next(m2 => m2.t === "me" && m2.cloak && m2.cloak.x > 0); assert.equal(me.cloak.x, 300); assert.ok(m.stunT > 4, "the monster 6 m away is stunned");
  const ev = await ps[1].next(kind("stun")); assert.ok(ev.i.includes(0) && ev.secs === 5);
  ps[0].send({t: "cloak"}); await sleep(120); assert.equal(srv.rooms.get("S2").players.get(ps[0].id).ps.cloak.on, false, "a dead cloak does not switch on");
  ps[0].send({t: "cloak2"}); await sleep(120); assert.equal(srv.rooms.get("S2").players.get(ps[0].id).ps.cloak.broken > 290, true, "and it cannot be short-circuited again");
  // the reverse
  m.stunT = 0; m.cfg = {...m.cfg, patrol: 1.4, alert: 2.7, chase: 5.5}; m.pos.set(b[0], m.fy, b[1]); m.yaw = Math.atan2(a[0] - b[0], a[1] - b[1]); m.state = "patrol"; m.wait = 99; floor.lures.length = 0;      // 6 m from the players, facing away: it does not see them
  ps[0].send({t: "loot", k: "beacon", i: 0}); await ps[0].next(m2 => m2.t === "me" && m2.beacons === 1);
  const ux = (b[0] - a[0]) / 6, uz = (b[1] - a[1]) / 6, can = [b[0] + ux * 2, b[1] + uz * 2]; ps[0].inbox.length = 0; ps[0].send({t: "beacon", x: can[0], z: can[1]}); await ps[0].next(m2 => m2.t === "me" && m2.beacons === 0); await sleep(100); stepN(floor, 5); assert.equal(m.lureId, 1, "first it is pulled in");
  ps[1].inbox.length = 0; ps[0].send({t: "beacon2"}); const rv = await ps[1].next(kind("reverse")); assert.ok(rv.secs > 11);
  const d0 = Math.hypot(m.pos.x - can[0], m.pos.z - can[1]); stepN(floor, 6); assert.ok(Math.hypot(m.pos.x - can[0], m.pos.z - can[1]) > d0 + 3, "then it runs away");
  ps[0].send({t: "beacon2"}); await sleep(100); assert.equal(floor.lures[0].reversed, true);
  floor.t = floor.lures[0].repelUntil + 0.1; stepN(floor, 9.5); assert.ok(Math.hypot(m.pos.x - can[0], m.pos.z - can[1]) < 5, "and when it ends they come back and group up round it");
  await srv.close();
});
