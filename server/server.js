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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVE = new Set(["index.html", "world", "monsters"]);            // nothing else in the repo is public
const TYPES = {".html": "text/html; charset=utf-8", ".json": "application/json", ".glb": "model/gltf-binary", ".js": "text/javascript"};
const MAX_PLAYERS = 8, COLORS = ["#e0a040", "#4fc3f7", "#9ccc65", "#f06292", "#ba68c8", "#ffd54f", "#4db6ac", "#ff8a65"];

export function createServer({port = 0, root = ROOT} = {}) {
  const rooms = new Map();                                             // code -> {players: Map(id -> player), hosts: {scene: id}, seq}
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
        room = rooms.get(code) || {code, players: new Map(), hosts: {}, seq: 0}; rooms.set(code, room);
        if (room.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({t: "full"})); return ws.close(); }
        const used = new Set([...room.players.values()].map(p => p.color));
        me = {id: ++room.seq, seq: room.seq, ws, scene: null, name: String(m.name || "Player").replace(/[^\w .-]/g, "").slice(0, 16) || "Player",
              color: COLORS.find(c => !used.has(c)) || COLORS[0]};
        room.players.set(me.id, me);
        send(me, {t: "welcome", id: me.id, room: code, hosts: room.hosts, players: [...room.players.values()].map(p => ({id: p.id, name: p.name, color: p.color}))});
        broadcast(room, {t: "join", id: me.id, name: me.name, color: me.color}, me.id);
        return;
      }
      switch (m.t) {
        case "s": {                                                   // a player's state: relayed to everyone, the scene noted for host election
          const scene = typeof m.scene === "string" ? m.scene.slice(0, 8) : null;
          const was = me.scene; me.scene = scene;
          broadcast(room, {...m, id: me.id}, me.id);
          if (was !== scene) elect(room);
          break;
        }
        case "m":                                                     // monsters: only the scene's host may send them
          if (room.hosts[m.scene] === me.id) broadcast(room, {...m, id: me.id}, me.id, m.scene);
          break;
        case "door":
          broadcast(room, {t: "door", scene: m.scene, name: String(m.name).slice(0, 64)}, me.id, m.scene);
          break;
        case "caught": {                                              // only the scene's host may kill someone
          const to = room.players.get(m.to);
          if (to && room.hosts[to.scene] === me.id) send(to, {t: "caught"});
          break;
        }
      }
    });
    ws.on("close", () => {
      if (!room || !me) return;
      room.players.delete(me.id);
      broadcast(room, {t: "leave", id: me.id});
      if (!room.players.size) rooms.delete(room.code); else elect(room);
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
