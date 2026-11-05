import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {worldFromDoc, FLOORS, mainRegion, cellXZ, cellOf, segClear, rng32, near} from "./world.js";
import {MonsterSim, spawnPlan, resolveShot, rayMonster, banishSpot, CHASE_LOSE_S, SEARCH_S, GLITCH_S, BANISH_FROM_PLAYER} from "./monsters.js";

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const monCfg = json("../world/monsters.json"), cfgOf = name => monCfg.monsters.find(m => m.name === name);
const mkWorld = id => worldFromDoc(json(`../world/${id}.json`), id);
const faceTo = (m, x, z) => { m.yaw = Math.atan2(-(x - m.pos.x), -(z - m.pos.z)); };
function mkEnv(W, seed = 1) { const env = {W, t: 100, rnd: rng32(seed), opened: [], now() { return this.t; }, openDoor(dr) { this.opened.push(dr); dr.target = 1; }}; return env; }
function tick(m, env, targets, secs, dt = 0.05, lures = []) { let caught = []; for (let t = 0; t < secs - 1e-9; t += dt) { env.t += dt; caught = caught.concat(m.update(dt, targets, lures).caught); } return caught; }
// two walkable spots d metres apart with a clear straight line at eye height
function clearPair(W, d, seed = 3) {
  const cells = mainRegion(W), r = rng32(seed), inRegion = new Set(cells);
  for (let i = 0; i < 4000; i++) {
    const [x, z] = cellXZ(cells[Math.floor(r() * cells.length)]), a = r() * 6.28, x2 = x + Math.cos(a) * d, z2 = z + Math.sin(a) * d;
    if (!inRegion.has(cellOf(x2, z2))) continue;                          // both ends are on the floor's walkable main region
    if (segClear(W, x, W.floor + 1.6, z, x2, W.floor + 1.4, z2, 0) && cellXZ && near(W, x2, z2, 0.1)) {
      const open = [0.3, 0.6, 0.9].every(u => segClear(W, x, W.floor + 1.0, z, x + (x2 - x) * u, W.floor + 1.0, z + (z2 - z) * u, 0));
      if (open) return [[x, z], [x2, z2]];
    }
  }
  throw new Error("no clear pair of " + d + " m");
}
const player = (p, o = {}) => ({id: 1, x: p[0], y: 0, z: p[1], crouch: false, moving: false, run: false, carry: false, cloak: false, ...o});
function setup(d = 8, name = "sinew", level = "B1") {
  const W = mkWorld(level), env = mkEnv(W), [a, b] = clearPair(W, d), m = new MonsterSim(cfgOf(name), level, a[0], a[1], env);
  m.state = "patrol"; m.wait = 99; faceTo(m, b[0], b[1]); const t = player(b, {y: W.floor}); return {W, env, m, a, b, t};
}

