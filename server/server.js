// Look Over There: one process that serves the game files and relays a room's players.
//   node server.js [port]        (default 8080; also PORT=...)
// The server never simulates anything. Clients send where they are; for each scene one client (the "host",
// chosen here) also simulates that scene's monsters and sends their state, which the server relays to the
// others in that scene. The server only decides who the host is.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {WebSocketServer} from "ws";
import {GATED, newFloor, act as fuseAct} from "../shared/fuses.js";
import {SWITCH_FLOORS, newSwitches, flip as flipSwitch} from "../shared/switches.js";
import {KEYPAD_FLOORS, newKeypad, view as keypadView, find as keypadFind, tryCode} from "../shared/keypad.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVE = new Set(["index.html", "world", "monsters", "characters", "shared", "models"]);            // nothing else in the repo is public
const TYPES = {".html": "text/html; charset=utf-8", ".json": "application/json", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".js": "text/javascript"};
const NUM_CHARS = 5, MAX_PLAYERS = 8, COLORS = ["#e0a040", "#4fc3f7", "#9ccc65", "#f06292", "#ba68c8", "#ffd54f", "#4db6ac", "#ff8a65"];

export function createServer({port = 0, root = ROOT, countdownMs = 10000, rng = Math.random} = {}) {
  const rooms = new Map();                                             // code -> {players, hosts: {scene: id}, seq, phase: "lobby" | "playing", timer}
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/health") { res.writeHead(200, {"content-type": "application/json"}); return res.end(JSON.stringify({ok: true, rooms: rooms.size})); }
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep) || !SERVE.has(rel.split("/")[0])) { res.writeHead(404); return res.end("not found"); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, {"content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache"});
      res.end(buf);
    });
  });
  const wss = new WebSocketServer({server: httpServer, path: "/ws", maxPayload: 64 * 1024});

  const send = (p, msg) => { if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
  const broadcast = (room, msg, except, scene) => {
    for (const p of room.players.values()) if (p.id !== except && (scene === undefined || p.scene === scene)) send(p, msg);
  };
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
  // the waiting room: everyone readies, then a countdown, then the round starts for the whole room (a round runs until the room empties)
  const lobbyMsg = room => ({t: "lobby", phase: room.phase, countdownMs: room.timer ? countdownMs : null,
    players: [...room.players.values()].map(p => ({id: p.id, name: p.name, color: p.color, char: p.char, ready: p.ready}))});
  function lobbyChanged(room) {
    if (room.phase !== "lobby") return;
    clearTimeout(room.timer); room.timer = null;
    const all = [...room.players.values()];
    if (all.length && all.every(p => p.ready)) {
      room.timer = setTimeout(() => { room.timer = null; room.phase = "playing"; broadcast(room, {t: "start"}); }, countdownMs);
    }
    broadcast(room, lobbyMsg(room));
  }
  // sticky: a scene keeps its host while that player stays in it; otherwise the longest-joined player there takes over
  function elect(room) {
    const next = {};
    for (const p of room.players.values()) if (p.scene) {
      const cur = room.players.get(room.hosts[p.scene]);
      if (cur && cur.scene === p.scene) next[p.scene] = cur.id;
      else if (!next[p.scene] || room.players.get(next[p.scene]).seq > p.seq) next[p.scene] = p.id;
    }
    const changed = JSON.stringify(next) !== JSON.stringify(room.hosts);
    room.hosts = next;
    if (changed) broadcast(room, {t: "hosts", hosts: next});
  }

  wss.on("connection", ws => {
    let room = null, me = null;
    ws.on("message", raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m.t !== "string") return;
      if (!me) {
        if (m.t !== "join") return;
        const code = String(m.room || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "MAIN";
        room = rooms.get(code) || {code, players: new Map(), hosts: {}, seq: 0, phase: "lobby", timer: null, fuses: {}, switches: {}, keypads: {}}; rooms.set(code, room);
        if (room.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({t: "full"})); return ws.close(); }
        const used = new Set([...room.players.values()].map(p => p.color));
        const taken = new Set([...room.players.values()].map(p => p.char));                    // a character you ask for is yours even if someone has it; with no choice you get one nobody has
        const char = Number.isInteger(m.char) && m.char >= 0 && m.char < NUM_CHARS ? m.char : ([...Array(NUM_CHARS).keys()].find(c => !taken.has(c)) ?? (room.seq % NUM_CHARS));
        me = {id: ++room.seq, seq: room.seq, ws, scene: null, ready: false, char, name: String(m.name || "Player").replace(/[^\w .-]/g, "").slice(0, 16) || "Player",
              color: COLORS.find(c => !used.has(c)) || COLORS[0]};
        room.players.set(me.id, me);
        send(me, {t: "welcome", id: me.id, room: code, phase: room.phase, hosts: room.hosts, players: [...room.players.values()].map(p => ({id: p.id, name: p.name, color: p.color, char: p.char}))});
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
          broadcast(room, {...m, id: me.id}, me.id, scene);
          if (was !== scene) {
            broadcast(room, {t: "p", id: me.id, scene}, me.id); elect(room);
            if (was) releaseFuse(room, me.id, was);
            if (GATED.includes(scene)) send(me, {t: "fuses", scene, st: floorFuses(room, scene)});
            if (SWITCH_FLOORS.includes(scene)) send(me, {t: "switches", scene, st: floorSwitches(room, scene)});
            if (KEYPAD_FLOORS.includes(scene)) send(me, keypadMsg(room, scene));
          }
          break;
        }
        case "keypad": {                                              // read a note ("find") or type the code ("try") on the floor you are on
          const scene = me.scene;
          if (!KEYPAD_FLOORS.includes(scene)) break;
          if (m.a === "find") { const next = keypadFind(floorKeypad(room, scene), m.i); if (next) { room.keypads[scene] = next; sendKeypad(room, scene); } }
          else if (m.a === "try") {
            const r = tryCode(floorKeypad(room, scene), m.code, Date.now());
            if (r.st) { room.keypads[scene] = r.st; sendKeypad(room, scene); }
            else if (r.locked) send(me, keypadMsg(room, scene));       // tell them how long the lock has left
          }
          break;
        }
        case "switch": {                                              // flip one switch on the floor you are on
          const scene = me.scene;
          if (!SWITCH_FLOORS.includes(scene)) break;
          const next = flipSwitch(floorSwitches(room, scene), m.i);
          if (next) { room.switches[scene] = next; sendSwitches(room, scene); }
          break;
        }
        case "fuse": {                                                // take / slot / drop a fuse on the floor you are on
          const scene = me.scene;
          if (!GATED.includes(scene) || !["take", "slot", "drop"].includes(m.a)) break;
          const next = fuseAct(floorFuses(room, scene), me.id, {a: m.a, i: m.i, x: m.x, z: m.z});
          if (next) { room.fuses[scene] = next; sendFuses(room, scene); }
          break;
        }
        case "m":                                                     // monsters: only the scene's host may send them
          if (room.hosts[m.scene] === me.id) broadcast(room, {...m, id: me.id}, me.id, m.scene);
          break;
        case "door":
          broadcast(room, {t: "door", scene: m.scene, name: String(m.name).slice(0, 64), open: m.open === 0 ? 0 : 1}, me.id, m.scene);
          break;
        case "revive": {                                              // a teammate standing on the same floor lifts you
          const to = room.players.get(m.to);
          if (to && to.scene && to.scene === me.scene) send(to, {t: "revived", by: me.id});
          break;
        }
        case "caught": {                                              // only the scene's host may kill someone
          const to = room.players.get(m.to);
          if (to && room.hosts[to.scene] === me.id) send(to, {t: "caught"});
          break;
        }
      }
    });
    ws.on("close", () => {
      if (!room || !me) return;
      releaseFuse(room, me.id, me.scene);
      room.players.delete(me.id);
      broadcast(room, {t: "leave", id: me.id});
      if (!room.players.size) { clearTimeout(room.timer); rooms.delete(room.code); } else { elect(room); lobbyChanged(room); }
    });
  });
  return new Promise(resolve => httpServer.listen(port, () => resolve({httpServer, wss, port: httpServer.address().port, rooms,
    close: () => new Promise(r => { for (const c of wss.clients) c.terminate(); wss.close(); httpServer.close(r); })})));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || process.env.PORT || 8080);
  const s = await createServer({port});
  console.log(`Look Over There: http://localhost:${s.port}/   (rooms: ?room=CODE)`);
}
