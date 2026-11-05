// The monsters' rules, with no graphics: what they see and hear, how they hunt and search, patrol, open doors, swarm an AFK Beacon, and what the ray gun does to them.
// One class, two homes: the game page runs it for solo play (and wraps it with a model), the server runs it for rooms. Everything the rules need from outside comes in
// through `env`: {W: the world (shared/world.js), now(): seconds, rnd(): [0,1), openDoor(door)}.
import {cellOf, nearestWalk, astar, segClear, los, rayClear, pickSpots, mainRegion, cellXZ, NAV, rng32} from "./world.js";
import {SHORT_M, STUN_R} from "./cloak.js";
import {SAFE_M, lures as lureCovers, ringSpot, repelling} from "./beacon.js";
import {mayHit} from "./health.js";

export const MON_STATES = ["patrol", "chase", "search"];
export const SHOT_RANGE = 25, SHOT_COOL = 0.6, HIT_R = 0.6, SHOT_NOISE_S = 0.5, BANISH_PATH = 35, BANISH_FROM_PLAYER = 15, BANISH_WAIT = 4, BANISH_IMMUNE = 8, GLITCH_S = 0.5;       // the ray gun: range, time between shots, hit radius, noise, where a banished monster lands, its wait, immunity, the glitch
export const NOISE_WALK = 0.5, NOISE_CARRY_CROUCH = 0.4, NOISE_WALL = 0.5, CHASE_LOSE_S = 2.5, SEARCH_S = 6;       // how loud walking is (of the full range), a crouching carrier, how much a wall takes off, how long it chases unseen, how long it searches
export const TOUCH_M = 1.0;                                                                                       // a monster this close to a player (with a clear line) hits

export const vec = (x, y, z) => ({x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; }});