test("sight: 8 m in front it sees you; crouching halves the range; behind it, it does not; a cloak hides you beyond 1.5 m but not at 1 m", () => {
  const {m, t} = setup(8); assert.ok(m.sees(t), "8 m, standing");
  const wide = setup(11); assert.ok(wide.m.sees(wide.t), "11 m standing is inside 16"); assert.ok(!wide.m.sees({...wide.t, crouch: true}), "11 m crouching is outside 8");
  assert.ok(wide.m.sees({...wide.t, crouch: true, carry: true}), "a crouching carrier is seen from 12 (three quarters of 16)");
  assert.ok(!m.sees({...t, cloak: true}), "cloaked at 8 m");
  const close = setup(1.2); assert.ok(close.m.sees({...close.t, cloak: true}), "cloaked at 1.2 m is still seen");
  m.yaw += Math.PI; assert.ok(!m.sees(t), "it is facing away"); m.yaw += Math.PI;
  assert.ok(!m.sees({...t, y: t.y + 5}), "another floor");
});
test("a monster that sees you chases, runs to where it last saw you, gives up after 2.5 s, searches 6 s, then patrols", () => {
  const {m, env, t} = setup(7); tick(m, env, [t], 0.2); assert.equal(m.state, "chase"); assert.equal(m.tgt, 1);
  tick(m, env, [], CHASE_LOSE_S + 0.5); assert.equal(m.state, "search", "it lost sight");
  tick(m, env, [], SEARCH_S + 14); assert.equal(m.state, "patrol", "and gave up");
});
test("hearing: running is heard from afar, walking from half as far, crouching not at all, a crouching carrier a little", () => {
  const W = mkWorld("B1"), [a, b] = clearPair(W, 8);
  const heard = (mode, d) => { const m = new MonsterSim(cfgOf("sinew"), "B1", a[0], a[1], mkEnv(W)); m.wait = 99; const dx = b[0] - a[0], dz = b[1] - a[1], k = d / Math.hypot(dx, dz);
    m.yaw = Math.atan2(dx, dz);                                                        // facing away from the player: only its ears can tell
    const t = player([a[0] + dx * k, a[1] + dz * k], {y: W.floor, moving: true, ...mode}); m.update(0.05, [t]); return m.state === "search"; };
  assert.ok(heard({run: true}, 7), "running at 7 m (range 9)"); assert.ok(!heard({run: true}, 12), "running at 12 m is too far");
  assert.ok(!heard({}, 7), "walking at 7 m is too far (range 4.5)"); assert.ok(heard({}, 4), "walking at 4 m");
  assert.ok(!heard({crouch: true}, 3), "crouching is silent");
  assert.ok(heard({crouch: true, carry: true}, 3), "a crouching carrier is heard at 3 m (range 3.6)"); assert.ok(!heard({crouch: true, carry: true}, 5), "but not at 5 m");
});
test("a monster touching you hits once per gap, not every frame", () => {
  const {m, env, t} = setup(6); m.pos.set(t.x - 0.4, m.fy, t.z); faceTo(m, t.x, t.z);
  const first = tick(m, env, [t], 0.1); assert.deepEqual(first, [1]);
  assert.deepEqual(tick(m, env, [t], 0.5), [], "still inside the 1.2 s gap"); assert.deepEqual(tick(m, env, [t], 0.8), [1], "and again after it");
});
test("a stair door is never used: a path that runs into one is given up", () => {
  const {W, m, env} = setup(6); const door = {d: {name: "x"}, box: {off: false}, target: 0, link: {scene: "L1"}, cx: m.pos.x + 0.9, cz: m.pos.z, cy: m.fy};
  W.doors.push(door); m.state = "search"; m.path = [[m.pos.x + 3, m.pos.z]]; m.wait = 0; tick(m, env, [], 0.1);
  assert.equal(m.path.length, 0); assert.equal(env.opened.length, 0);
  const plain = {...door, link: null, cx: m.pos.x + 0.9}; W.doors.length = 0; W.doors.push(plain); m.path = [[m.pos.x + 3, m.pos.z]]; tick(m, env, [], 0.7);
  assert.ok(env.opened.includes(plain), "an ordinary door they open (after half a second)");
});
test("an AFK Beacon pulls monsters in range, ignores far players, still notices a close one, and ends in a search", () => {
  const {W, m, env, a, b} = setup(14); const can = {id: 1, x: b[0], z: b[1], until: env.t + 60};
  const far = player([a[0] - 3, a[1] - 3], {y: W.floor}); m.state = "patrol"; m.wait = 99;
  tick(m, env, [far], 3, 0.05, [can]); assert.equal(m.lureId, 1); assert.equal(m.state, "search");
  tick(m, env, [far], 50, 0.05, [can]); assert.ok(Math.hypot(m.pos.x - can.x, m.pos.z - can.z) < 4, "it is round the can");
  env.t = can.until + 1; tick(m, env, [], 0.1, 0.05, [can]); assert.equal(m.lureId, null); assert.equal(m.state, "search", "then it searches there");
  tick(m, env, [], SEARCH_S + 14); assert.equal(m.state, "patrol");
    // a player 3 m from a lured monster, in front of it, is still noticed
  const s2 = setup(10), can2 = {id: 3, x: s2.b[0], z: s2.b[1], until: s2.env.t + 25};
  tick(s2.m, s2.env, [], 2, 0.05, [can2]); assert.equal(s2.m.lureId, 3);
  const near3 = player([s2.m.pos.x - Math.sin(s2.m.yaw) * 3, s2.m.pos.z - Math.cos(s2.m.yaw) * 3], {y: s2.W.floor}); tick(s2.m, s2.env, [near3], 0.3, 0.05, [can2]);
  assert.equal(s2.m.state, "chase", "within 4 m it still sees the player");
});
test("the ray: a hit banishes the monster at least 15 m from every player and out of their sight; an immune or already glitching one is ignored", () => {
  const {W, m, env, a, b} = setup(8); m.wait = 0;
  const o = [b[0], W.floor + 1.5, b[1]], d = (() => { const dx = a[0] - b[0], dz = a[1] - b[1], L = Math.hypot(dx, dz); return [dx / L, 0, dz / L]; })();
  assert.ok(rayMonster(W, [m], o, d), "the monster is in the line of fire");
  const shooter = [{x: b[0], y: W.floor, z: b[1]}], r = resolveShot(W, [m], shooter, o, d, env.rnd); assert.ok(r, "banished");
  assert.ok(Math.hypot(r.to[0] - b[0], r.to[1] - b[1]) >= BANISH_FROM_PLAYER); assert.ok(m.glitchT > 0 && m.immuneT > 0 && m.state === "patrol");
  m.pos.set(a[0], m.fy, a[1]); assert.equal(resolveShot(W, [m], shooter, o, d, env.rnd), null, "immune now");
  assert.ok(banishSpot(W, shooter, env.rnd));
  tick(m, env, [], GLITCH_S + 0.2); assert.ok(m.glitchT <= 0);
});
test("the same inputs give the same monsters, and a seeded spawn plan is the same everywhere", () => {
  const run = () => { const W = mkWorld("B1"), env = mkEnv(W, 9), plan = spawnPlan(W, monCfg, "B1"), ms = plan.map(p => new MonsterSim(p.cfg, "B1", p.x, p.z, env)); for (let i = 0; i < 400; i++) { env.t += 0.05; ms.forEach(m => m.update(0.05, [])); } return ms.map(m => m.snapshot()); };
  assert.deepEqual(run(), run()); assert.equal(spawnPlan(mkWorld("B1"), monCfg, "B1").length, 4); assert.equal(spawnPlan(mkWorld("L3"), monCfg, "L3").length, 0);
  assert.deepEqual(spawnPlan(mkWorld("B1"), monCfg, "B1").map(p => [p.x, p.z]), spawnPlan(mkWorld("B1"), monCfg, "B1").map(p => [p.x, p.z]));
});
