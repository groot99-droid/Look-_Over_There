// A floor of a room, simulated on the server: its monsters (the shared rules in shared/monsters.js), its doors, and everything that used to be one player's job as the "host":
// hitting what a monster touches, deciding what a ray-gun shot does, swarming a thrown beacon, running to a noise, opening doors, hunting at the finale, and telling the floor
// where the monsters are. Players still say where they are (their `s` messages: x, y, z, flags); the server stores that on the player as `st`.
import {worldFromDoc, stepDoors, buildNav} from "../shared/world.js";
import {MonsterSim, spawnPlan, resolveShot, swarmApart} from "../shared/monsters.js";
import {HIT_DMG} from "../shared/health.js";
import {LURE_S} from "../shared/beacon.js";
import {ALARM_MS} from "../shared/finish.js";

export const TICK_S = 0.05, SNAP_EVERY = 2, DOORS_EVERY = 10, ALERT_R = 40, THROW_SPEED = 4;
const nums = (v, n) => Array.isArray(v) && v.length === n && v.every(x => typeof x === "number" && Number.isFinite(x)) ? v : null;

export class Floor {
  // room: the server's room object ({players: Map, power, alarmAt}); io: {to(player, msg), toFloor(msg, exceptId)}; docs: {doc(scene) -> world json}; monCfg: world/monsters.json
  constructor({scene, room, io, doc, monCfg, rnd = Math.random, onHit = () => {}}) {
    this.scene = scene; this.room = room; this.io = io; this.t = 0; this.rnd = rnd; this.onHit = onHit;
    this.W = worldFromDoc(doc, scene, {powerOn: room.power.on});
    this.env = {W: this.W, now: () => this.t, rnd, openDoor: dr => this.openDoor(dr)};
    this.monsters = spawnPlan(this.W, monCfg, scene).map(p => new MonsterSim(p.cfg, scene, p.x, p.z, this.env));
    this.lures = []; this.ticks = 0; this.hunt = 0; this.beaconSeq = 0;
  }
  players() { return [...this.room.players.values()].filter(p => p.scene === this.scene); }
  exited(p) { return !!(this.room.run && this.room.run.exits.some(e => e.id === p.id)); }
  // who the monsters can see and hear: living, not newly lifted (immune), still in the building; a shot counts as running noise for half a second
  targets() {
    return this.players().filter(p => p.st && !p.st.dead && !p.st.imm && !this.exited(p)).map(p => {
      const s = p.st, shot = (p.shotT || 0) > 0;
      return {id: p.id, x: s.x, y: s.y, z: s.z, crouch: !!s.crouch && !shot, moving: !!s.moving || shot, run: !!s.run || shot, carry: !!s.carry, cloak: !!s.cloak};
    });
  }
  doorBusy(dr) {
    const inside = (x, y, z) => Math.abs(y - dr.cy) < 1.8 && Math.hypot(x - dr.cx, z - dr.cz) < 1.1;
    return this.players().some(p => p.st && !p.st.dead && inside(p.st.x, p.st.y, p.st.z)) || this.monsters.some(m => inside(m.pos.x, m.fy, m.pos.z));
  }
  openDoor(dr) {                                                  // monsters open doors too (they never shut them, and never use the stair doors)
    if (dr.target !== 0 || dr.link) return;
    dr.target = 1; this.io.toFloor({t: "door", scene: this.scene, name: dr.d.name, open: 1});
  }
  // a player asks to open or shut a door: only a door they stand near, never a stair door; a shut one is refused while someone stands in the doorway
  playerDoor(p, name, open) {
    const dr = this.W.doors.find(d => d.d.name === name); if (!dr || dr.link || !p.st) return false;
    if (Math.hypot(p.st.x - dr.cx, p.st.z - dr.cz) > 4 || Math.abs(p.st.y - dr.cy) > 2.5) return false;
    const want = open === 0 ? 0 : 1; if (dr.target === want) return false;
    if (want === 0 && this.doorBusy(dr)) return false;
    dr.target = want; this.io.toFloor({t: "door", scene: this.scene, name, open: want}, p.id); return true;
  }
  // a shot: the ray starts at the shooter's eye (it must be near where they are) and banishes the monster it hits
  shot(p, o, d) {
    o = nums(o, 3); d = nums(d, 3); if (!o || !d || !p.st) return null;
    if (Math.hypot(o[0] - p.st.x, o[2] - p.st.z) > 3 || Math.abs(o[1] - p.st.y - 1.5) > 1.2) return null;
    const L = Math.hypot(...d); if (!(L > 0.5 && L < 1.5)) return null; d = d.map(v => v / L);
    p.shotT = 0.5;
    const r = resolveShot(this.W, this.monsters, this.players().filter(q => q.st && !q.st.dead).map(q => ({x: q.st.x, y: q.st.y, z: q.st.z})), o, d, this.rnd);
    if (r) this.io.toFloor({t: "zap", scene: this.scene, i: r.i, from: r.from, to: r.to});
    return r;
  }
  // a thrown AFK Beacon: it rolls from the thrower to (x, z) at 4 m/s, then runs for LURE_S seconds
  beacon(p, x, z) {
    if (!p.st || !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 500 || Math.abs(z) > 500) return false;
    const roll = Math.min(5, Math.hypot(x - p.st.x, z - p.st.z) / THROW_SPEED), land = this.t + roll;
    this.lures.push({id: ++this.beaconSeq, x, z, land, until: land + LURE_S});
    this.io.toFloor({t: "beacon", from: p.id, scene: this.scene, x, z}, p.id); return true;
  }
  alertNear(x, z, r = ALERT_R) { for (const m of this.monsters) if (Math.hypot(m.pos.x - x, m.pos.z - z) < r) m.alert(x, z); }
  powerOn() { if (this.W.shutter && !this.W.shutter.off) { this.W.shutter.off = true; this.W.nav = buildNav(this.W, this.W.floor); } }
  step(dt = TICK_S) {
    this.t += dt; this.ticks++;
    stepDoors(this.W, dt, dr => this.doorBusy(dr));
    if (this.scene === "L4" && this.room.alarmAt && Date.now() - this.room.alarmAt < ALARM_MS && (this.hunt -= dt) <= 0) { this.hunt = 2; for (const m of this.monsters) m.alert(0, 24.5); }          // the alarm: every monster heads for the doors
    for (const p of this.players()) if (p.shotT > 0) p.shotT -= dt;
    const targets = this.targets(), live = this.lures.filter(b => this.t >= b.land && this.t < b.until);
    this.lures = this.lures.filter(b => this.t < b.until + 1);
    for (const m of this.monsters) for (const id of m.update(dt, targets, live).caught) this.onHit(id, HIT_DMG, m);
    swarmApart(this.monsters, dt);
    if (this.ticks % SNAP_EVERY === 0) {
      const msg = {t: "m", scene: this.scene, l: this.monsters.map(m => m.snapshot())};
      if ((this.ticks / SNAP_EVERY) % DOORS_EVERY === 1) msg.d = this.W.doors.filter(d => !d.link && d.target === 1).map(d => d.d.name);          // late joiners learn which doors are open
      this.io.toFloor(msg);
    }
  }
}