export class MonsterSim {
  constructor(cfg, level, x, z, env) {
    this.cfg = cfg; this.level = level; this.env = env; this.fy = env.W.floor;
    this.home = [x, z]; this.pos = vec(x, this.fy, z); this.yaw = env.rnd() * 6.28;
    this.state = "patrol"; this.path = []; this.repath = 0; this.target = null; this.lost = 0; this.wait = 0; this.speed = 0; this.doorT = 0; this.last = null; this.glitchT = 0; this.immuneT = 0; this.stunT = 0; this.fleeId = null;
    this.hitAt = {}; this.k = Math.abs(Math.floor(x * 7.3 + z * 3.1)) % 97; this.lureId = null; this.lureAt = null; this.spot = null; this.tgt = null;
  }
  get walk() { return this.env.W.nav; }
  onFloorY(y) { return Math.abs(y - this.fy) < 1.6; }
  los(t) { return los(this.env.W, this.pos.x, this.fy + 1.6, this.pos.z, t); }
  sees(t) {                                                                         // t: a player {x, y, z, crouch, carry, cloak}
    if (!this.onFloorY(t.y)) return false;
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
    if (t.cloak && d > SHORT_M) return false;                                          // a cloaked player is only seen from very close (they are still heard)
    if (d > this.cfg.sight * (t.crouch ? (t.carry ? 0.75 : 0.5) : 1)) return false;   // crouching halves how far they can see you (a carrier only a quarter less)
    const fwd = [-Math.sin(this.yaw), -Math.cos(this.yaw)];
    const ang = Math.acos(Math.max(-1, Math.min(1, (fwd[0] * dx + fwd[1] * dz) / (d || 1)))) * 180 / Math.PI;
    if (d > 2.5 && ang > this.cfg.fov / 2) return false;
    return this.los(t);
  }
  ringSpotOpen(lure) {                                                       // a spot of its own on the ring that is walkable and in line of sight of the can (not behind a wall)
    for (let j = 0; j < 14; j++) {
      const sp = ringSpot(lure, this.k + j * 5), c = cellOf(sp[0], sp[1]);
      if (c >= 0 && this.walk[c] && segClear(this.env.W, lure.x, this.fy + 0.4, lure.z, sp[0], this.fy + 0.4, sp[1], 0.3)) return sp;
    }
    return [lure.x, lure.z];
  }
  goTo(x, z) {
    const a = nearestWalk(this.walk, this.pos.x, this.pos.z), b = nearestWalk(this.walk, x, z);
    this.path = astar(this.walk, a, b) || []; this.path.shift(); this.target = [x, z];
  }
  closedDoorAhead(dirx, dirz) {
    for (const dr of this.env.W.doors) {
      if (dr.target || Math.abs(dr.cy - this.fy) > 1.5) continue;
      const dx = dr.cx - this.pos.x, dz = dr.cz - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.4 && (dx * dirx + dz * dirz) / (d || 1) > 0.2) return dr;
    }
    return null;
  }
  // targets = every living player on this floor: {id, x, y, z, crouch, moving, run, carry, cloak}. Returns {caught: ids of the players it hits now}.
  update(dt, targets, lureList = []) {
    const c = this.cfg, env = this.env, nowS = env.now();
    this.immuneT = Math.max(0, this.immuneT - dt);
    if (this.glitchT > 0) { this.glitchT -= dt; this.speed = 0; return {caught: []}; }                    // being deleted: it does nothing for a moment
    if (this.stunT > 0) { this.stunT -= dt; this.speed = 0; return {caught: []}; }                        // stunned (the cloak's short circuit): it neither moves nor hits
    let seenT = null, sd = 1e9;
    for (const t of targets) if (this.sees(t)) { const d = Math.hypot(t.x - this.pos.x, t.z - this.pos.z); if (d < sd) { sd = d; seenT = t; } }
    let noiseAt = null, nd = 1e9;                                                   // running is loud (the full hearing range), walking is half of it, crouching is silent; walls halve what gets through
    for (const t of targets) if (t.moving && this.onFloorY(t.y)) {
      const d = Math.hypot(t.x - this.pos.x, t.z - this.pos.z), tier = t.crouch ? (t.carry ? NOISE_CARRY_CROUCH : 0) : t.run ? 1 : NOISE_WALK;     // a fuse in your hands is heard 1.5x as far, and even crouched
      if (!tier || d > c.hear * 1.5 * tier) continue;
      const rad = c.hear * tier * (t.carry && !t.crouch ? 1.5 : 1) * (d < 2 || this.los(t) ? 1 : NOISE_WALL);
      if (d < rad && d < nd) { nd = d; noiseAt = [t.x, t.z]; }
    }
    // an AFK Beacon within 30 m: it goes to a spot on a ring round the can and idles there, ignoring players unless one is within SAFE_M of it; when the beacon ends it searches there
    let lure = null, ld = 1e9;
    for (const b of lureList) { const d = Math.hypot(b.x - this.pos.x, b.z - this.pos.z); if (d < ld && lureCovers(b, this.pos.x, this.pos.z, nowS)) { ld = d; lure = b; } }
    let lured = false;
    const repel = !!lure && repelling(lure, nowS);                                       // a reversed beacon: they run from it
    if (repel) {
      if (seenT && sd > SAFE_M) seenT = null;
      if (noiseAt && nd > SAFE_M) noiseAt = null;
      if (!seenT) {
        this.state = "search"; this.lost = 0; this.lureId = null;
        if (this.fleeId !== lure.id) { this.fleeId = lure.id; this.flee(lure); }
      }
      lure = null;
    }
    if (lure) {
      if (seenT && sd > SAFE_M) seenT = null;
      if (noiseAt && nd > SAFE_M) noiseAt = null;
      if (!seenT) lured = true;
    }
    if (lured) {
      this.lost = 0; this.state = "search";
      if (this.lureId !== lure.id) { this.lureId = lure.id; this.lureAt = [lure.x, lure.z]; this.spot = this.ringSpotOpen(lure); this.goTo(...this.spot); }
      else if (!this.path.length && this.spot && Math.hypot(this.spot[0] - this.pos.x, this.spot[1] - this.pos.z) > 0.9 && (this.repath -= dt) <= 0) { this.goTo(...this.spot); this.repath = 1; }
    } else if (this.lureId !== null && !repel) { this.lureId = null; this.state = "search"; this.lost = 0; this.last = this.lureAt; this.goTo(...this.lureAt); }
    if (seenT) { this.state = "chase"; this.lost = 0; this.tgt = seenT.id; this.last = [seenT.x, seenT.z]; }
    else if (this.state === "chase") {                                               // it lost sight: it runs to where it last saw you, and gives up if it gets there or CHASE_LOSE_S passes
      this.last = this.last || [this.pos.x, this.pos.z]; this.lost += dt;
      if (this.lost > CHASE_LOSE_S || Math.hypot(this.last[0] - this.pos.x, this.last[1] - this.pos.z) < 1.2) { this.state = "search"; this.lost = 0; this.goTo(...this.last); }
    }
    else if (this.state === "search") { this.lost += dt; if (!this.path.length && this.lost > SEARCH_S) { this.state = "patrol"; this.target = null; } }
    if (noiseAt && this.state !== "chase") { this.state = "search"; this.lost = 0; this.last = noiseAt; this.goTo(...noiseAt); }
    this.repath -= dt;
    let speed = c.patrol;
    if (this.state === "chase") {
      speed = c.chase;
      if (this.repath <= 0) { const g = seenT ? [seenT.x, seenT.z] : this.last; if (g) this.goTo(...g); this.repath = 0.35; }          // only what it can see, never where you are now
    } else if (this.state === "search") speed = repel && this.fleeId !== null ? c.chase : c.alert;
    else {
      if (this.wait > 0) { this.wait -= dt; speed = 0; }
      else if (!this.path.length) {
        const spots = pickSpots(env.W, 1, env.rnd);
        if (spots.length) this.goTo(spots[0][0], spots[0][1]);
        this.wait = 0.6 + env.rnd() * 2.5;
      }
    }
    this.speed = 0;
    if (this.path.length && speed > 0) {
      const [tx, tz] = this.path[0], dx = tx - this.pos.x, dz = tz - this.pos.z, dd = Math.hypot(dx, dz);
      const door = this.closedDoorAhead(dx / (dd || 1), dz / (dd || 1));
      if (door && door.link) { this.path = []; this.doorT = 0; }                                       // monsters never use the stair doors: give that route up rather than stand there
      else if (door) { this.doorT += dt; if (this.doorT > 0.5) { env.openDoor(door); this.doorT = 0; } }       // they have to open doors too
      else {
        this.doorT = 0;
        if (dd < 0.25) this.path.shift();
        else {
          const want = Math.atan2(-dx, -dz); let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
          this.yaw += Math.sign(da) * Math.min(Math.abs(da), (this.state === "chase" ? 7 : 3.5) * dt);
          const step = Math.min(dd, speed * dt);
          this.pos.x += (dx / dd) * step; this.pos.z += (dz / dd) * step; this.speed = speed;
        }
      }
    } else if (this.state === "chase" && seenT && Math.hypot(seenT.x - this.pos.x, seenT.z - this.pos.z) > 0.1) {
      const want = Math.atan2(-(seenT.x - this.pos.x), -(seenT.z - this.pos.z)); let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da));
      this.yaw += Math.sign(da) * Math.min(Math.abs(da), 7 * dt);
    }
    if (lured && !this.path.length) { const want = Math.atan2(-(lure.x - this.pos.x), -(lure.z - this.pos.z)); let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); this.yaw += Math.sign(da) * Math.min(Math.abs(da), 3 * dt); }
    // a touch is a hit at most every HIT_GAP seconds per monster; the target's own grace period covers hits from several monsters
    return {caught: targets.filter(t => this.onFloorY(t.y) && Math.hypot(t.x - this.pos.x, t.z - this.pos.z) < TOUCH_M && this.los(t) && mayHit(this.hitAt[t.id], nowS)).map(t => (this.hitAt[t.id] = nowS, t.id))};
  }
  flee(lure) {                                                               // run from a reversed beacon: to a walkable spot up to 18 m directly away from it
    const dx = this.pos.x - lure.x, dz = this.pos.z - lure.z, d = Math.hypot(dx, dz) || 1;
    for (const r of [18, 14, 10, 6]) {
      for (const ang of [0, 0.5, -0.5, 1, -1]) {
        const c = Math.cos(ang), sn = Math.sin(ang), ux = (dx * c - dz * sn) / d, uz = (dx * sn + dz * c) / d, x = this.pos.x + ux * r, z = this.pos.z + uz * r, cell = cellOf(x, z);
        if (cell >= 0 && this.walk[cell]) { this.goTo(x, z); if (this.path.length) return true; }
      }
    }
    return false;
  }
  stun(secs) { this.stunT = Math.max(this.stunT, secs); this.speed = 0; }       // see shared/cloak.js: the short circuit
  banish(x, z) {                                                             // the ray no-clips it to (x, z): it forgets the chase, waits, then patrols, and cannot be banished again for a while
    this.pos.set(x, this.fy, z); this.state = "patrol"; this.path = []; this.target = null; this.lost = 0; this.last = null; this.tgt = null;
    this.wait = BANISH_WAIT; this.glitchT = GLITCH_S; this.immuneT = BANISH_IMMUNE;
  }
  alert(x, z) {                                                              // a loud noise at x, z: go and look (unless already chasing)
    if (this.state === "chase") return;
    this.state = "search"; this.lost = 0; this.last = [x, z]; this.goTo(x, z);
  }
  // a state a client follows: [x, z, yaw, speed, stateIndex]
  snapshot() { return [+this.pos.x.toFixed(2), +this.pos.z.toFixed(2), +this.yaw.toFixed(2), +this.speed.toFixed(1), Math.max(0, MON_STATES.indexOf(this.state))]; }
}

