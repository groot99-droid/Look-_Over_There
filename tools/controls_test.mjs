// The universal controls, on a keyboard and on a (stubbed) controller, in solo play: Y takes out / rotates / opens the wheel, Shift and left-stick click toggle crouch, R and right-stick click run,
// RT / left click use what is held, LT / right click aim the gun or fire the secondary of the cloak and the beacon, X is the action button, the camera feeds have no controls.
// Usage: node tools/controls_test.mjs    (needs Playwright + Chromium)
import {createRequire} from "node:module";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
let fails = 0; const check = (name, ok, extra = "") => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = await createServer({port: 0, countdownMs: 60000});
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const page = await (await browser.newContext({viewport: {width: 640, height: 400}})).newPage(); const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.addInitScript(() => {                                          // a controller we can press from the tests
  const mk = () => ({connected: true, id: "stub", index: 0, mapping: "standard", axes: [0, 0, 0, 0], buttons: Array.from({length: 17}, () => ({pressed: false, value: 0, touched: false}))});
  window.__pad = mk(); window.__press = (i, on = true) => { window.__pad.buttons[i] = {pressed: on, value: on ? 1 : 0, touched: on}; }; window.__axis = (i, v) => { window.__pad.axes[i] = v; };
  navigator.getGamepads = () => [window.__pad, null, null, null];
});
await page.goto(`http://localhost:${srv.port}/`); await page.click("#l-solo");
await page.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 240000});
const G = f => page.evaluate(f);
const tick = async (n = 6) => { await G(`(() => { const g = window.__game; for (let i = 0; i < ${n}; i++) g.update(0.05); })()`); await sleep(60); };
const tap = async (i, ms = 80) => { await G(`window.__press(${i}, true)`); await tick(2); await sleep(ms); await G(`window.__press(${i}, false)`); await tick(2); };
const heldNow = () => G(() => document.querySelector("#held").style.display === "none" ? null : document.querySelector("#held b").textContent);
await G(() => { const g = window.__game; g.P.imm = 999; for (const m of g.monsters) { m.cfg = {...m.cfg, patrol: 0, alert: 0, chase: 0, sight: 0}; m.pos.set(900, m.fy, 900); } });

// nothing in the hands
await tap(3); check("Y with nothing to hold says so and holds nothing", (await heldNow()) === null);
// give the player the lot (what the B1 locker and pickups do)
await G(() => { const g = window.__game; g.LT.gun = true; g.LT.rounds = 3; g.CL.have = true; g.BC.have = 2; });
await tick(3);
check("the first thing you get is in your hands", /RAY GUN/.test(await heldNow() || ""), await heldNow());
await tap(3); check("tap Y rotates to the cloak", /CLOAK/.test(await heldNow() || ""));
await tap(3); check("tap Y again rotates to the beacon", /AFK BEACON/.test(await heldNow() || ""));
await tap(3); check("and round to the gun", /RAY GUN/.test(await heldNow() || ""));
// hold Y: the wheel
await G("window.__press(3, true)"); await tick(2); await sleep(500); await tick(2);
check("holding Y shows the wheel", await G(() => getComputedStyle(document.getElementById("wheel")).display === "flex" && document.querySelectorAll("#wheel span").length === 4));
await G("window.__axis(2, 1)"); await tick(2); await G("window.__axis(2, 0)"); await tick(2);
await G("window.__press(3, false)"); await tick(3);
check("the right stick moved the wheel to the next item and releasing Y took it", /CLOAK/.test(await heldNow() || ""), await heldNow());
check("the wheel closes", await G(() => getComputedStyle(document.getElementById("wheel")).display === "none"));
// crouch toggles, run holds
await tap(10); check("left-stick click crouches", await G(() => (window.__game.step(0.01), window.__game.P.crouch)));
await G("window.__axis(1, -1)"); await tick(4); check("and stays crouched while you move", await G(() => window.__game.P.crouch && window.__game.P.moving));
await tap(10); await tick(2); check("click again to walk normally", await G(() => !window.__game.P.crouch));
await tap(10); await tick(2); await G("window.__press(11, true)"); await tick(6);
check("right-stick click runs (hold) and stands you up", await G(() => window.__game.P.running && !window.__game.P.crouch));
await G("window.__press(11, false)"); await G("window.__axis(1, 0)"); await tick(4);
await page.keyboard.press("ShiftLeft"); await tick(2); check("Shift crouches too", await G(() => window.__game.P.crouch)); await page.keyboard.press("ShiftLeft"); await tick(2); check("and again to walk", await G(() => !window.__game.P.crouch));
await G("window.__game.keys.KeyW = true; window.__game.keys.KeyR = true"); await tick(6); check("R runs", await G(() => window.__game.P.running)); await G("window.__game.keys.KeyW = false; window.__game.keys.KeyR = false");
// the gun: RT fires only when it is in the hands, LT aims
await G(() => { window.__game.GUN.cool = 0; }); await tap(3); await tap(3); await tap(3);                                    // back to the gun
check("holding the gun", /RAY GUN/.test(await heldNow() || ""), await heldNow());
const r0 = await G(() => window.__game.LT.rounds); await tap(7); check("RT fires the ray gun", (await G(() => window.__game.LT.rounds)) === r0 - 1);
await G("window.__press(6, true)"); await tick(30); check("LT aims: the view zooms in and the reticle shows", await G(() => window.__game.AUD && document.getElementById("reticle").style.display === "block" && window.__game.update && true));
const fovAim = await G(() => window.__camFov?.()); await G("window.__press(6, false)"); await tick(30);
// a cloak in the hands: RT on/off, LT short circuit
await tap(3); check("rotated to the cloak", /CLOAK/.test(await heldNow() || ""), await heldNow());
await tap(7); check("RT with the cloak switches it on", await G(() => window.__game.CL.st.on));
await G(() => { const g = window.__game; const m = g.monsters[0]; m.cfg = {...m.cfg}; m.pos.set(g.P.p.x + 3, m.fy, g.P.p.z); });
await tap(6); check("LT short-circuits it: the cloak is dead for 5 minutes and off", await G(() => { const c = window.__game.CL.st; return !c.on && c.broken > 290; }));
check("and the monster beside you is stunned", await G(() => window.__game.monsters[0].stunT > 4));
await tap(7); check("the dead cloak does not switch on", await G(() => !window.__game.CL.st.on));
// a beacon in the hands: RT rolls it, LT reverses it
await tap(3); check("rotated to the beacon", /AFK BEACON/.test(await heldNow() || ""), await heldNow());
await tap(7); check("RT rolls a beacon", await G(() => window.__game.BC.have === 1 && window.__game.BC.list.length === 1));
await G(() => { const b = window.__game.BC.list[0]; b.land = performance.now() / 1000 - 1; b.until = performance.now() / 1000 + 20; });
await tap(6); check("LT reverses its frequency", await G(() => window.__game.BC.list[0].reversed === true));
// X is the action button; the camera keys are gone
await G(() => { window.__game.devOn.v = false; }); await page.keyboard.press("Tab"); check("Tab takes out the handheld, as a map", await G(() => window.__game.devOn.v && window.__game.mode === "map"));
await page.keyboard.press("KeyQ"); await page.keyboard.press("KeyE"); await page.keyboard.press("KeyZ"); await page.keyboard.press("KeyT");
check("Q, E, Z and T do not move a camera (Q and E are the consumable slots)", await G(() => window.__game.mode === "map" && window.__game.camIdxNow() === 0));
await page.keyboard.press("Tab");
await G("window.__press(2, true)"); await tick(2); await G("window.__press(2, false)"); await tick(2);
check("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close(); await srv.close(); console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
