// The bot's mind, run inside each game page by tools/bots.mjs (it is serialised by Playwright, so it must use nothing from outside this function).
//
// Maths (all on the game's own walkable grid, 0.5 m cells):
//  * Dijkstra distance fields: db = path distance from the bot, dm[k] = path distance from monster k.
//  * Arrival times: the bot covers d metres in tb(d) (running while the stamina bar lasts, walking after), a monster in dm[k]/chase-speed.
//  * Intercept margin of a cell: margin(c) = min over monsters of ( dm[k](c)/vm - tb(db(c)) ). Positive means the bot gets there first by that many seconds.
//  * Safe route: the cheapest path that only uses cells whose margin is at least 2 s; if none exists the margin is relaxed (1, 0 s), and only then ignored.
//  * Flee: the reachable cell with the best margin (ties: further from the monsters, and for the bait further from the runner), reached by the path
//    the fields give. A lure spot for the bait is a visible cell 9 to 13 m from the monster that threatens the runner most, with a margin of at least 2 s.
// Team (a blackboard the runner process relays between the pages every 0.4 s): the runner fetches what the floor needs, the bait draws the monster that is
// closest to the runner's way off it, the scout waits by the stairs, types the code and throws the power. With no runner left on a floor the others work.
export function brain(idx, N, opts = {}) {
  const g = window.__game, NW = g.NW, NH = g.NH, NAV = g.NAV, NX0 = g.NX0, NZ0 = g.NZ0, CELLS = NW * NH;
  const ROLES = ["runner", "bait", "scout", "runner", "runner", "bait", "runner", "runner"];
  const B = window.__bot = {idx, role: N === 1 ? "runner" : N === 2 ? ["runner", "bait"][idx] : ROLES[idx % ROLES.length], floors: {}, downs: 0, revives: 0, stuck: 0, fled: 0, cur: null, path: [], pathAt: 0,
    last: performance.now(), prev: null, prevAt: 0, was: false, hold: 0, deaths: [], trail: [], upAt: null, shots: 0, hits: 0, beacons: 0, cloakS: 0, hurts: 0, hp: 100, armedAt: null, fields: null, fieldsAt: -9, lure: null, lureAt: -9, claim: null, pub: {}};
  window.__bb = window.__bb || [];
  const now = () => performance.now() / 1000;
  const xz = c => [NX0 + ((c % NW) + 0.5) * NAV, NZ0 + (Math.floor(c / NW) + 0.5) * NAV];
  const cellOf = (x, z) => g.nearestWalk(g.S.nav, x, z);
  const dist = (x, z) => Math.hypot(x - g.P.p.x, z - g.P.p.z);
  const face = (x, z) => { g.P.yaw = Math.atan2(-(x - g.P.p.x), -(z - g.P.p.z)); };
  const stop = () => { g.keys.KeyW = false; g.keys.KeyE = false; g.keys.KeyR = false; };

  // ---- Dijkstra over the walkable grid; allowed (optional) is a Uint8Array of cells the path may use
  const hd = new Float32Array(CELLS * 8), hc = new Int32Array(CELLS * 8);
  function dijk(src, allowed) {
    const d = new Float32Array(CELLS).fill(Infinity), p = new Int32Array(CELLS).fill(-1), walk = g.S.nav;
    if (src < 0) return {d, p};
    let hn = 0;
    const push = (dd, c) => { let i = hn++; while (i > 0) { const q = (i - 1) >> 1; if (hd[q] <= dd) break; hd[i] = hd[q]; hc[i] = hc[q]; i = q; } hd[i] = dd; hc[i] = c; };
    d[src] = 0; push(0, src);
    while (hn) {
      const cd = hd[0], c = hc[0]; hn--;
      if (hn > 0) { const ld = hd[hn], lc = hc[hn]; let i = 0; for (;;) { let l = 2 * i + 1; if (l >= hn) break; if (l + 1 < hn && hd[l + 1] < hd[l]) l++; if (hd[l] >= ld) break; hd[i] = hd[l]; hc[i] = hc[l]; i = l; } hd[i] = ld; hc[i] = lc; }
      if (cd > d[c]) continue;
      const ci = c % NW, cj = (c / NW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NW || j >= NH) continue;
        const n = j * NW + i; if (!walk[n] || (allowed && !allowed[n])) continue;
        if (di && dj && (!walk[cj * NW + i] || !walk[j * NW + ci])) continue;
        const nd = cd + (di && dj ? 1.414 : 1) * NAV;
        if (nd < d[n]) { d[n] = nd; p[n] = c; push(nd, n); }
      }
    }
    return {d, p};
  }
  const route = (f, goal) => { const out = []; for (let c = goal; c !== -1 && out.length < 4000; c = f.p[c]) out.push(xz(c)); return out.reverse(); };
  // seconds for the bot to cover d metres: it runs while the stamina bar lasts, then walks
  const tb = d => { const runM = Math.max(0, g.P.stam) * 4 * 7.5; return d <= runM ? d / 7.5 : runM / 7.5 + (d - runM) / 4; };

  // ---- the monsters on this floor and the fields they make (refreshed every 0.4 s)
  // ---- what the bot knows about the monsters. Omniscient (--omniscient): everything in the game state, as the first versions did. Fair (default): only a monster it can see (18 m, line of sight) or hear (6 m),
  // one a teammate reported on the blackboard, and, for the scout (the watcher), one a security camera shows (unless --nocams); an unseen monster is remembered at its last spot for 8 s, with no idea what it does.
  const MEM = {}; let kAt = -1, kList = [];
  function known() {
    if (opts.omniscient) return g.monsters;
    const t = Date.now(); if (t - kAt < 40) return kList; kAt = t;
    B.seenNow = [];
    g.monsters.forEach((m, i) => {
      if (!m.onFloorY(g.P.p.y)) return;
      const d = dist(m.pos.x, m.pos.z), see = d < 18 && g.segClear(g.P.p.x, g.P.p.y + g.P.eye, g.P.p.z, m.pos.x, m.fy + 1.2, m.pos.z, 0.5);
      let cam = false; if (!opts.nocams && B.role === "scout") { const sn = g.MAPSEEN.get(m); cam = !!sn && performance.now() - sn.at < 500; }
      if (see || d < 6 || cam) { MEM[i] = {x: m.pos.x, z: m.pos.z, at: t, st: m.state, real: see || d < 6}; B.seenNow.push({i, x: m.pos.x, z: m.pos.z, st: m.state, at: t}); if (cam && !see) B.camSeen = (B.camSeen || 0) + 0.04; }
    });
    for (const b of mates()) for (const r of (b.seen || [])) if (t - r.at < 6000 && (!MEM[r.i] || MEM[r.i].at < r.at)) MEM[r.i] = {x: r.x, z: r.z, at: r.at, st: r.st, real: false};
    kList = [];
    for (const i in MEM) {
      const k = MEM[i], m = g.monsters[i]; if (!m || t - k.at > 8000 || !m.onFloorY(g.P.p.y)) continue;
      if (k.real && t - k.at < 150) kList.push(m);
      else kList.push({ghost: true, pos: {x: k.x, z: k.z}, fy: m.fy, cfg: m.cfg, state: k.st === "chase" ? "chase" : "patrol", onFloorY: m.onFloorY.bind(m), immuneT: 0, glitchT: 0, home: m.home});
    }
    return kList;
  }
  function fields() {
    if (B.fields && now() - B.fieldsAt < 0.4 && B.fields.id === g.S.id) return B.fields;
    const mons = known().filter(m => m.onFloorY(g.P.p.y)).map(m => ({m, v: m.cfg.chase, f: dijk(cellOf(m.pos.x, m.pos.z))}));
    B.fields = {id: g.S.id, bot: dijk(cellOf(g.P.p.x, g.P.p.z)), mons}; B.fieldsAt = now();
    return B.fields;
  }
  const margin = (F, c) => { let m = Infinity; const t = tb(F.bot.d[c]); for (const k of F.mons) m = Math.min(m, k.f.d[c] / k.v - t); return m; };

  // ---- route to a goal: the cheapest path whose cells all have margin >= mg (2, then 1, then 0 s, then anything)
  function plan(gx, gz) {
    const F = fields(), src = cellOf(g.P.p.x, g.P.p.z), goal = cellOf(gx, gz);
    if (src < 0 || goal < 0) return [];
    B.tier = 0;
    if (!F.mons.length) { const r = dijk(src); return r.d[goal] < Infinity ? route(r, goal) : []; }
    const ring = B.sneak ? 8 : 16;                                          // a monster sees 16 m (8 m if you crouch) in a 110 degree cone; keep out of that ring first, then relax
    const mons = F.mons.map(k => [k.m.pos.x, k.m.pos.z]);
    let tier = -1;
    for (const [mg, rr] of [[2, ring], [2, ring * 0.6], [1, ring * 0.6], [0, 0], [-1e9, 0]]) {
      tier++;
      const allowed = new Uint8Array(CELLS); let any = false;
      for (let c = 0; c < CELLS; c++) {
        if (F.bot.d[c] === Infinity) continue;
        if (c !== src) {
          if (margin(F, c) < mg) continue;
          if (rr) { const [x, z] = xz(c); let bad = false; for (const m of mons) if (Math.hypot(x - m[0], z - m[1]) < rr) { bad = true; break; } if (bad) continue; }
        }
        allowed[c] = 1; any = true;
      }
      if (!any) continue;
      const r = dijk(src, allowed); if (r.d[goal] < Infinity) { B.safety = mg; B.tier = tier; return route(r, goal); }
    }
    return [];
  }
  function follow(path, close, gx, gz) {                                   // walk a path; true once within `close` of (gx, gz)
    while (path.length > 1 && dist(path[0][0], path[0][1]) < 0.7) path.shift();
    if (dist(gx, gz) <= close) { stop(); return true; }
    const [wx, wz] = path.length ? path[Math.min(2, path.length - 1)] : [gx, gz];
    face(wx, wz); g.keys.KeyW = true;
    if (!B.prev || now() - B.prevAt > 3) {                                  // stuck: hardly moved in 3 s, so hop to the next waypoint
      if (B.prev && Math.hypot(B.prev[0] - g.P.p.x, B.prev[1] - g.P.p.z) < 0.3) { B.stuck++; if (path.length) { const [sx, sz] = path[0]; g.P.p.set(sx, g.P.p.y + 0.05, sz); } }
      B.prev = [g.P.p.x, g.P.p.z]; B.prevAt = now();
    }
    return false;
  }
  function walkTo(x, z, close) {
    const key = x.toFixed(1) + "," + z.toFixed(1) + g.S.id;
    if (B.goalKey !== key) { B.goalKey = key; B.waitT = 0; }                   // the patience budget belongs to the goal, so a flee does not refill it
    if (B.cur !== key || now() - B.pathAt > 1.2) { B.cur = key; B.pathAt = now(); B.path = plan(x, z); }
    if (B.tier >= 2 && (B.waitT || 0) < 25 && dist(x, z) > close + 1) {      // only a risky route is open: wait still and quiet while this spot is safe, as a patrol passes
      const F = fields(), here = cellOf(g.P.p.x, g.P.p.z);
      if (here >= 0 && margin(F, here) >= 2 && !F.mons.some(k => Math.hypot(k.m.pos.x - g.P.p.x, k.m.pos.z - g.P.p.z) < 9)) { B.waitT = (B.waitT || 0) + 0.05; stop(); g.P.crouch = true; B.waited = (B.waited || 0) + 0.05; return false; }
    }
    const done = follow(B.path, close, x, z);
    if (!done) { g.P.crouch = !!B.sneak; g.keys.KeyR = !!B.runOk && !B.sneak; }
    return done;
  }

  // ---- flee: the reachable cell with the best margin; the bait also keeps away from the runner so the monster is led off
  function flee(runnerPos) {
    const F = fields(), chasers = F.mons.filter(k => k.m.state === "chase"), cand = [];
    if (B.fleeTo && now() - B.fleeAt < 0.8 && !B.fleeDone) { /* keep the chosen hiding place for a moment: no dithering */ }
    else {
      for (let c = 0; c < CELLS; c++) {
        const db = F.bot.d[c]; if (db === Infinity || db > 34 || db < 3) continue;
        const mg = Math.min(margin(F, c), 12);
        let dm = Infinity; for (const k of F.mons) dm = Math.min(dm, k.f.d[c]);
        let sc = mg * 3 + Math.min(dm, 40) * 0.1;
        if (runnerPos) { const [x, z] = xz(c); sc += Math.min(Math.hypot(x - runnerPos[0], z - runnerPos[1]), 40) * 0.08; }
        cand.push([sc, c, mg]);
      }
      cand.sort((a, b) => b[0] - a[0]);
      const samples = []; for (let c = 0; c < CELLS; c += 4 * NW + 4) if (F.bot.d[c] < Infinity && margin(F, c) > 0) samples.push(xz(c));          // a coarse sample of the cells that are safe now
      for (let i = 0; i < Math.min(150, cand.length); i++) { const [x, z] = xz(cand[i][1]); let open = 0; for (const q of samples) if (Math.hypot(q[0] - x, q[1] - z) < 8) open++; cand[i][0] += Math.min(open, 12) * 0.5; }
      cand.length = Math.min(150, cand.length); cand.sort((a, b) => b[0] - a[0]);
      let pick = null;                                                     // the best cell that every chaser's line of sight misses, with the bot there first
      for (let i = 0; i < Math.min(150, cand.length) && !pick; i++) {
        const [sc, c, mg] = cand[i]; if (mg < 0.5) continue; const [x, z] = xz(c);
        if (chasers.every(k => !g.segClear(k.m.pos.x, k.m.fy + 1.6, k.m.pos.z, x, g.S.floor + 1.0, z, 0.5))) pick = c;
      }
      B.fleeTo = pick !== null ? pick : (cand.length ? cand[0][1] : -1); B.fleeHidden = pick !== null; B.fleeAt = now(); B.fleeDone = false;
    }
    if (B.fleeTo < 0) return false;
    B.path = route(F.bot, B.fleeTo); B.cur = "flee"; B.pathAt = now();
    const [x, z] = xz(B.fleeTo), arrived = follow(B.path, 0.6, x, z);
    g.keys.KeyR = g.P.stam > 0.03 && !arrived; g.P.crouch = arrived; B.fled += 0.05;
    if (arrived) { B.fleeDone = true; B.hide = {until: now() + (B.fleeHidden ? 6 : 2)}; }
    return true;
  }

  // ---- the gun: open a locker on B1, pick up nearby ammo packs, and fire at a chaser that has closed to 12 m (aimed at its body; a hit sends it far away)
  const eye = () => [g.P.p.x, g.P.p.y + g.P.eye, g.P.p.z];
  function tryShoot() {
    if (opts.nogun || !g.LT.gun || g.LT.rounds <= 0 || g.GUN.cool > 0 || g.myCarry() >= 0) return false;
    let best = null;
    for (const m of known()) { if (m.ghost || !m.onFloorY(g.P.p.y) || m.immuneT > 0 || m.glitchT > 0 || m.state !== "chase") continue; const d = dist(m.pos.x, m.pos.z); if (d <= 13 && (!best || d < best.d)) best = {m, d}; }
    if (!best) return false;
    const o = eye(), tx = best.m.pos.x - o[0], ty = best.m.fy + 0.5 * (best.m.cfg.height || 2.2) - o[1], tz = best.m.pos.z - o[2], L = Math.hypot(tx, ty, tz) || 1;
    const keep = [g.P.yaw, g.P.pitch]; g.P.yaw = Math.atan2(-tx, -tz); g.P.pitch = Math.asin(ty / L);
    const h = g.rayMonster(o, [-Math.sin(g.P.yaw) * Math.cos(g.P.pitch), Math.sin(g.P.pitch), -Math.cos(g.P.yaw) * Math.cos(g.P.pitch)]);
    if (!h || h.m !== best.m) { [g.P.yaw, g.P.pitch] = keep; return false; }                   // a wall or another monster is in the way
    const f = g.fire(); if (f) { B.shots++; B.hits++; }
    g.P.pitch = 0; return f;
  }
  // ---- the AFK Beacon: with a monster chasing from 7 to 22 m, roll a beacon at it (it and anything within 30 m of the can goes to the can); the cloak goes on when a monster is near and off when it is clear
  function tryBeacon(m) {
    if (opts.nobeacons || g.BC.have <= 0 || g.myCarry() >= 0 || g.BC.list.some(b => b.scene === g.S.id && performance.now() / 1000 < b.until)) return false;
    const d = dist(m.pos.x, m.pos.z); if (d < 7 || d > 22 || !m.onFloorY(g.P.p.y)) return false;
    const keep = g.P.yaw; face(m.pos.x, m.pos.z);
    if (g.throwBeacon()) { B.beacons++; return true; }
    g.P.yaw = keep; return false;
  }
  function cloakLogic(near, chaser) {
    if (opts.nocloak || !g.CL.have) return;
    const want = !!chaser || near < 14;
    if (want && !g.CL.st.on && g.CL.st.b > 0.4) g.toggleCloak(); else if (!want && g.CL.st.on) g.toggleCloak();
    if (g.CL.st.on) B.cloakS += 0.05;
  }
  function wantLoot() {                                                        // true while the bot is on its way to a locker (no gun yet) or a close ammo pack (low on rounds)
    if (opts.nogun) return false;
    const v = g.LT.vis, st = g.LT.st[g.S.id]; if (!v || !st) return false;
    const F = fields();
    const free = (items, list, kind) => items.map((it, i) => list[i] === 0 ? {i, x: it.home[0], z: it.home[1]} : null).filter(Boolean).filter(it => !claimed(kind, it.i));
    let kind = null, items = [];
    if (!g.LT.gun && v.lockers.length) { kind = "locker"; items = free(v.lockers, st.lockers, kind); }
    else {
      if (!opts.nobeacons && g.BC.have < 2 && v.beacons) { kind = "beacon"; items = free(v.beacons, st.beacons || [], kind).filter(it => { const c = cellOf(it.x, it.z); return c >= 0 && F.bot.d[c] < 20; }); }
      if (!items.length && g.LT.gun && g.LT.rounds < 6) { kind = "pack"; items = free(v.packs, st.packs, kind).filter(it => { const c = cellOf(it.x, it.z); return c >= 0 && F.bot.d[c] < 22; }); }
    }
    if (!items.length) return false;
    const it = pickNearest(items, kind); if (!it) return false;
    if (walkTo(it.x, it.z, 1.2)) { face(it.x, it.z); g.tryLoot(); }
    return true;
  }
  // ---- the team
  const mates = () => (window.__bb || []).filter(b => b.idx !== idx && b.floor === g.S.id);
  const runnerPos = () => { const r = mates().find(b => b.role === "runner" && !b.dead); return r ? [r.x, r.z] : null; };
  const hasRunner = () => B.role === "runner" || mates().some(b => b.role === "runner" && !b.dead);
  const claimed = (kind, i) => mates().some(b => b.claim && b.claim.k === kind && b.claim.i === i);
  function pickNearest(items, kind) {                                       // [{i, x, z}] -> the free one nearest by path, claimed for the team
    const F = fields(); let best = null, bd = Infinity;
    for (const it of items) { if (claimed(kind, it.i)) continue; const c = cellOf(it.x, it.z), d = c >= 0 ? F.bot.d[c] : Infinity; if (d < bd) { bd = d; best = it; } }
    if (!best) best = items[0] || null;
    B.claim = best ? {k: kind, i: best.i} : null; return best;
  }
  function lureSpot() {                                                     // a visible cell 9..13 m from the monster that threatens the runner most, with room to run
    const F = fields(), rp = runnerPos(); if (!F.mons.length) return null;
    let tgt = F.mons[0];
    if (rp) { const rc = cellOf(rp[0], rp[1]); let bt = Infinity; for (const k of F.mons) { const t = rc >= 0 ? k.f.d[rc] / k.v : Infinity; if (t < bt) { bt = t; tgt = k; } } }
    if (now() - B.lureAt < 3 && B.lure && B.lure.k === tgt.m) return B.lure;
    const cands = []; const mx = tgt.m.pos.x, mz = tgt.m.pos.z, my = tgt.m.fy + 1.6;
    for (let c = 0; c < CELLS; c++) {
      const db = F.bot.d[c]; if (db === Infinity || db > 40) continue;
      const [x, z] = xz(c), e = Math.hypot(x - mx, z - mz); if (e < 9 || e > 13) continue;
      if (margin(F, c) < 2 || !g.segClear(mx, my, mz, x, g.S.floor + 1.4, z, 0.5)) continue;
      cands.push([db, x, z]);
    }
    cands.sort((a, b) => a[0] - b[0]); const pick = cands[Math.floor(Math.random() * Math.min(5, cands.length))];
    B.lureAt = now(); B.lure = pick ? {x: pick[1], z: pick[2], k: tgt.m} : null; return B.lure;
  }
  function standby() {                                                      // the scout's post: a safe cell 3 to 7 m from the stairs
    const d = g.upDoor(); if (!d) return null;
    const F = fields(); let best = null, bd = Infinity;
    for (let c = 0; c < CELLS; c += 2) {
      if (F.bot.d[c] === Infinity) continue; const [x, z] = xz(c), e = Math.hypot(x - d.cx, z - d.cz); if (e < 3 || e > 7 || margin(F, c) < 2) continue;
      if (F.bot.d[c] < bd) { bd = F.bot.d[c]; best = [x, z]; }
    }
    return best || [d.cx, d.cz];
  }
  function goUp() {
    const d = g.upDoor(); if (!d) return;
    if (walkTo(d.cx, d.cz, 1.3)) { face(d.cx, d.cz); g.useDoor(); }
  }
  function openNear() { for (const dr of g.doors) if (!dr.link && dr.target === 0 && Math.abs(dr.cy - g.P.p.y) < 1.5 && dist(dr.cx, dr.cz) < 1.5) { g.openDoor(dr, true); return; } }

  function decide() {
    const id = g.S.id, st = g.FZ.st;
    known();                                                           // keep the team's blackboard fresh with what this bot sees
    if (g.FIN.out) { stop(); return; }
    if (g.reviveTarget()) { stop(); g.keys.KeyE = true; B.hold += 0.05; return; }
    if (B.hold > 3.5) B.revives++; B.hold = 0; g.keys.KeyE = false;
    openNear();
    // what is around: sneak when a monster that has not noticed us is near; run only when nothing is near
    let near = 99, chaser = null;
    for (const m of known()) { if (!m.onFloorY(g.P.p.y)) continue; const d = dist(m.pos.x, m.pos.z); if (d < near) near = d; if (m.state === "chase" && d < 22 && (!chaser || d < dist(chaser.pos.x, chaser.pos.z))) chaser = m; }
    if (g.HP.h.hp < B.hp - 1) B.hurts++; B.hp = g.HP.h.hp;
    if (!chaser && g.HP.h.hp < 50) for (const m of known()) if (m.onFloorY(g.P.p.y) && dist(m.pos.x, m.pos.z) < 16 && m.state !== "patrol") chaser = m;           // hurt: do not wait for it to charge
    cloakLogic(near, chaser);
    B.sneak = near < 12 && !chaser; B.runOk = near > 20 && g.P.stam > 0.5;
    const role = hasRunner() ? B.role : "runner";
    if (chaser) { B.claim = null; if (!tryBeacon(chaser)) tryShoot(); if (flee(role === "bait" ? runnerPos() : null)) return; }
    else if (B.hide && now() < B.hide.until) { stop(); g.P.crouch = true; return; }          // out of sight: keep still and quiet until it gives up
    // a teammate is down: lift them if the way there is safe
    const down = mates().find(b => b.dead);
    if (down) { const F = fields(), c = cellOf(down.x, down.z); if (c >= 0 && F.bot.d[c] < 60 && margin(F, c) >= 0) { if (walkTo(down.x, down.z, 1.0)) { face(down.x, down.z); } return; } }
    B.claim = null;
    if (wantLoot()) return;
    if (role === "bait") { const l = lureSpot(); if (l) { if (walkTo(l.x, l.z, 1.0)) { stop(); } return; } }
    if (role === "scout") {
      const d = g.upDoor(), locked = d && g.isLocked(d);
      if (id === "L3" && !g.POWER.on && g.S.pw) { const [x, z] = g.S.pw.spot; if (walkTo(x, z + 1.0, 0.8)) { face(x, z); g.tryPower(); } return; }
      if (id === "L2") { const k = g.KP.st.L2; if (k && !k.solved && k.found.every(v => v !== null)) { if (walkTo(d.cx, d.cz, 1.6) && now() - (B.tried || 0) > 2) { B.tried = now(); g.kpAct({a: "try", code: k.found.join("")}); } return; } }
      if (id === "L4") { /* everyone leaves by the doors */ }
      else if (locked) { const s = standby(); if (s && !walkTo(s[0], s[1], 1.5)) return; stop(); return; }
    }
    // runner work (also done by anyone with no runner on the floor)
    if (id === "B1") {
      const door = g.upDoor(), v = g.FZ.vis, fs = st.B1 || [];
      if (door && g.isLocked(door)) {
        if (g.myCarry() >= 0) { B.claim = {k: "carry", i: g.myCarry()}; if (walkTo(door.cx, door.cz, 1.6)) { face(door.cx, door.cz); g.fuseAct({a: "slot"}); } return; }
        const items = fs.map((f, i) => f && (f.s === 0 || f.s === 3) ? {i, x: f.s === 3 ? f.x : v.items[i].home[0], z: f.s === 3 ? f.z : v.items[i].home[1]} : null).filter(Boolean);
        const it = pickNearest(items, "fuse"); if (!it) { stop(); return; }
        if (walkTo(it.x, it.z, 1.1)) { face(it.x, it.z); g.tryFuse(); }
      } else goUp();
    } else if (id === "L1") {
      const sw = g.SW.st.L1 || [], items = sw.map((s, i) => s && !s.on ? {i, x: g.FZ.vis.sws[i].home[0], z: g.FZ.vis.sws[i].home[1]} : null).filter(Boolean);
      if (items.length) { const it = pickNearest(items, "switch"); if (walkTo(it.x, it.z, 1.2)) { face(it.x, it.z); g.trySwitch(); } } else goUp();
    } else if (id === "L2") {
      const k = g.KP.st.L2; if (!k) return;
      const items = k.found.map((d, i) => d === null ? {i, x: g.FZ.vis.notes[i].home[0], z: g.FZ.vis.notes[i].home[1]} : null).filter(Boolean);
      if (k.solved) goUp();
      else if (items.length) { const it = pickNearest(items, "note"); if (walkTo(it.x, it.z, 1.2)) { face(it.x, it.z); g.tryNote(); } }
      else { const d = g.upDoor(); if (walkTo(d.cx, d.cz, 1.6) && now() - (B.tried || 0) > 2) { B.tried = now(); g.kpAct({a: "try", code: k.found.join("")}); } }
    } else if (id === "L3") {
      if (!g.POWER.on && g.S.pw && role === "runner" && idx % 2 === 0) { const [x, z] = g.S.pw.spot; if (walkTo(x, z + 1.0, 0.8)) { face(x, z); g.tryPower(); } } else goUp();
    } else if (id === "L4") {
      if (!g.POWER.on && g.S.pw) { const [x, z] = g.S.pw.spot; if (walkTo(x + 1.2, z, 0.8)) { face(x, z); g.tryPower(); } }
      else walkTo(0, g.EXIT_Z + 1.2, 0.3);
    }
  }
  setInterval(() => {
    const t = performance.now(), gap = t - B.last, dt = Math.min(0.1, gap / 1000); B.last = t;
    B.perf = B.perf || {n: 0, sum: 0, max: 0, over150: 0, over500: 0}; B.perf.n++; B.perf.sum += gap; B.perf.max = Math.max(B.perf.max, gap); if (gap > 150) B.perf.over150++; if (gap > 500) B.perf.over500++;
    if (!g.loading) {
      const id = g.S.id; B.floors[id] ||= {in: (t - g.FIN.t0) / 1000, out: null, downs: 0};
      for (const k in B.floors) if (k !== id && B.floors[k].out === null) B.floors[k].out = (t - g.FIN.t0) / 1000;
      if (B.floors[id].out !== null) B.floors[id].out = null;
      if (g.dead && !B.was) {
        B.downs++; B.floors[id].downs++;
        if (B.deaths.length < 8) B.deaths.push({at: +((t - g.FIN.t0) / 1000).toFixed(0), up: +((t - (B.upAt || g.FIN.t0)) / 1000).toFixed(1), x: +g.P.p.x.toFixed(1), z: +g.P.p.z.toFixed(1), run: g.P.running, role: B.role,
          mons: g.monsters.map(m => ({d: +Math.hypot(m.pos.x - g.P.p.x, m.pos.z - g.P.p.z).toFixed(1), s: m.state})).sort((p, q) => p.d - q.d).slice(0, 2)});
      }
      if (!g.dead && B.was) B.upAt = t;
      if (g.LT.gun && B.armedAt === null) B.armedAt = (t - g.FIN.t0) / 1000;
      B.was = g.dead;
      if (g.dead) stop(); else decide();
      B.pub = {seen: B.seenNow || [], idx, role: B.role, floor: id, x: g.P.p.x, z: g.P.p.z, dead: g.dead, claim: B.claim};
    }
    g.sim(dt, t / 1000);
  }, 50);
}
