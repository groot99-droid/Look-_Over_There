// How much of each floor the security cameras can ever see, and how much at one moment: samples every 3rd walkable cell (floor level, 1.3 m up) against every camera at 10 points of the sweep.
//   node tools/cam_coverage.mjs        (needs Playwright + Chromium; slow in software rendering)
import {createRequire} from "node:module";
import {createServer} from "../server/server.js";
const {chromium} = createRequire(import.meta.url)("playwright");
const srv = await createServer({port: 0, countdownMs: 60000});
const browser = await chromium.launch({args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]});
const page = await (await browser.newContext({viewport: {width: 960, height: 600}})).newPage();
page.on("pageerror", e => console.log("pageerror", e.message));
await page.goto(`http://localhost:${srv.port}/`); await page.click("#l-solo");
await page.waitForFunction(() => window.__game && !document.getElementById("load"), null, {timeout: 240000});
for (const id of ["B1", "L1", "L2", "L3", "L4"]) {
  await page.evaluate(i => window.__game.loadScene(i), id);
  await page.waitForFunction(i => window.__game.S.id === i && !window.__game.loading, id, {timeout: 120000});
  const r = await page.evaluate(() => {
    const g = window.__game, cams = g.S.cams, cells = []; if (!g.S.nav) return null;
    for (let c = 0; c < g.NW * g.NH; c += 3) if (g.S.nav[c]) cells.push(g.cellXZ(c));
    const ever = new Uint8Array(cells.length), one = new Uint8Array(cells.length), T = 10, loop = 20;
    for (let k = 0; k < T; k++) for (let ci = 0; ci < cams.length; ci++) for (let i = 0; i < cells.length; i++) {
      if (ever[i] && (k > 0 || one[i])) continue;
      if (g.camSees(cams[ci], k * loop / T, cells[i][0], g.S.floor + 1.3, cells[i][1])) { ever[i] = 1; if (k === 0) one[i] = 1; }
    }
    const sum = a => a.reduce((x, y) => x + y, 0);
    return {cams: cams.length, cells: cells.length, everPct: +(100 * sum(ever) / cells.length).toFixed(1), nowPct: +(100 * sum(one) / cells.length).toFixed(1)};
  });
  console.log(id, JSON.stringify(r));
}
await browser.close(); await srv.close(); process.exit(0);
