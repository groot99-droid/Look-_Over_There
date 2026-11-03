import test from "node:test";
import assert from "node:assert/strict";
import {WebSocket} from "ws";
import {createServer} from "./server.js";

// a tiny client: queues what it receives so a test can wait for a message of a given kind
function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`), inbox = [], waiters = [];
  ws.on("message", d => { const m = JSON.parse(d); inbox.push(m); waiters.splice(0).forEach(w => w()); });
  const c = {ws, inbox, send: m => ws.send(JSON.stringify(m)),
    open: new Promise(r => ws.on("open", r)),
    async next(pred, ms = 2000) {
      const end = Date.now() + ms;
      for (;;) {
        const i = inbox.findIndex(pred); if (i >= 0) return inbox.splice(i, 1)[0];
        if (Date.now() > end) throw new Error("timed out waiting for a message");
        await new Promise(r => { waiters.push(r); setTimeout(r, 50); });
      }
    },
    quiet: async ms => { await new Promise(r => setTimeout(r, ms)); return inbox.splice(0); }};
  return c;
}
const kind = t => m => m.t === t;
async function join(srv, room, name) { const c = client(srv.port); await c.open; c.send({t: "join", room, name}); const w = await c.next(kind("welcome")); return Object.assign(c, {id: w.id, welcome: w}); }

test("round starts only when everyone is ready, after the countdown", async () => {
  const srv = await createServer({countdownMs: 150});
  const a = await join(srv, "R1", "Ann"), b = await join(srv, "R1", "Bob");
  assert.equal(a.welcome.phase, "lobby");
  a.send({t: "ready", ready: true});
  assert.equal((await a.next(m => m.t === "lobby" && m.players.every(p => p.id !== a.id || p.ready))).countdownMs, null, "no countdown while Bob is not ready");
  b.send({t: "ready", ready: true});
  const l = await a.next(m => m.t === "lobby" && m.countdownMs);
  assert.equal(l.players.length, 2);
  await a.next(kind("start")); await b.next(kind("start"));
  const late = await join(srv, "R1", "Cy");
  assert.equal(late.welcome.phase, "playing", "someone joining mid-round skips the lobby");
  await srv.close();
});

test("un-readying or a newcomer cancels the countdown", async () => {
  const srv = await createServer({countdownMs: 300});
  const a = await join(srv, "R2", "Ann");
  a.send({t: "ready", ready: true}); await a.next(m => m.t === "lobby" && m.countdownMs);
  const b = await join(srv, "R2", "Bob");
  const got = await a.quiet(500);
  assert.ok(!got.some(m => m.t === "start"), "no start after a newcomer joined");
  assert.ok(got.some(m => m.t === "lobby" && m.countdownMs === null));
  await srv.close();
});

test("positions go only to players on the same floor", async () => {
  const srv = await createServer();
  const a = await join(srv, "R3", "Ann"), b = await join(srv, "R3", "Bob"), c = await join(srv, "R3", "Cy");
  const at = {a: {t: "s", scene: "B1", x: 1, y: 0, z: 2, yaw: 0}};
  a.send(at.a); b.send({t: "s", scene: "B1", x: 3, y: 0, z: 4, yaw: 0}); c.send({t: "s", scene: "L1", x: 9, y: 9, z: 9, yaw: 0});
  await b.next(kind("hosts")); await c.next(kind("hosts"));                  // everyone's floor is known now
  const drained = await Promise.all([a, b, c].map(x => x.quiet(100)));
  a.send(at.a);
  await b.next(m => m.t === "s" && m.id === a.id);
  const cGot = [...drained[2], ...await c.quiet(300)];
  assert.ok(!cGot.some(m => m.t === "s"), "Cy on L1 got no positions from B1");
  assert.ok(cGot.some(m => m.t === "p" && m.id === a.id && m.scene === "B1"), "but learned Ann is on B1");
  assert.ok(!JSON.stringify(cGot).includes('"x":1'), "no coordinates leaked");
  await srv.close();
});

test("only a floor's host sends monsters or kills; revive needs the same floor", async () => {
  const srv = await createServer();
  const a = await join(srv, "R4", "Ann"), b = await join(srv, "R4", "Bob"), c = await join(srv, "R4", "Cy");
  a.send({t: "s", scene: "B1"}); b.send({t: "s", scene: "B1"}); c.send({t: "s", scene: "L1"});
  await b.next(kind("hosts"));
  await Promise.all([a, b, c].map(x => x.quiet(100)));
  b.send({t: "m", scene: "B1", l: []}); b.send({t: "caught", to: a.id});     // Bob is not B1's host (Ann joined first)
  a.send({t: "m", scene: "B1", l: [[1, 1, 0, 0, 0]]});
  await b.next(kind("m"));
  assert.ok(!(await a.quiet(150)).some(m => m.t === "m" || m.t === "caught"), "Bob's monsters and kill were ignored");
  b.send({t: "revive", to: a.id}); await a.next(kind("revived"));
  c.send({t: "revive", to: a.id});
  assert.ok(!(await a.quiet(150)).some(m => m.t === "revived"), "Cy is on another floor and cannot revive Ann");
  await srv.close();
});

test("characters: a choice is kept (duplicates allowed), no choice gets one nobody has", async () => {
  const srv = await createServer();
  const a = client(srv.port); await a.open; a.send({t: "join", room: "R5", name: "Ann", char: 3}); const wa = await a.next(kind("welcome"));
  assert.equal(wa.players.find(p => p.id === wa.id).char, 3);
  const b = client(srv.port); await b.open; b.send({t: "join", room: "R5", name: "Bob", char: 3}); const wb = await b.next(kind("welcome"));
  assert.equal(wb.players.find(p => p.id === wb.id).char, 3, "two players may be the same character");
  const c = client(srv.port); await c.open; c.send({t: "join", room: "R5", name: "Cy"}); const wc = await c.next(kind("welcome"));
  assert.equal(wc.players.find(p => p.id === wc.id).char, 0, "the first character nobody has");
  const d = client(srv.port); await d.open; d.send({t: "join", room: "R5", name: "Di", char: 99}); const wd = await d.next(kind("welcome"));
  assert.equal(wd.players.find(p => p.id === wd.id).char, 1, "an invalid choice is treated as none");
  const joined = await a.next(m => m.t === "join" && m.name === "Cy"); assert.equal(joined.char, 0);
  await srv.close();
});

test("a door being shut is relayed as shut, not open", async () => {
  const srv = await createServer();
  const a = await join(srv, "R6", "Ann"), b = await join(srv, "R6", "Bob");
  a.send({t: "s", scene: "L1"}); b.send({t: "s", scene: "L1"}); await b.next(kind("hosts"));
  a.send({t: "door", scene: "L1", name: "D1", open: 0});
  assert.equal((await b.next(kind("door"))).open, 0);
  a.send({t: "door", scene: "L1", name: "D1", open: 1});
  assert.equal((await b.next(kind("door"))).open, 1);
  await srv.close();
});

test("fuses: take and slot are relayed to the floor, a floor change or leaving puts a carried fuse back", async () => {
  const srv = await createServer();
  const a = await join(srv, "R7", "Ann"), b = await join(srv, "R7", "Bob");
  a.send({t: "s", scene: "B1"}); b.send({t: "s", scene: "B1"});
  const first = await a.next(kind("fuses"));                             // entering a gated floor sends its state
  assert.equal(first.scene, "B1"); assert.ok(first.st.every(f => f.s === 0));
  await b.next(kind("fuses"));
  a.send({t: "fuse", a: "take", i: 1});
  const took = await b.next(m => m.t === "fuses" && m.st[1].s === 1);
  assert.equal(took.st[1].by, a.id, "Bob sees Ann carrying fuse 1");
  b.send({t: "fuse", a: "take", i: 1});                                  // already taken
  b.send({t: "fuse", a: "take", i: 0}); const bobs = await a.next(m => m.t === "fuses" && m.st[0].s === 1);
  assert.equal(bobs.st[1].by, a.id, "Ann's fuse is still hers");
  b.send({t: "fuse", a: "drop", x: 3.5, z: -1});
  assert.deepEqual((await a.next(m => m.t === "fuses" && m.st[0].s === 3)).st[0], {s: 3, x: 3.5, z: -1});
  a.send({t: "s", scene: "L3"});                                         // Ann walks off the floor carrying fuse 1
  assert.equal((await b.next(m => m.t === "fuses" && m.st[1].s === 0)).st[1].s, 0, "the fuse went back");
  a.send({t: "fuse", a: "take", i: 2});                                  // L3 is not gated
  assert.ok(!(await b.quiet(150)).some(m => m.t === "fuses" && m.st[2].s === 1));
  await srv.close();
});

test("fuses: state is kept for the room; leaving releases; junk is ignored", async () => {
  const srv = await createServer();
  const a = await join(srv, "R8", "Ann"); a.send({t: "s", scene: "B1"}); await a.next(kind("fuses"));
  a.send({t: "fuse", a: "take", i: 0}); await a.next(m => m.t === "fuses" && m.st[0].s === 1);
  a.send({t: "fuse", a: "slot"}); await a.next(m => m.t === "fuses" && m.st[0].s === 2);
  a.send({t: "fuse", a: "take", i: "x"}); a.send({t: "fuse", a: "evil", i: 1}); a.send({t: "fuse", a: "drop", x: NaN, z: 0});
  assert.ok(!(await a.quiet(150)).some(m => m.t === "fuses"), "junk changed nothing");
  const b = await join(srv, "R8", "Bob"); b.send({t: "s", scene: "B1"});
  assert.equal((await b.next(kind("fuses"))).st[0].s, 2, "a later joiner sees the slotted fuse");
  b.send({t: "fuse", a: "take", i: 1}); await a.next(m => m.t === "fuses" && m.st[1].s === 1);
  b.ws.close(); const back = await a.next(m => m.t === "fuses" && m.st[1].s === 0);
  assert.equal(back.st[1].s, 0, "Bob left holding a fuse, it went back");
  await srv.close();
});

test("switches: flipped one at a time on L1, kept for the room, refused elsewhere", async () => {
  const srv = await createServer();
  const a = await join(srv, "R9", "Ann"), b = await join(srv, "R9", "Bob");
  a.send({t: "s", scene: "L1"}); b.send({t: "s", scene: "B1"});
  const first = await a.next(kind("switches")); assert.deepEqual(first.st, [{on: false}, {on: false}]);
  a.send({t: "switch", i: 1}); const one = await a.next(m => m.t === "switches" && m.st[1].on);
  assert.equal(one.st[0].on, false, "only the one flipped is on");
  a.send({t: "switch", i: 1}); a.send({t: "switch", i: 7}); a.send({t: "switch", i: "x"});
  assert.ok(!(await a.quiet(150)).some(m => m.t === "switches"), "flipping it again, or a switch that does not exist, changes nothing");
  b.send({t: "switch", i: 0});                                           // Bob is on B1, which has no switches
  assert.ok(!(await a.quiet(150)).some(m => m.t === "switches"));
  b.send({t: "s", scene: "L1"}); assert.equal((await b.next(kind("switches"))).st[1].on, true, "Bob arrives and sees Ann's flip");
  b.send({t: "switch", i: 0}); const done = await a.next(m => m.t === "switches" && m.st[0].on);
  assert.ok(done.st.every(s => s.on), "both on: done");
  await srv.close();
});

// a rng that makes the code 1 2 3 4
const code1234 = (() => { let k = 0; return () => ((k++ % 4) + 1 + 0.5) / 10; })();
test("keypad: digits are shown to the team as they are found, and the code never leaves the server", async () => {
  const srv = await createServer({rng: code1234});
  const a = await join(srv, "R10", "Ann"), b = await join(srv, "R10", "Bob");
  a.send({t: "s", scene: "L2"}); b.send({t: "s", scene: "L2"});
  const first = await a.next(kind("keypad")); assert.deepEqual(first.found, [null, null, null, null]); assert.equal(first.solved, false);
  await b.next(kind("keypad"));                                                       // Bob's own arrival state
  a.send({t: "keypad", a: "find", i: 2});
  const seen = await b.next(m => m.t === "keypad" && m.found[2] !== null);
  assert.deepEqual(seen.found, [null, null, 3, null], "Bob sees the digit Ann read");
  a.send({t: "keypad", a: "find", i: 2}); a.send({t: "keypad", a: "find", i: 9});
  assert.ok(!(await b.quiet(150)).some(m => m.t === "keypad"), "reading it again, or a note that does not exist, changes nothing");
  const everything = JSON.stringify([...a.inbox, ...b.inbox, seen, first]);
  assert.ok(!everything.includes('"code"'), "no message carries the code");
  const late = await join(srv, "R10", "Cy"); late.send({t: "s", scene: "L2"});
  assert.deepEqual((await late.next(kind("keypad"))).found, [null, null, 3, null], "a late joiner sees what was found");
  await srv.close();
});
test("keypad: a wrong code locks it for everyone; the right one opens the door", async () => {
  const srv = await createServer({rng: code1234});
  const a = await join(srv, "R11", "Ann"), b = await join(srv, "R11", "Bob");
  a.send({t: "s", scene: "L2"}); b.send({t: "s", scene: "L2"}); await a.next(kind("keypad")); await b.next(kind("keypad"));
  a.send({t: "keypad", a: "try", code: "9999"});
  const bad = await b.next(m => m.t === "keypad" && m.fails === 1);
  assert.ok(bad.lockMs > 7000 && bad.lockMs <= 8000, "the lock runs for about 8 s");
  b.send({t: "keypad", a: "try", code: "1234"});                                  // right code, but it is locked
  const told = await b.next(kind("keypad")); assert.equal(told.solved, false); assert.ok(told.lockMs > 0, "Bob is told how long it has left");
  assert.ok(!(await a.quiet(150)).some(m => m.t === "keypad" && m.solved), "and it did not open for anyone");
  b.send({t: "keypad", a: "try", code: "12"}); b.send({t: "keypad", a: "try", code: "abcd"});
  assert.ok(!(await a.quiet(150)).some(m => m.t === "keypad" && m.fails > 1), "malformed input is not a fail");
  await srv.close();
});
test("keypad: only on a keypad floor, and the right code solves it", async () => {
  const srv = await createServer({rng: code1234});
  const a = await join(srv, "R12", "Ann"); a.send({t: "s", scene: "B1"}); await a.next(kind("fuses"));
  a.send({t: "keypad", a: "find", i: 0}); a.send({t: "keypad", a: "try", code: "1234"});
  assert.ok(!(await a.quiet(150)).some(m => m.t === "keypad"), "B1 has no keypad");
  a.send({t: "s", scene: "L2"}); await a.next(kind("keypad"));
  a.send({t: "keypad", a: "try", code: "1234"});
  const done = await a.next(m => m.t === "keypad" && m.solved); assert.equal(done.fails, 0);
  a.send({t: "keypad", a: "find", i: 1});
  assert.ok(!(await a.quiet(150)).some(m => m.t === "keypad"), "an open door takes no more notes");
  await srv.close();
});

test("power: thrown once from L3 or L4 and told to the whole room, including late joiners", async () => {
  const srv = await createServer();
  const a = await join(srv, "R13", "Ann"), b = await join(srv, "R13", "Bob");
  assert.equal(a.welcome.power, false);
  a.send({t: "s", scene: "L2"}); b.send({t: "s", scene: "B1"});
  a.send({t: "power"}); b.send({t: "power"});                                      // neither is on a power floor
  assert.ok(!(await a.quiet(150)).some(m => m.t === "power"), "L2 and B1 have no power switch");
  a.send({t: "s", scene: "L3"}); await a.quiet(60);
  a.send({t: "power"});
  const heard = await b.next(kind("power"));                                       // Bob is on B1 and still hears of it
  assert.deepEqual([heard.on, heard.by], [true, "L3"]);
  await a.next(kind("power"));
  a.send({t: "s", scene: "L4"}); a.send({t: "power"});
  assert.ok(!(await b.quiet(150)).some(m => m.t === "power"), "thrown once: a second throw is not announced");
  const late = await join(srv, "R13", "Cy"); assert.equal(late.welcome.power, true, "a late joiner is told it is on");
  await srv.close();
});
test("power: a room that nobody powers stays off, and rooms are separate", async () => {
  const srv = await createServer();
  const a = await join(srv, "R14", "Ann"), b = await join(srv, "R15", "Bob");
  a.send({t: "s", scene: "L4"}); a.send({t: "power"}); await a.next(kind("power"));
  assert.equal((await join(srv, "R15", "Di")).welcome.power, false, "R15 is still off");
  assert.ok(!(await b.quiet(150)).some(m => m.t === "power"));
  await srv.close();
});

// a started round with these players in it
async function round(srv, room, names) {
  const cs = []; for (const n of names) cs.push(await join(srv, room, n));
  for (const c of cs) c.send({t: "ready", ready: true});
  for (const c of cs) await c.next(kind("start"));
  return cs;
}
test("finale: the alarm goes off once, when the doors are open and someone is in the store", async () => {
  const srv = await createServer({countdownMs: 100});
  const [a, b] = await round(srv, "R16", ["Ann", "Bob"]);
  a.send({t: "s", scene: "L3"}); b.send({t: "s", scene: "L2"});
  a.send({t: "power"}); await b.next(kind("power"));
  assert.ok(!(await b.quiet(150)).some(m => m.t === "alarm"), "power on but nobody on L4 yet: quiet");
  a.send({t: "s", scene: "L4"});
  const al = await b.next(kind("alarm")); assert.equal(al.ms, 60000);
  b.send({t: "s", scene: "L4"});
  assert.ok(!(await a.quiet(150)).filter(m => m.t === "alarm").slice(1).length, "once only");
  const late = await join(srv, "R16", "Cy"); assert.ok(late.welcome.alarmMs > 0 && late.welcome.alarmMs <= 60000);
  await srv.close();
});
test("finale: exits only from L4 with the power on; places in order; results when the last one is out", async () => {
  const srv = await createServer({countdownMs: 100});
  const [a, b] = await round(srv, "R17", ["Ann", "Bob"]);
  a.send({t: "s", scene: "L4"}); b.send({t: "s", scene: "L4"});
  a.send({t: "exit"});                                                             // the doors are shut: nobody is out
  assert.ok(!(await b.quiet(150)).some(m => m.t === "exited"));
  a.send({t: "power"}); await b.next(kind("power"));
  b.send({t: "s", scene: "L3"}); b.send({t: "exit"});                              // wrong floor
  assert.ok(!(await a.quiet(150)).some(m => m.t === "exited"));
  b.send({t: "s", scene: "L4"}); await a.quiet(60);
  a.send({t: "exit"}); const e1 = await b.next(kind("exited")); assert.deepEqual([e1.id, e1.place, e1.name], [a.id, 1, "Ann"]);
  a.send({t: "exit"}); assert.ok(!(await b.quiet(120)).some(m => m.t === "exited"), "leaving twice changes nothing");
  assert.ok(!(await a.quiet(10)).some(m => m.t === "results"), "Bob is still inside");
  b.send({t: "exit"});
  const r = await a.next(kind("results")); assert.deepEqual(r.rows.map(x => [x.place, x.name]), [[1, "Ann"], [2, "Bob"]]);
  await b.next(kind("results"));
  const late = await join(srv, "R17", "Cy"); assert.equal(late.welcome.results.length, 2, "a late joiner sees the finished round");
  await srv.close();
});
test("finale: someone who leaves the room does not hold the round up", async () => {
  const srv = await createServer({countdownMs: 100});
  const [a, b] = await round(srv, "R18", ["Ann", "Bob"]);
  a.send({t: "s", scene: "L4"}); b.send({t: "s", scene: "L4"}); a.send({t: "power"}); await a.next(kind("power"));
  a.send({t: "exit"}); await a.next(kind("exited"));
  b.ws.close();
  const r = await a.next(kind("results")); assert.deepEqual(r.rows.map(x => x.name), ["Ann"]);
  await srv.close();
});

test("loot: the floor's state arrives with you; a pack is taken once and told to the floor only", async () => {
  const srv = await createServer();
  const a = await join(srv, "R20", "Ann"), b = await join(srv, "R20", "Bob"), c = await join(srv, "R20", "Cy");
  a.send({t: "s", scene: "L2"}); b.send({t: "s", scene: "L2"}); c.send({t: "s", scene: "L1"});
  const first = await a.next(kind("loot")); assert.equal(first.scene, "L2"); assert.deepEqual(first.st, {lockers: [], packs: [0, 0, 0]});
  a.send({t: "loot", k: "pack", i: 1, rounds: 3});
  const got = await b.next(m => m.t === "loot" && m.by === a.id); assert.deepEqual([got.st.packs[1], got.by, got.k], [a.id, a.id, "pack"]);
  b.send({t: "loot", k: "pack", i: 1, rounds: 0});
  assert.ok(!(await a.quiet(200)).some(m => m.t === "loot" && m.by === b.id), "a pack that is gone cannot be taken again");
  assert.ok(!(await c.quiet(10)).some(m => m.t === "loot" && m.st.packs && m.st.packs[1] !== 0 && m.scene === "L2"), "Cy is on another floor");
  const late = await join(srv, "R20", "Di"); late.send({t: "s", scene: "L2"});
  assert.equal((await late.next(kind("loot"))).st.packs[1], a.id, "a late joiner sees what is taken");
  await srv.close();
});
test("loot: a pack is refused when the player is full, and nothing happens off the loot floors", async () => {
  const srv = await createServer();
  const a = await join(srv, "R21", "Ann"); a.send({t: "s", scene: "L3"}); await a.next(kind("loot"));
  a.send({t: "loot", k: "pack", i: 0, rounds: 9}); a.send({t: "loot", k: "weird", i: 0}); a.send({t: "loot", k: "pack", i: 99, rounds: 0});
  assert.ok(!(await a.quiet(200)).some(m => m.t === "loot"), "full, bad kind and bad index all do nothing");
  a.send({t: "loot", k: "pack", i: 0, rounds: 8}); assert.equal((await a.next(kind("loot"))).st.packs[0], a.id);
  a.send({t: "s", scene: null}); a.send({t: "loot", k: "pack", i: 1, rounds: 0});
  assert.ok(!(await a.quiet(150)).some(m => m.t === "loot"), "not on a floor");
  await srv.close();
});
test("loot: one gun each from the B1 lockers, and leaving puts the locker back", async () => {
  const srv = await createServer();
  const a = await join(srv, "R22", "Ann"), b = await join(srv, "R22", "Bob");
  a.send({t: "s", scene: "B1"}); b.send({t: "s", scene: "B1"}); await a.next(kind("loot")); await b.next(kind("loot"));
  a.send({t: "loot", k: "locker", i: 0}); const l1 = await b.next(kind("loot")); assert.deepEqual([l1.st.lockers[0], l1.k], [a.id, "locker"]);
  a.send({t: "loot", k: "locker", i: 1}); assert.ok(!(await b.quiet(200)).some(m => m.t === "loot"), "Ann already has a gun");
  b.send({t: "loot", k: "locker", i: 0}); assert.ok(!(await a.quiet(200)).some(m => m.t === "loot" && m.by === b.id), "that locker is open already");
  b.send({t: "loot", k: "locker", i: 5}); assert.equal((await a.next(kind("loot"))).st.lockers[5], b.id);
  a.ws.close();                                                                      // Ann leaves with her gun: her locker is usable again
  const back = await b.next(m => m.t === "loot" && m.st.lockers[0] === 0); assert.equal(back.scene, "B1");
  assert.equal(back.st.lockers[5], b.id, "Bob keeps his");
  const c = await join(srv, "R22", "Cy"); c.send({t: "s", scene: "B1"}); await c.next(kind("loot"));
  c.send({t: "loot", k: "locker", i: 0}); assert.ok(await b.next(m => m.t === "loot" && m.st.lockers[0] === c.id), "a newcomer can use it");
  await srv.close();
});
