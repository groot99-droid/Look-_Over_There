// Solo-mode regression: no room, no server involvement in the rules. Checks the fuse rules offline, the old die-and-respawn rule,
// and the optional models/fuse.glb loader (with and without the file).
// Usage: node tools/solo_test.mjs      (needs Playwright + Chromium and internet for three.js from unpkg)
import {createRequire} from "node:module";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) failed++; };
const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const errors = [];
async function solo(port) {
  const page = await (await browser.newContext({viewport: {width: 900, height: 700}})).newPage();
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`); await page.click("#l-solo");
  await page.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 240000});
  return page;
}
const until = (name, page, fn, arg) => page.waitForFunction(fn, arg, {timeout: 60000, polling: 200}).then(() => check(name, true), () => check(name, false));

// a second root that has a models/fuse.glb (a stand-in model), made from symlinks so nothing in the repo changes
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lot-")); fs.mkdirSync(path.join(tmp, "models"));
for (const n of ["index.html", "world", "monsters", "characters", "shared"]) fs.symlinkSync(path.join(here, n), path.join(tmp, n));
fs.copyFileSync(path.join(here, "characters", "shorts.glb"), path.join(tmp, "models", "fuse.glb"));
const plain = await createServer({countdownMs: 60000}), withModel = await createServer({root: tmp, countdownMs: 60000});
try {
  const p = await solo(plain.port);
  check("solo: no room, you are the host", await p.evaluate(() => !window.__game.net.on && window.__game.net.host()));
  check("solo: three fuses and a locked stair door on B1", await p.evaluate(() => { const g = window.__game; return g.FZ.vis.items.length === 3 && g.isLocked(g.upDoor()); }));
  check("without models/fuse.glb the placeholder stays", await p.evaluate(() => !window.__game.FZ.vis.items[0].o.userData.model));
  // a monster that loses sight runs to where it last saw you (not to where you are now) and gives up soon; running tires you
  const chase = await p.evaluate(() => {
    const g = window.__game, m = g.monsters[0]; m.los = () => true; m.state = "patrol"; m.path = [];
    const f = d => ({id: 99, x: m.pos.x - Math.sin(m.yaw) * d, y: m.fy, z: m.pos.z - Math.cos(m.yaw) * d, crouch: false, moving: false});
    const seen = f(6); m.update(0.01, [seen]); const started = m.state;
    const gone = {id: 99, x: m.pos.x + 40, y: m.fy, z: m.pos.z + 40, crouch: false, moving: false};            // far outside its sight
    m.update(0.4, [gone]); const stillChasing = m.state === "chase", lastOk = Math.hypot(m.last[0] - seen.x, m.last[1] - seen.z) < 0.01;
    for (let i = 0; i < 30; i++) m.update(0.1, [gone]);
    const gaveUp = m.state !== "chase"; delete m.los; return {started, stillChasing, lastOk, gaveUp};
  });
  check("a monster chases what it saw, to the spot it last saw it", chase.started === "chase" && chase.stillChasing && chase.lastOk, JSON.stringify(chase));
  check("and gives up within a few seconds of losing sight", chase.gaveUp);
  const stam = await p.evaluate(() => {
    const g = window.__game; g.P.imm = 99; g.keys.KeyW = true; g.keys.KeyR = true; let n = 0;
    while (g.P.stam > 0 && n++ < 200) g.update(0.05);
    const tired = g.P.tired && !g.P.running, secs = n * 0.05;
    g.keys.KeyR = false; for (let i = 0; i < 20; i++) g.update(0.05); const stillTired = g.P.tired;           // 1 s of recovery: not yet back to the resume level
    for (let i = 0; i < 20; i++) g.update(0.05); const back = !g.P.tired;                                       // 2 s in: running is allowed again
    g.keys.KeyW = false; return {tired, secs, stillTired, back};
  });
  check("running lasts about 4 s, then you are tired", stam.tired && Math.abs(stam.secs - 4) < 0.3, JSON.stringify(stam));
  check("you can run again after a short recovery", stam.stillTired && stam.back);
  const load = id => p.evaluate(i => window.__game.loadScene(i), id).then(() => p.waitForFunction(i => window.__game.S.id === i && !window.__game.loading, id, {timeout: 60000}));
  const at = i => p.evaluate(i => { const g = window.__game, f = g.FZ.st.B1[i]; return f.s === 3 ? [f.x, f.z] : g.FZ.vis.items[i].home; }, i);
  const go = xz => p.evaluate(t => { const g = window.__game; g.P.p.set(t[0], g.S.floor + 0.02, t[1]); g.P.v.set(0, 0, 0); }, xz);
  // guns and ammo: 8 lockers (one gun each) and 3 packs on B1; 3 rounds from a gun, +3 a pack, 9 at most
  const loot = await p.evaluate(() => {
    const g = window.__game, v = g.LT.vis, pts = [...v.lockers, ...v.packs].map(i => i.home); let min = 99;
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) min = Math.min(min, Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]));
    return {lockers: v.lockers.length, packs: v.packs.length, min: +min.toFixed(1), gun: g.LT.gun};
  });
  check("B1 has 8 lockers and 3 ammo packs, none on top of another", loot.lockers === 8 && loot.packs === 3 && loot.min >= 1.4 && !loot.gun, JSON.stringify(loot));
  const stand = (kind, i) => p.evaluate(([k, i]) => { const g = window.__game, it = g.LT.vis[k][i]; g.P.p.set(it.home[0] + 0.5, g.S.floor + 0.02, it.home[1]); g.P.v.set(0, 0, 0); g.step(0.016); return document.getElementById("prompt").textContent; }, [kind, i]);
  check("beside a locker the prompt offers it", /open the locker/.test(await stand("lockers", 0)));
  await p.evaluate(() => window.__game.tryLoot());
  check("opening a locker gives the gun with 3 rounds", await p.evaluate(() => { const g = window.__game; g.step(0.016); return g.LT.gun && g.LT.rounds === 3 && g.LT.st.B1.lockers[0] === 1 && /RAY.*3\/9/.test(document.getElementById("ammo").textContent); }));
  await stand("lockers", 1); await p.evaluate(() => window.__game.tryLoot());
  check("a second locker is refused: one gun each", await p.evaluate(() => { const g = window.__game; return g.LT.rounds === 3 && g.LT.st.B1.lockers[1] === 0; }));
  const picked = [];
  for (const i of [0, 1, 2]) { await stand("packs", i); await p.evaluate(() => window.__game.tryLoot()); picked.push(await p.evaluate(() => window.__game.LT.rounds)); }
  check("each pack adds 3 rounds, and nobody carries more than 9", picked.join() === "6,9,9", picked.join());
  check("a pack you cannot carry stays on the floor", await p.evaluate(() => window.__game.LT.st.B1.packs.filter(v => v === 0).length === 1));
  // the gun: held, fired, a hit banishes the monster far away and out of sight, a shot is as loud as a run
  await p.waitForFunction(() => window.__game.GUN.obj, null, {timeout: 60000});
  check("the gun is held once you have one (the Meshy model, not the placeholder)", await p.evaluate(() => { const g = window.__game; g.step(0.016); return g.GUN.pivot.visible && g.GUN.obj.isGroup === true; }));
  const shot = await p.evaluate(() => {
    const g = window.__game, m = g.monsters[0]; m.cfg = {...m.cfg, patrol: 0, alert: 0, chase: 0};          // keep it still
    const eye = [g.P.p.x, g.P.p.y + g.P.eye, g.P.p.z]; let spot = null;
    for (let a = 0; a < 6.28 && !spot; a += 0.35) { const d = [-Math.sin(a), 0, -Math.cos(a)], x = g.P.p.x + d[0] * 6, z = g.P.p.z + d[2] * 6; if (g.rayClear(eye, d, 7) && g.S.nav[g.cellOf(x, z)]) spot = {a, x, z}; }
    if (!spot) return null;
    m.pos.set(spot.x, m.fy, spot.z); m.state = "patrol"; g.P.yaw = spot.a; g.P.pitch = 0; g.P.imm = 999; g.GUN.cool = 0;
    const rounds = g.LT.rounds, fired = g.fire(), moved = Math.hypot(m.pos.x - spot.x, m.pos.z - spot.z), away = Math.hypot(m.pos.x - g.P.p.x, m.pos.z - g.P.p.z);
    const path = g.astar(g.S.nav, g.cellOf(g.P.p.x, g.P.p.z), g.cellOf(m.pos.x, m.pos.z)), pathM = path ? path.length * g.NAV : 999;            // the rule: 35 m by path from the player
    const hidden = !g.segClear(g.P.p.x, g.P.p.y + 1.5, g.P.p.z, m.pos.x, g.S.floor + 1.4, m.pos.z, 0.5);                                             // and out of the player's sight
    return {fired, spent: rounds - g.LT.rounds, moved: +moved.toFixed(1), away: +away.toFixed(1), pathM: +pathM.toFixed(1), hidden, glitch: m.glitchT > 0, immune: m.immuneT > 0, state: m.state, loud: g.P.shotT > 0, spot};
  });
  check("a shot spends a round and a hit deletes the monster to a spot 15 m+ away, 35 m+ by path, out of sight", !!shot && shot.fired && shot.spent === 1 && shot.moved > 5 && shot.away >= 15 && shot.pathM >= 35 && shot.hidden && shot.glitch && shot.state === "patrol", JSON.stringify(shot));
  check("the banished monster cannot be banished again for a while, and the shot was as loud as a run", !!shot && shot.immune && shot.loud);
  const again = await p.evaluate(sp => {
    const g = window.__game, m = g.monsters[0]; g.GUN.cool = 0; m.pos.set(sp.x, m.fy, sp.z); const before = [m.pos.x, m.pos.z], rounds = g.LT.rounds;
    g.fire(); return {spent: rounds - g.LT.rounds, stayed: Math.hypot(m.pos.x - before[0], m.pos.z - before[1]) < 0.01};
  }, shot.spot);
  check("a second shot at it is wasted: the round is spent, the monster stays", again.spent === 1 && again.stayed);
  const dry = await p.evaluate(() => { const g = window.__game; g.GUN.cool = 0; const keep = g.LT.rounds; g.LT.rounds = 0; const f = g.fire(); g.LT.rounds = keep; return f; });
  check("with no rounds the gun does not fire", dry === false);
  check("firing is limited to one shot every 0.6 s", await p.evaluate(() => { const g = window.__game; g.GUN.cool = 0; const a = g.fire(), b = g.fire(); g.GUN.cool = 0; return a === true && b === false; }));
  await go(await at(0)); await p.keyboard.press("KeyE");
  await until("pressing E picks up the fuse", p, () => window.__game.myCarry() === 0);
  await p.evaluate(() => window.__game.step(0.016));
  check("the counter shows you are carrying", await p.evaluate(() => /CARRYING/.test(document.getElementById("fusehud").textContent)));
  check("with a fuse in your hands you cannot fire", await p.evaluate(() => { const g = window.__game; g.GUN.cool = 0; const before = g.LT.rounds, f = g.fire(); return f === false && g.LT.rounds === before; }));
  // down with a fuse in hand: it stays where you fell; the old solo rule still applies (3 s, then back up somewhere random)
  await p.evaluate(() => window.__game.die());
  const drop = await p.evaluate(() => { const f = window.__game.FZ.st.B1[0]; return {s: f.s, near: Math.hypot(f.x - window.__game.P.p.x, f.z - window.__game.P.p.z) < 0.01}; });
  check("a downed carrier drops the fuse where they fell", drop.s === 3 && drop.near);
  const respawn = await p.evaluate(() => { const g = window.__game; let n = 0; while (g.dead && n < 200) { g.update(0.05); n++; } return +(n * 0.05).toFixed(2); });
  check("solo respawn is still about 3 s", respawn > 3 && respawn < 3.6, `(${respawn} s)`);
  // health: 100 HP, 35 a hit, a second of grace, a hit from one monster at most every 1.2 s, regeneration after 10 s, three hits down you
  const hp1 = await p.evaluate(() => { const g = window.__game; return {hp: g.HP.h.hp, imm: g.P.imm}; });
  check("after the respawn you have full health", hp1.hp === 100);
  const hp2 = await p.evaluate(() => { const g = window.__game; g.HP.h.hurtAt = -Infinity; g.applyHit(35); const a = g.HP.h.hp; g.applyHit(35); return [a, g.HP.h.hp]; });
  check("a hit takes 35 and a second hit inside the grace second takes nothing", hp2[0] === 65 && hp2[1] === 65, JSON.stringify(hp2));
  const hp3 = await p.evaluate(() => { const g = window.__game; g.HP.h.hurtAt = performance.now() / 1000 - 5; for (let i = 0; i < 40; i++) g.update(0.05); const early = g.HP.h.hp; g.HP.h.hurtAt = performance.now() / 1000 - 11; for (let i = 0; i < 40; i++) g.update(0.05); return [early, g.HP.h.hp]; });
  check("no regeneration before 10 s, then about +1 per second", hp3[0] === 65 && hp3[1] > 66.5 && hp3[1] < 67.5, JSON.stringify(hp3));
  const touch = await p.evaluate(() => { const g = window.__game; g.HP.h.hp = 100; g.HP.h.hurtAt = -Infinity; g.P.imm = 0; for (const m of g.monsters) { m.state = "patrol"; m.path = []; m.hitAt = {}; } const m = g.monsters[0]; m.pos.set(g.P.p.x + 0.3, m.fy, g.P.p.z); for (const q of g.monsters) if (q !== m) q.pos.set(g.P.p.x + 60, q.fy, g.P.p.z); g.update(0.05); const a = g.HP.h.hp; g.update(0.05); const b = g.HP.h.hp; return [a, b, g.dead]; });
  check("a touching monster hits for 35, once, and does not down you", touch[0] === 65 && touch[1] === 65 && touch[2] === false, JSON.stringify(touch));
  const three = await p.evaluate(() => { const g = window.__game; for (const m of g.monsters) m.pos.set(g.P.p.x + 80, m.fy, g.P.p.z); g.HP.h.hurtAt = -Infinity; g.applyHit(35); g.HP.h.hurtAt = -Infinity; g.applyHit(35); return [g.HP.h.hp, g.dead]; });
  check("the third hit downs you", three[0] === 0 && three[1] === true, JSON.stringify(three));
  await p.evaluate(() => { const g = window.__game; let n = 0; while (g.dead && n < 200) { g.update(0.05); n++; } });
  check("and you come back with full health", await p.evaluate(() => window.__game.HP.h.hp === 100));
  // spawns: weighted toward the fuses still to find, never within 16 m of a monster, and different every time
  const sp = await p.evaluate(() => { const g = window.__game; for (const m of g.monsters) { m.state = "patrol"; } const goals = g.floorGoals(), near = c => Math.min(...goals.map(q => Math.hypot(c[0] - q[0], c[2] - q[1])));
    const drawn = Array.from({length: 400}, () => g.spawnFor("B1")), tele = []; const cells = g.spawnFor.toString().length;
    const uni = Array.from({length: 400}, () => { const w = g.NAV; let c; do { c = Math.floor(Math.random() * g.NW * g.NH); } while (!g.S.nav[c]); const [x, z] = g.cellXZ ? g.cellXZ(c) : [0, 0]; return [x, 0, z]; });
    const med = a => a.sort((x, y) => x - y)[a.length >> 1], clear = drawn.every(c => g.monsters.every(m => Math.hypot(c[0] - m.pos.x, c[2] - m.pos.z) >= 16));
    return {goals: goals.length, medSpawn: med(drawn.map(near)), medUniform: med(uni.map(near)), clear, distinct: new Set(drawn.map(c => c.join())).size}; });
  check("spawns lean toward the fuses still to find (median distance under 0.7 of a uniform draw)", sp.goals === 3 && sp.medSpawn < 0.7 * sp.medUniform, JSON.stringify(sp));
  check("no spawn is within 16 m of a monster, and they differ", sp.clear && sp.distinct > 100, JSON.stringify(sp));
  // a fuse carried off the floor goes back to where it started
  await go(await at(1)); await p.keyboard.press("KeyE");
  await until("a fuse picked up on B1", p, () => window.__game.myCarry() === 1);
  await load("L1"); await load("B1");
  check("a fuse carried off B1 went back to its start", await p.evaluate(() => window.__game.FZ.st.B1[1].s === 0));
  for (let i = 0; i < 3; i++) {
    await go(await at(i)); await p.keyboard.press("KeyE");
    await until(`fuse ${i + 1} picked up`, p, () => window.__game.myCarry() >= 0);
    await p.evaluate(() => window.__game.openDoor(window.__game.upDoor(), true));
    await until(`fuse ${i + 1} in the door`, p, n => window.__game.FZ.st.B1.filter(f => f.s === 2).length === n + 1, i);
  }
  check("three fuses power the door", await p.evaluate(() => { const g = window.__game; g.step(0.016); return !g.isLocked(g.upDoor()) && /DOOR POWERED/.test(document.getElementById("fusehud").textContent); }));
  // L1 has switches instead: flip them one at a time, in any order; each clunk sends the monsters to look
  await load("L1");
  check("L1: two switches, no fuses, door locked", await p.evaluate(() => { const g = window.__game, v = g.FZ.vis; return v.sws.length === 2 && v.items.length === 0 && g.isLocked(g.upDoor()) && g.puzzle().kind === "SWITCHES"; }));
  const swAt = i => p.evaluate(i => window.__game.FZ.vis.sws[i].home, i);
  const s0 = await swAt(0), s1 = await swAt(1);
  check("the two switches are far apart", Math.hypot(s0[0] - s1[0], s0[1] - s1[1]) >= 14, `(${Math.hypot(s0[0] - s1[0], s0[1] - s1[1]).toFixed(1)} m)`);
  await p.evaluate(([x, z]) => { const g = window.__game; for (const m of g.monsters) { m.state = "patrol"; m.path = []; } const m = g.monsters[0]; m.pos.set(x + 8, m.fy, z); }, s1);     // one monster within earshot of switch 1
  await go(s1); await p.keyboard.press("KeyE");
  await until("flipping the second switch first works (any order)", p, () => { const st = window.__game.SW.st.L1; return !st[0].on && st[1].on; });
  check("one switch is not enough: the door stays locked", await p.evaluate(() => { const g = window.__game; g.step(0.016); return g.isLocked(g.upDoor()) && /SWITCHES 1\/2/.test(document.getElementById("fusehud").textContent); }));
  check("the clunk sent a monster to look", await p.evaluate(() => { const m = window.__game.monsters[0]; return m.state === "search" || m.state === "chase"; }));
  check("a flipped switch stays flipped (E again does not undo it)", await p.evaluate(() => { const g = window.__game; g.swAct(1); return g.SW.st.L1[1].on === true; }));
  await go(s0); await p.keyboard.press("KeyE");
  await until("the other switch is flipped one at a time", p, () => window.__game.SW.st.L1.every(x => x.on));
  check("both on: the door is powered", await p.evaluate(() => { const g = window.__game; g.step(0.016); return !g.isLocked(g.upDoor()) && /DOOR POWERED/.test(document.getElementById("fusehud").textContent); }));
  // L2 has a keypad: four notes, each with one digit of the code
  await load("L2");
  check("L2: four notes and a panel, no fuses or switches, door locked", await p.evaluate(() => { const g = window.__game, v = g.FZ.vis; return v.notes.length === 4 && v.pan.length === 2 && v.items.length === 0 && v.sws.length === 0 && g.isLocked(g.upDoor()) && g.puzzle().kind === "CODE"; }));
  const notes = await p.evaluate(() => window.__game.FZ.vis.notes.map(n => n.home));
  let near = 1e9; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) near = Math.min(near, Math.hypot(notes[i][0] - notes[j][0], notes[i][1] - notes[j][1]));
  check("the notes are spread out", near >= 8, `(closest pair ${near.toFixed(1)} m)`);
  const code = await p.evaluate(() => window.__game.KP.local.L2.code);                                  // solo: the game holds the code
  await go(notes[2]); await p.keyboard.press("KeyE");
  await until("reading note 3 shows its digit", p, d => window.__game.KP.st.L2.found[2] === d, code[2]);
  check("the others stay hidden, and the HUD shows what is known", await p.evaluate(() => { const g = window.__game; g.step(0.016); return g.KP.st.L2.found.filter(d => d !== null).length === 1 && /CODE _ _ \d _/.test(document.getElementById("fusehud").textContent); }));
  check("a note is read once", await p.evaluate(() => window.__game.nearNote() === -1));
  // the keypad: a wrong code is loud and locks it
  const doorAt = await p.evaluate(() => { const d = window.__game.upDoor(); return [d.cx, d.cz]; });
  await p.evaluate(([x, z]) => { const g = window.__game; for (const m of g.monsters) { m.state = "patrol"; m.path = []; } const m = g.monsters[0]; m.pos.set(x + 8, m.fy, z); g.openDoor(g.upDoor(), true); }, doorAt);
  check("using the locked door opens the keypad", await p.evaluate(() => window.__game.KPUI.open && getComputedStyle(document.getElementById("kp")).display === "flex"));
  const wrong = code.map(d => (d + 1) % 10).join("");
  await p.evaluate(w => { for (const c of w) window.__game.kpPress(c); window.__game.kpPress("OK"); }, wrong);
  await until("a wrong code counts as a fail and locks the keypad", p, () => { const v = window.__game.KP.st.L2; return v.fails === 1 && v.lockMs > 7000 && !v.solved; });
  check("the wrong code sent a monster to the door", await p.evaluate(() => { const m = window.__game.monsters[0]; return m.state === "search" || m.state === "chase"; }));
  await p.evaluate(c => { window.__game.KP.st.L2.until = performance.now() + 60000; for (const d of c) window.__game.kpPress(String(d)); window.__game.kpPress("OK"); }, code);     // hold the lock open: software rendering is slow enough to let the 8 s run out
  check("even the right code does nothing while it is locked", await p.evaluate(() => !window.__game.KP.st.L2.solved));
  await p.evaluate(() => { window.__game.KP.local.L2.lockUntil = 0; window.__game.KP.st.L2.until = 0; });          // skip the 8 s wait
  await p.keyboard.type(code.join("")); await p.keyboard.press("Enter");                                              // the keyboard works while it is up
  await until("the right code opens the door", p, () => window.__game.KP.st.L2.solved);
  check("the keypad closes and the door is powered", await p.evaluate(() => { const g = window.__game; g.step(0.016); return !g.KPUI.open && !g.isLocked(g.upDoor()) && /DOOR POWERED/.test(document.getElementById("fusehud").textContent); }));
  // L4: the store's glass doors are shut until the power is on; the far switch is the long way
  await load("L4");
  const l4 = await p.evaluate(() => { const g = window.__game, sp = g.farSwitchSpot(); return {shut: !!g.S.shutter && !g.S.shutter.off, blocked: !!g.collide({x: 0, y: g.S.floor + 0.3, z: 27.2}), glass: g.S.glass && g.S.glass.visible, spot: sp, power: g.POWER.on, hud: (g.step(0.016), document.getElementById("fusehud").textContent), navBefore: g.S.nav.reduce((n, v) => n + v, 0)}; });
  check("L4: the glass doors are shut and block the opening", l4.shut && l4.blocked && l4.glass === true && l4.power === false && /POWER OFF/.test(l4.hud));
  const far = Math.hypot(l4.spot[0] - 16, l4.spot[1] - 7.7);
  check("the L4 switch is on the far side of the room", far >= 30, `(${far.toFixed(1)} m from the stairs, at ${l4.spot.map(v => v.toFixed(1))})`);
  await p.evaluate(([x, z]) => { const g = window.__game; for (const m of g.monsters) { m.state = "patrol"; m.path = []; } const m = g.monsters[0]; m.pos.set(x + 10, m.fy, z); }, l4.spot);          // one monster within earshot
  await go([l4.spot[0] + 1.2, l4.spot[1]]); await p.keyboard.press("KeyE");
  await until("pressing E at the far switch turns the power on", p, () => window.__game.POWER.on && window.__game.POWER.by === "L4");
  check("the L4 switch is loud: a monster goes to look", await p.evaluate(() => { const m = window.__game.monsters[0]; return m.state === "search" || m.state === "chase"; }));
  check("the opening is clear, the glass is rolling up and monsters can use the way out", await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 120; i++) g.step(0.02); return !g.collide({x: 0, y: g.S.floor + 0.3, z: 27.2}) && !g.S.glass.visible && g.S.nav.reduce((n, v) => n + v, 0) > 0 && g.monsters.every(m => m.walk === g.S.nav); }));
  check("the way out opened more of the map to walk on", await p.evaluate(n => window.__game.S.nav.reduce((a, v) => a + v, 0) > n, l4.navBefore));
  await go([0, 21]); await p.keyboard.press("KeyE");
  check("the power cannot be thrown twice", await p.evaluate(() => window.__game.POWER.by === "L4"));
  await load("L1");
  check("coming back to L1 the switches are still on", await p.evaluate(() => window.__game.SW.st.L1.every(x => x.on) && !window.__game.isLocked(window.__game.upDoor())));

  // a fresh session: the quick way, the box on L3, then L4 is open on arrival and nothing was alarmed
  const r = await solo(plain.port);
  const rload = id => r.evaluate(i => window.__game.loadScene(i), id).then(() => r.waitForFunction(i => window.__game.S.id === i && !window.__game.loading, id, {timeout: 60000}));
  await rload("L3");
  check("L3: a power box, no monsters, power off", await r.evaluate(() => { const g = window.__game; g.step(0.016); return !!g.S.pw && g.monsters.length === 0 && !g.POWER.on && /POWER OFF/.test(document.getElementById("fusehud").textContent); }));
  check("L3 (no monsters) has 4 ammo packs to restock from", await r.evaluate(() => window.__game.packSpots().length === 4 && window.__game.LT.vis.packs.length === 4));
  await r.evaluate(() => { const g = window.__game, sp = g.S.pw.spot; g.P.p.set(sp[0], g.S.floor + 0.02, sp[1] + 1.4); g.P.v.set(0, 0, 0); g.P.yaw = 0; g.step(0.016); });
  check("the prompt appears at the box", await r.evaluate(() => /Press E to switch on the power/.test(document.getElementById("prompt").textContent)));
  await r.keyboard.press("KeyE");
  await r.waitForFunction(() => window.__game.POWER.on, null, {timeout: 30000}).then(() => check("pressing E at the L3 box turns the power on", true), () => check("pressing E at the L3 box turns the power on", false));
  await rload("L4");
  check("arriving on L4 the doors are already open", await r.evaluate(() => { const g = window.__game; return g.S.shutter.off && !g.collide({x: 0, y: g.S.floor + 0.3, z: 27.2}) && !g.S.glass.visible && /POWER ON/.test((g.step(0.016), document.getElementById("fusehud").textContent)); }));
  check("the far switch is not offered once the power is on", await r.evaluate(() => { const g = window.__game, sp = g.S.pw.spot; g.P.p.set(sp[0] + 1.2, g.S.floor + 0.02, sp[1]); return g.nearPower() === false; }));
  check("L4, which has no stair door, still has its 3 ammo packs", await r.evaluate(() => window.__game.packSpots().length === 3 && window.__game.LT.vis.packs.length === 3));

  // the finale: the alarm starts on arrival, the monsters hunt toward the doors, the lot is safe, and walking out ends the round
  check("the alarm starts when you are in the store with the doors open", await r.evaluate(() => { const g = window.__game; g.step(0.05); return g.FIN.alarmUntil > 0 && /ALARM \d:\d\d/.test(document.getElementById("alarm").textContent); }));
  check("the monsters head for the doors", await r.evaluate(() => { const g = window.__game; g.P.p.set(16, g.S.floor + 0.02, 7.7); g.P.imm = 99; for (let i = 0; i < 4; i++) g.step(0.05); return g.monsters.length > 0 && g.monsters.every(m => m.state === "search" || m.state === "chase"); }));
  check("the parking lot is off the monsters' map", await r.evaluate(() => { const g = window.__game; let bad = 0; g.S.nav.forEach((v, c) => { if (v && g.cellXZ(c)[1] > 27.6) bad++; }); return bad === 0; }));
  check("not out yet inside the store", await r.evaluate(() => { const g = window.__game; g.P.p.set(0, g.S.floor + 0.02, 26); g.exitCheck(); return !g.FIN.out && !g.FIN.results; }));
  await r.evaluate(() => { const g = window.__game; g.P.p.set(0, g.S.floor + 0.02, g.EXIT_Z + 0.5); g.step(0.02); });
  check("walking out onto the lot ends a solo round with place 1 and a record", await r.evaluate(() => { const g = window.__game; return g.FIN.out && g.FIN.results && g.FIN.results[0].place === 1 && document.getElementById("results").style.display === "flex" && /RECORD|BEST/.test(document.getElementById("r-best").textContent); }));

  // monsters show on the map only through the cameras
  const cam = await r.evaluate(() => {
    const g = window.__game, m = g.monsters[0]; g.MAPSEEN.clear();
    m.pos.x = 500; m.pos.z = 500; g.updateSeen(5);
    const far = !g.MAPSEEN.has(m);
    let hit = null;
    outer: for (const c of g.S.cams) for (let t = 0; t < 40; t += 2) for (const d of [4, 7, 11]) {
      g.aimFeed(c, t); g.feedCam.updateMatrixWorld(true);
      const dir = g.feedCam.getWorldDirection(new g.feedCam.position.constructor()), x = g.feedCam.position.x + dir.x * d, z = g.feedCam.position.z + dir.z * d;
      if (g.camSees(c, t, x, m.fy + 1.3, z)) { hit = {t, x, z, bx: g.feedCam.position.x - dir.x * d, bz: g.feedCam.position.z - dir.z * d, c: g.S.cams.indexOf(c)}; break outer; }
    }
    if (!hit) return {far, hit: null};
    m.pos.x = hit.x; m.pos.z = hit.z; g.updateSeen(hit.t);
    const seen = g.MAPSEEN.has(m) && Math.abs(g.MAPSEEN.get(m).x - hit.x) < 1e-6;
    g.MAPSEEN.clear(); m.pos.x = hit.bx; m.pos.z = hit.bz; g.updateSeen(hit.t);                         // the same distance behind the camera
    const behind = !g.MAPSEEN.has(m) || g.S.cams.some(c2 => g.camSees(c2, hit.t, hit.bx, m.fy + 1.3, hit.bz));
    g.MAPSEEN.clear(); const cams = g.S.cams; g.S.cams = []; m.pos.x = hit.x; m.pos.z = hit.z; g.updateSeen(hit.t); const none = !g.MAPSEEN.has(m); g.S.cams = cams;
    return {far, hit, seen, behind, none};
  });
  check("a monster far from every camera is not on the map", cam.far);
  check("a monster in a camera's view is marked", !!cam.hit && cam.seen, cam.hit ? `(camera ${cam.hit.c})` : "(no clear view found)");
  check("one behind the camera is not marked unless another camera sees it", !!cam.hit && cam.behind);
  check("a floor with no cameras marks nothing", !!cam.hit && cam.none);

  await p.close().catch(() => {}); await r.close().catch(() => {});        // software rendering: free the CPU for the last page
  const q = await solo(withModel.port);
  await until("with models/fuse.glb the model replaces the placeholder", q, () => window.__game.FZ.vis.items.every(i => i.o.userData.model));
  check("the placeholder art is hidden behind it", await q.evaluate(() => window.__game.FZ.vis.items[0].o.userData.art.visible === false));
} catch (e) { console.log("ERROR", e); failed++; }
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); await plain.close(); await withModel.close(); fs.rmSync(tmp, {recursive: true, force: true});
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
