// The world manifest from the command line.
//   node tools/manifest.mjs check     validate shared/farway.manifest.js, and compare its built links with the door links in world/*.json (exit 1 on any error)
//   node tools/manifest.mjs scenes    the scenes the page and the server will use
//   node tools/manifest.mjs links     every link, built and planned, and what it needs
//   node tools/manifest.mjs export [file]   the manifest as JSON (to a file, or to the screen)
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {checkManifest, requirementsMet} from "../shared/manifest.js";
import {FARWAY} from "../shared/farway.manifest.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [cmd = "check", arg] = process.argv.slice(2);
const where = e => [e.area, e.scene || e.room, e.door].filter(Boolean).join("/");

if (cmd === "check") {
  const worldDocs = {};
  for (const a of FARWAY.areas) if (a.status === "built") for (const s of a.scenes || []) {
    const f = path.join(ROOT, `world/${s.id}.json`);
    if (fs.existsSync(f)) worldDocs[s.id] = JSON.parse(fs.readFileSync(f, "utf8"));
  }
  const {errors, warnings} = checkManifest(FARWAY, {worldDocs});
  for (const w of warnings) console.log("warning: " + w);
  for (const e of errors) console.log("error:   " + e);
  const built = FARWAY.links.filter(l => l.status === "built").length;
  console.log(`${errors.length ? "FAILED" : "OK"}: ${FARWAY.areas.length} areas, ${built} built and ${FARWAY.links.length - built} planned links, ${Object.keys(worldDocs).length} world files compared, ${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
} else if (cmd === "scenes") {
  for (const a of FARWAY.areas) for (const s of a.scenes || []) {
    const bits = [s.multiplayer ? "multiplayer" : null, s.puzzle ? `puzzle ${s.puzzle}` : null, s.powerSource ? "power source" : null, s.loot ? `loot ${s.loot.lockers}/${s.loot.packs}` : null, s.floorY !== undefined ? `y ${s.floorY}` : null].filter(Boolean);
    console.log(`${a.status.padEnd(8)} ${a.id.padEnd(18)} ${s.id.padEnd(18)} ${bits.join(", ")}`);
  }
} else if (cmd === "links") {
  for (const l of FARWAY.links) console.log(`${l.status.padEnd(8)} ${l.connector.padEnd(16)} ${where(l.from)} -> ${where(l.to)}${l.requires ? "   needs " + l.requires.join(", ") : ""}${l.soloOnly ? "   solo only" : ""}`);
  const held = ["original_complete"];
  console.log(`\nwith ${JSON.stringify(held)}: ${FARWAY.links.filter(l => requirementsMet(l, held).ok).length} of ${FARWAY.links.length} links are open`);
} else if (cmd === "export") {
  const json = JSON.stringify(FARWAY, null, 2) + "\n";
  if (arg) { fs.writeFileSync(path.resolve(arg), json); console.log("wrote " + arg); } else process.stdout.write(json);
} else { console.log("usage: node tools/manifest.mjs check | scenes | links | export [file]"); process.exit(2); }
