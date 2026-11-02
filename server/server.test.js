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
