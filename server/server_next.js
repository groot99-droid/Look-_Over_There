// Look Over There: one process that serves the game files and relays a room's players.
//   node server.js [port]        (default 8080; also PORT=...)
// Clients say where they are; the server runs each occupied floor's monsters (server/floorsim.js, the shared rules in shared/monsters.js), decides what they hit and what a
// shot does, and tells the floor where the monsters are. A floor exists while someone is on it.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {WebSocketServer} from "ws";
import {GATED, newFloor, act as fuseAct} from "../shared/fuses.js";
import {SWITCH_FLOORS, newSwitches, flip as flipSwitch} from "../shared/switches.js";
import {POWER_SOURCES, newPower, throwPower} from "../shared/power.js";
import {ALARM_MS, newRun, exitPlayer, done as runDone, finish, results as runResults} from "../shared/finish.js";
import {LOOT_FLOORS, MAX_ROUNDS, MAX_BEACONS, newLoot, takeLocker, takePack, takeBeacon, putBack} from "../shared/loot.js";
import {KEYPAD_FLOORS, newKeypad, view as keypadView, find as keypadFind, tryCode} from "../shared/keypad.js";
import {FLOORS} from "../shared/world.js";
import {Floor, TICK_S} from "./floorsim.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVE = new Set(["index.html", "world", "monsters", "characters", "shared", "models", "audio"]);            // nothing else in the repo is public
const TYPES = {".html": "text/html; charset=utf-8", ".json": "application/json", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".js": "text/javascript", ".ogg": "audio/ogg"};
const NUM_CHARS = 5, MAX_PLAYERS = 8, COLORS = ["#e0a040", "#4fc3f7", "#9ccc65", "#f06292", "#ba68c8", "#ffd54f", "#4db6ac", "#ff8a65"];