// monsters swarming a beacon bump into each other and shuffle apart (a gentle push, so they jostle round the can)
export function swarmApart(monsters, dt) {
  for (const a of monsters) if (a.lureId !== null) for (const b of monsters) if (b !== a && b.lureId !== null) {
    const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.8 && d > 0.001) { const push = (0.8 - d) * 0.5 * Math.min(1, dt * 6); a.pos.x += dx / d * push; a.pos.z += dz / d * push; }
  }
}

// where each monster of a floor starts: every kind with a count for this level, in config order, at seeded spots (the same everywhere)
export function spawnPlan(W, monCfg, level) {
  const rnd = rng32(1999), out = [];
  for (const cfg of monCfg.monsters) for (const [lvl, n] of Object.entries(cfg.perLevel || {})) {
    if (lvl !== level) continue;
    for (const [x, z] of pickSpots(W, n, rnd)) out.push({cfg, x, z});
  }
  return out;
}

// ---- the ray gun's side of things
// the nearest monster on o's floor that the ray from o along d (unit) hits: {m, t} or null
export function rayMonster(W, monsters, o, d) {
  let best = null;
  for (const m of monsters) {
    if (Math.abs(o[1] - 1.5 - m.fy) > 1.6) continue;
    for (const f of [0.15, 0.5, 0.85]) {                                    // three points up the body stand for a capsule
      const q = [m.pos.x - o[0], m.fy + f * (m.cfg.height || 2.2) - o[1], m.pos.z - o[2]], t = q[0] * d[0] + q[1] * d[1] + q[2] * d[2];
      if (t < 0.3 || t > SHOT_RANGE) continue;
      if (Math.hypot(q[0] - d[0] * t, q[1] - d[1] * t, q[2] - d[2] * t) < HIT_R && (!best || t < best.t) && rayClear(W, o, d, t)) best = {m, t};
    }
  }
  return best;
}
export const rayLength = (W, o, d) => { let lo = 0, hi = SHOT_RANGE; if (rayClear(W, o, d, hi)) return hi; for (let k = 0; k < 7; k++) { const mid = (lo + hi) / 2; if (rayClear(W, o, d, mid)) lo = mid; else hi = mid; } return lo; };
// where a banished monster lands: on its floor, at least BANISH_PATH m away by path from every player, out of every player's sight, and at least BANISH_FROM_PLAYER m from any. players: [{x, y, z}]
export function banishSpot(W, players, rnd) {
  const pl = players.map(p => [p.x, p.z, p.y]), cells = mainRegion(W); if (!cells.length) return null;
  let best = null, bs = -1, pathTries = 0;
  for (let tries = 0; tries < 500; tries++) {
    const c = cells[Math.floor(rnd() * cells.length)], [x, z] = cellXZ(c);
    const e = Math.min(99, ...pl.map(q => Math.hypot(q[0] - x, q[1] - z))); if (e < BANISH_FROM_PLAYER) continue;
    if (!pl.every(q => !segClear(W, q[0], q[2] + 1.5, q[1], x, W.floor + 1.4, z, 0.5))) continue;            // blocked from every player's eye
    if (e > bs) { bs = e; best = [x, z]; }                                  // the fallback: the farthest unseen cell
    if (pathTries++ < 6 && pl.every(q => { const a = cellOf(q[0], q[1]), path = astar(W.nav, a, c); return !path || path.length * NAV >= BANISH_PATH; })) return [x, z];
  }
  return best;
}
// a shot: o is the shooter's eye, d the unit direction. Banishes the monster it hits (unless it is immune or already glitching): returns {m, i, from, to} or null.
export function resolveShot(W, monsters, players, o, d, rnd) {
  const hit = rayMonster(W, monsters, o, d); if (!hit || hit.m.immuneT > 0 || hit.m.glitchT > 0) return null;
  const to = banishSpot(W, players, rnd); if (!to) return null;
  const from = [hit.m.pos.x, hit.m.pos.z]; hit.m.banish(to[0], to[1]);
  return {m: hit.m, i: monsters.indexOf(hit.m), from, to};
}

// the cloak's short circuit at (x, y, z): every monster of that floor within STUN_R is stunned for `secs`; returns the indices stunned
export function stunNear(monsters, x, y, z, secs, r = STUN_R) {
  const out = []; monsters.forEach((m, i) => { if (m.onFloorY(y) && Math.hypot(m.pos.x - x, m.pos.z - z) <= r) { m.stun(secs); out.push(i); } });
  return out;
}