export function createServer({port = 0, root = ROOT, countdownMs = 10000, rng = Math.random, simHz = Number(process.env.SIM_HZ) || 20} = {}) {
  const docs = new Map(), readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  const worldDoc = scene => { if (!docs.has(scene)) docs.set(scene, readJson(`world/${scene}.json`)); return docs.get(scene); };
  let monCfgCache = null; const monCfg = () => monCfgCache ||= readJson("world/monsters.json");
  const rooms = new Map();                                             // code -> {players, hosts: {scene: id}, seq, phase: "lobby" | "playing", timer}
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/health") { res.writeHead(200, {"content-type": "application/json"}); return res.end(JSON.stringify({ok: true, rooms: rooms.size})); }
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) || !SERVE.has(rel.split("/")[0])) { res.writeHead(404); return res.end("not found"); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, {"content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": file.endsWith(".ogg") ? "public, max-age=86400" : "no-cache"});
      res.end(buf);
    });
  });
  const wss = new WebSocketServer({server: httpServer, path: "/ws", maxPayload: 64 * 1024});

  const send = (p, msg) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
  const broadcast = (room, msg, except, scene) => {
    for (const p of room.players.values()) if (p.id !== except && (scene === undefined || p.scene === scene)) send(p, msg);
  };
  // floors: one per scene that has players in this room; created when the first player arrives, dropped when the last leaves
  function ensureFloor(room, scene) {
    if (!scene || FLOORS[scene] === undefined || room.floors[scene]) return room.floors[scene] || null;
    try {
      return room.floors[scene] = new Floor({scene, room, doc: worldDoc(scene), monCfg: monCfg(), rnd: rng,
        io: {toFloor: (msg, except) => broadcast(room, msg, except, scene)},
        onHit: (id, dmg) => { const p = room.players.get(id); if (p) send(p, {t: "hit", dmg}); }});
    } catch (e) { console.error("floor", scene, e.message); return null; }
  }
  function pruneFloors(room) { for (const scene of Object.keys(room.floors)) if (!room.floors[scene].players().length) delete room.floors[scene]; }
  const ticker = setInterval(() => { for (const room of rooms.values()) for (const f of Object.values(room.floors)) f.step(1 / simHz); }, 1000 / simHz);
  // fuses: one state array per gated floor, kept for the life of the room. Rules are in shared/fuses.js; this only relays them to the floor's players.
  const floorFuses = (room, scene) => room.fuses[scene] ||= newFloor();
  const sendFuses = (room, scene) => broadcast(room, {t: "fuses", scene, st: floorFuses(room, scene)}, undefined, scene);
  function releaseFuse(room, id, scene) {                              // a carrier who leaves a floor or the room puts the fuse back
    if (!GATED.includes(scene)) return;
    const next = fuseAct(floorFuses(room, scene), id, {a: "release"});
    if (next) { room.fuses[scene] = next; sendFuses(room, scene); }
  }
  // switches: the same idea for the floors that have them (state per floor, kept for the life of the room)
  const floorSwitches = (room, scene) => room.switches[scene] ||= newSwitches();
  const sendSwitches = (room, scene) => broadcast(room, {t: "switches", scene, st: floorSwitches(room, scene)}, undefined, scene);
  // keypads: the code is made here and never leaves; players only get the digits that have been found
  const floorKeypad = (room, scene) => room.keypads[scene] ||= newKeypad(rng);
  const keypadMsg = (room, scene) => ({t: "keypad", scene, ...keypadView(floorKeypad(room, scene), Date.now())});
  const sendKeypad = (room, scene) => broadcast(room, keypadMsg(room, scene), undefined, scene);
  // guns and ammo: one state per floor, kept for the life of the room; a player may carry one gun, and leaving puts their locker back
  const floorLoot = (room, scene) => room.loot[scene] ||= newLoot(scene);
  const sendLoot = (room, scene, extra = {}) => broadcast(room, {t: "loot", scene, st: floorLoot(room, scene), ...extra}, undefined, scene);
  function putBackLocker(room, id) {
    const held = room.armed.get(id); room.armed.delete(id); if (!held) return;
    const next = putBack(floorLoot(room, held), id); if (next) { room.loot[held] = next; sendLoot(room, held); }
  }
  // the finale: the alarm goes off once the doors are open and someone is in the store; everyone leaving through them ends the round
  const alarmMs = room => room.alarmAt ? Math.max(0, ALARM_MS - (Date.now() - room.alarmAt)) : 0;
  function maybeAlarm(room) {
    if (room.alarmAt || !room.power.on || ![...room.players.values()].some(p => p.scene === "L4")) return;
    room.alarmAt = Date.now(); broadcast(room, {t: "alarm", ms: ALARM_MS});
  }
  const resultsMsg = room => ({t: "results", rows: runResults(room.run)});
  function checkDone(room) {
    if (!runDone(room.run, [...room.players.keys()])) return;
    room.run = finish(room.run); broadcast(room, resultsMsg(room));
  }
  // the waiting room: everyone readies, then a countdown, then the round starts for the whole room (a round runs until the room empties)
  const lobbyMsg = room => ({t: "lobby", phase: room.phase, countdownMs: room.timer ? countdownMs : null,
    players: [...room.players.values()].map(p => ({id: p.id, name: p.name, color: p.color, char: p.char, ready: p.ready}))});
  function lobbyChanged(room) {
    if (room.phase !== "lobby") return;
    clearTimeout(room.timer); room.timer = null;
    const all = [...room.players.values()];
    if (all.length && all.every(p => p.ready)) {
      room.timer = setTimeout(() => { room.timer = null; room.phase = "playing"; room.run = newRun(Date.now()); broadcast(room, {t: "start"}); }, countdownMs);
    }
    broadcast(room, lobbyMsg(room));
  }
  wss.on("connection", ws => {
    let room = null, me = null;
    ws.on("message", raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m.t !== "string") return;
      if (!me) {
        if (m.t !== "join") return;
        const code = String(m.room || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "MAIN";
        room = rooms.get(code) || {code, players: new Map(), floors: {}, seq: 0, phase: "lobby", timer: null, fuses: {}, switches: {}, keypads: {}, power: newPower(), run: null, alarmAt: 0, loot: {}, armed: new Map()}; rooms.set(code, room);
        if (room.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({t: "full"})); return ws.close(); }
        const used = new Set([...room.players.values()].map(p => p.color));
        const taken = new Set([...room.players.values()].map(p => p.char));                    // a character you ask for is yours even if someone has it; with no choice you get one nobody has
        const char = Number.isInteger(m.char) && m.char >= 0 && m.char < NUM_CHARS ? m.char : ([...Array(NUM_CHARS).keys()].find(c => !taken.has(c)) ?? (room.seq % NUM_CHARS));
        me = {id: ++room.seq, seq: room.seq, ws, scene: null, ready: false, char, name: String(m.name || "Player").replace(/[^\w .-]/g, "").slice(0, 16) || "Player",
              color: COLORS.find(c => !used.has(c)) || COLORS[0]};
        room.players.set(me.id, me);
        send(me, {t: "welcome", now: Date.now(), id: me.id, room: code, phase: room.phase, power: room.power.on, alarmMs: alarmMs(room), exited: room.run ? room.run.exits : [], results: room.run?.ended ? runResults(room.run) : null, players: [...room.players.values()].map(p => ({id: p.id, name: p.name, color: p.color, char: p.char}))});
        broadcast(room, {t: "join", id: me.id, name: me.name, color: me.color, char: me.char}, me.id);
        lobbyChanged(room);
        return;
      }
      switch (m.t) {
        case "ready":
          me.ready = !!m.ready; lobbyChanged(room);
          break;
        case "s": {                                                   // a player's state goes only to those on the same floor; everyone else just learns which floor you are on
          const scene = typeof m.scene === "string" ? m.scene.slice(0, 8) : null;
          const was = me.scene; me.scene = scene;
          const f = k => Number.isFinite(m[k]) ? m[k] : 0; me.st = {x: f("x"), y: f("y"), z: f("z"), yaw: f("yaw"), crouch: !!m.crouch, moving: !!m.moving, run: !!m.run, carry: !!m.carry, cloak: !!m.cloak, dead: !!m.dead, imm: !!m.imm};
          broadcast(room, {...m, id: me.id}, me.id, scene);
          if (was !== scene) {
            ensureFloor(room, scene); pruneFloors(room);
            broadcast(room, {t: "p", id: me.id, scene}, me.id);
            if (was) releaseFuse(room, me.id, was);
            if (GATED.includes(scene)) send(me, {t: "fuses", scene, st: floorFuses(room, scene)});
            if (SWITCH_FLOORS.includes(scene)) send(me, {t: "switches", scene, st: floorSwitches(room, scene)});
            if (KEYPAD_FLOORS.includes(scene)) send(me, keypadMsg(room, scene));
            if (LOOT_FLOORS.includes(scene)) send(me, {t: "loot", scene, st: floorLoot(room, scene)});
            maybeAlarm(room);
          }
          break;
        }
        case "keypad": {                                              // read a note ("find") or type the code ("try") on the floor you are on
          const scene = me.scene;
          if (!KEYPAD_FLOORS.includes(scene)) break;
          if (m.a === "find") { const next = keypadFind(floorKeypad(room, scene), m.i); if (next) { room.keypads[scene] = next; sendKeypad(room, scene); } }
          else if (m.a === "try") {
            const before = floorKeypad(room, scene).fails, r = tryCode(floorKeypad(room, scene), m.code, Date.now());
            if (r.st) { room.keypads[scene] = r.st; sendKeypad(room, scene); if (r.st.fails > before && me.st) room.floors[scene]?.alertNear(me.st.x, me.st.z); }          // a wrong code is loud
            else if (r.locked) send(me, keypadMsg(room, scene));       // tell them how long the lock has left
          }
          break;
        }
        case "power": {                                               // throw the building's power from the L3 box or the L4 far switch; everyone in the room hears of it
          const next = throwPower(room.power, me.scene);
          if (next) {
            room.power = next; broadcast(room, {t: "power", on: true, by: next.by}); maybeAlarm(room);
            room.floors.L4?.powerOn();                                // the store's glass doors open: a way through for monsters too
            if (next.by === "L4" && me.scene === "L4" && me.st) room.floors.L4?.alertNear(me.st.x, me.st.z);          // the far switch is loud
          }
          break;
        }
        case "shot": {                                                // a ray-gun shot: the floor's host (who runs the monsters) decides the hit; everyone else just sees the beam
          const scene = me.scene; if (!scene) break;
          const nums = (v, n) => Array.isArray(v) && v.length === n && v.every(x => typeof x === "number" && Number.isFinite(x)) ? v : null;
          const o = nums(m.o, 3), d = nums(m.d, 3); if (!o || !d) break;
          const e = nums(m.e, 3) || [o[0] + d[0] * 25, o[1] + d[1] * 25, o[2] + d[2] * 25];
          room.floors[scene]?.shot(me, o, d);                           // the server decides what the shot does (a monster is banished: a zap goes to the floor)
          broadcast(room, {t: "beam", id: me.id, o, e}, me.id, scene);
          break;
        }
        case "beacon": {                                              // a thrown AFK Beacon: everyone else on the floor learns where it lies (the host's monsters then swarm it)
          const scene = me.scene, x = Number(m.x), z = Number(m.z); if (!scene || !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 500 || Math.abs(z) > 500) break;
          room.floors[scene]?.beacon(me, x, z);                         // the monsters swarm it; the floor's players see where it lies
          break;
        }
        case "loot": {                                                // open a locker (a gun) or take an ammo pack on the floor you are on
          const scene = me.scene; if (!LOOT_FLOORS.includes(scene) || (m.k !== "locker" && m.k !== "pack" && m.k !== "beacon")) break;
          const st = floorLoot(room, scene);
          if (m.k === "locker") {
            const next = takeLocker(st, m.i, me.id, room.armed.has(me.id));
            if (next) { room.loot[scene] = next; room.armed.set(me.id, scene); sendLoot(room, scene, {by: me.id, k: "locker"}); }
          } else if (m.k === "beacon") {
            const next = takeBeacon(st, m.i, me.id, Number.isInteger(m.have) ? Math.min(Math.max(m.have, 0), MAX_BEACONS) : MAX_BEACONS);
            if (next) { room.loot[scene] = next; sendLoot(room, scene, {by: me.id, k: "beacon"}); }
          } else {
            const next = takePack(st, m.i, me.id, Number.isInteger(m.rounds) ? Math.min(Math.max(m.rounds, 0), MAX_ROUNDS) : MAX_ROUNDS);
            if (next) { room.loot[scene] = next; sendLoot(room, scene, {by: me.id, k: "pack"}); }
          }
          break;
        }
        case "exit": {                                                // walked out of the store onto the parking lot
          if (me.scene !== "L4" || !room.power.on || !room.run) break;
          const r = exitPlayer(room.run, me.id, Date.now(), me.name);
          if (r) { room.run = r.run; broadcast(room, {t: "exited", ...r.entry}); checkDone(room); }
          break;
        }
        case "switch": {                                              // flip one switch on the floor you are on
          const scene = me.scene;
          if (!SWITCH_FLOORS.includes(scene)) break;
          const next = flipSwitch(floorSwitches(room, scene), m.i);
          if (next) { room.switches[scene] = next; sendSwitches(room, scene); if (me.st) room.floors[scene]?.alertNear(me.st.x, me.st.z); }          // a flipped switch is loud
          break;
        }
        case "fuse": {                                                // take / slot / drop a fuse on the floor you are on
          const scene = me.scene;
          if (!GATED.includes(scene) || !["take", "slot", "drop"].includes(m.a)) break;
          const next = fuseAct(floorFuses(room, scene), me.id, {a: m.a, i: m.i, x: m.x, z: m.z});
          if (next) { room.fuses[scene] = next; sendFuses(room, scene); }
          break;
        }
        case "door": {                                                // open or shut a door near you (the floor checks)
          const scene = me.scene; if (typeof m.name !== "string") break;
          room.floors[scene]?.playerDoor(me, m.name.slice(0, 64), m.open);
          break;
        }
        case "revive": {                                              // a teammate standing on the same floor lifts you
          const to = room.players.get(m.to);
          if (to && to.scene && to.scene === me.scene) send(to, {t: "revived", by: me.id});
          break;
        }
      }
    });
    ws.on("close", () => {
      if (!room || !me) return;
      releaseFuse(room, me.id, me.scene);
      putBackLocker(room, me.id);
      room.players.delete(me.id); pruneFloors(room);
      broadcast(room, {t: "leave", id: me.id});
      if (!room.players.size) { clearTimeout(room.timer); rooms.delete(room.code); } else { lobbyChanged(room); checkDone(room); }
    });
  });
  return new Promise(resolve => httpServer.listen(port, () => resolve({httpServer, wss, port: httpServer.address().port, rooms,
    close: () => new Promise(r => { clearInterval(ticker); for (const c of wss.clients) c.terminate(); wss.close(); httpServer.close(r); })})));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || process.env.PORT || 8080);
  const s = await createServer({port});
  console.log(`Look Over There: http://localhost:${s.port}/   (rooms: ?room=CODE)`);
}
