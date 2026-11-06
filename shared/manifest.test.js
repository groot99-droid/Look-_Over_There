import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {checkManifest, validateManifest, buildRegistry, mergeAddon, requirementsMet} from "./manifest.js";
import {FARWAY} from "./farway.manifest.js";
import {REGISTRY} from "./registry.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clone = o => structuredClone(o);
const worldDocs = () => Object.fromEntries(Object.keys(REGISTRY.floors).map(id => [id, JSON.parse(fs.readFileSync(path.join(ROOT, `world/${id}.json`), "utf8"))]));
const bad = (mutate, expect) => { const d = clone(FARWAY); mutate(d); const e = validateManifest(d); assert.ok(e.some(m => expect.test(m)), `wanted ${expect}, got ${JSON.stringify(e)}`); };

// ---- the values that used to be written out by hand in six files. If one of these changes, a rule of the game changed: say so on purpose.
test("the registry gives the same floors, scenes, puzzles, loot and room size the code used to hard-code", () => {
  assert.deepEqual(REGISTRY.floors, {B1: -3.0, L1: 0, L2: 3.2, L3: 6.4, L4: 9.6});
  assert.deepEqual(Object.keys(REGISTRY.floors), ["B1", "L1", "L2", "L3", "L4"], "order matters: the page seeds spots by scene index");
  assert.deepEqual(REGISTRY.pageScenes, {
    B1: {glbs: ["world/B1.glb"], floor: -3.0}, L1: {glbs: ["world/L1.glb"], floor: 0}, L2: {glbs: ["world/L2.glb"], floor: 3.2},
    L3: {glbs: ["world/L3.glb"], floor: 6.4}, L4: {glbs: ["world/L4.glb", "world/Exterior.glb"], floor: 9.6},
  });
  assert.deepEqual(REGISTRY.scenesWith("fuses"), ["B1"]);
  assert.deepEqual(REGISTRY.scenesWith("switches"), ["L1"]);
  assert.deepEqual(REGISTRY.scenesWith("keypad"), ["L2"]);
  assert.deepEqual(REGISTRY.powerSources, ["L3", "L4"]);
  assert.deepEqual(REGISTRY.loot, {B1: {lockers: 8, packs: 3}, L1: {lockers: 0, packs: 3}, L2: {lockers: 0, packs: 3}, L3: {lockers: 0, packs: 4}, L4: {lockers: 0, packs: 3}});
  assert.equal(REGISTRY.maxPlayers("original"), 8);
});

test("the shipped manifest has no errors, and its only warning is the known missing return scene on the RDWE gate", () => {
  const {errors, warnings} = checkManifest(FARWAY, {worldDocs: worldDocs()});
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1, JSON.stringify(warnings));
  assert.match(warnings[0], /DoorLeaf_Gate_RDW.*no return scene/);
});

test("every door link in world/*.json is in the manifest, with the same arrival, and the other way round", () => {
  const docs = worldDocs(), built = REGISTRY.links.filter(l => l.status === "built");
  let n = 0;
  for (const [scene, doc] of Object.entries(docs)) for (const d of doc.doors) if (d.link) { n++; assert.ok(REGISTRY.linkFrom(scene, d.name), `${scene}/${d.name}`); }
  assert.equal(built.length, n, "same count");
  assert.equal(n, 10);
});

test("a drifted door link is caught", () => {
  const docs = worldDocs(), d = docs.B1.doors.find(x => x.link); d.link = {...d.link, arrive: [9, 9, 9]};
  assert.ok(checkManifest(FARWAY, {worldDocs: docs}).errors.some(m => /differs from the stair link/.test(m)));
  const docs2 = worldDocs(); docs2.L1.doors.find(x => x.link).link = undefined;
  assert.ok(checkManifest(FARWAY, {worldDocs: docs2}).errors.some(m => /has no door .* with a link/.test(m)));
  const docs3 = worldDocs(); docs3.L3.doors.push({name: "NewDoor", link: {scene: "L2", door: "x", arrive: [0, 0, 0], face: [0, 1]}});
  assert.ok(checkManifest(FARWAY, {worldDocs: docs3}).errors.some(m => /does not list/.test(m)));
});

test("the two game gates are solo only and say where to return to", () => {
  for (const door of ["DoorLeaf_Gate_RDW", "DoorLeaf_Gate_ITN"]) {
    const l = REGISTRY.linkFrom("L4", door);
    assert.ok(l.soloOnly && l.connector === "gate", door);
    assert.deepEqual(l.returnTo, {area: "lot", scene: "L4"});
  }
});

// ---- the validator
test("each kind of mistake is reported", () => {
  bad(d => { d.manifestVersion = 2; }, /manifestVersion/);
  bad(d => { d.areas.push({...d.areas[0]}); }, /duplicate area id lot/);
  bad(d => { d.areas.find(a => a.id === "city").scenes.push({id: "B1"}); }, /duplicate scene id B1/);
  bad(d => { d.areas[0].scenes[0].puzzle = "lasers"; }, /puzzle must be one of/);
  bad(d => { d.areas[0].scenes[0].files = []; }, /at least one file/);
  bad(d => { d.areas[0].scenes[0].files = ["../secret"]; }, /relative paths/);
  bad(d => { delete d.areas[0].scenes[0].floorY; }, /needs a floorY/);
  bad(d => { d.areas[0].scenes[0].loot = {lockers: -1, packs: 3}; }, /loot needs/);
  bad(d => { d.areas.find(a => a.id === "city").scenes[0].multiplayer = true; }, /only a built scene can be multiplayer/);
  bad(d => { d.links[0].to.area = "nowhere"; }, /not an area/);
  bad(d => { d.links[0].to.scene = "L9"; }, /not a scene of lot/);
  bad(d => { d.links[0].connector = "teleport"; }, /unknown connector/);
  bad(d => { d.links[0].requires = ["no_such_flag"]; }, /undeclared flag/);
  bad(d => { d.links[1].id = d.links[0].id; }, /duplicate link id/);
  bad(d => { d.links[0].to.area = "city"; delete d.links[0].to.scene; }, /built link cannot touch the planned area/);
  bad(d => { d.links[0].returnTo = {area: "lot", scene: "nope"}; }, /returnTo is not a place/);
  bad(d => { d.modes.original.floors.push("L9"); }, /floor L9 is not a scene/);
  bad(d => { d.modes.original.players = {min: 5, max: 2}; }, /players needs/);
  bad(d => { d.modes.original.finish.scene = "L9"; }, /finish\.scene/);
  assert.deepEqual(validateManifest(null), ["the manifest is not an object"]);
});

test("validation never changes its input", () => {
  const d = clone(FARWAY), frozen = JSON.stringify(d);
  checkManifest(d, {worldDocs: worldDocs()}); buildRegistry(d); assert.equal(JSON.stringify(d), frozen);
});

test("an invalid manifest cannot become a registry, and the error lists every problem", () => {
  const d = clone(FARWAY); d.links[0].connector = "x"; d.links[1].connector = "y";
  assert.throws(() => buildRegistry(d), err => /unknown connector "x"/.test(err.message) && /unknown connector "y"/.test(err.message));
});

test("the registry is frozen, so nothing can edit the floors at run time", () => {
  assert.throws(() => { REGISTRY.floors.B1 = 1; }, TypeError);
  assert.throws(() => { REGISTRY.scenesWith("fuses").push("L9"); }, TypeError);
  assert.throws(() => { REGISTRY.modes.original.players.max = 99; }, TypeError);
  assert.equal(REGISTRY.floors.B1, -3.0);
});

test("a planned scene never reaches the page or the server", () => {
  for (const id of ["parking_lot", "lobby", "street"]) { assert.equal(REGISTRY.floors[id], undefined); assert.equal(REGISTRY.pageScenes[id], undefined); }
  assert.equal(REGISTRY.linkFrom("L4", "front_doors"), undefined, "planned links are not looked up as doors");
  assert.ok(REGISTRY.links.some(l => l.id === "lot.L4.front_doors>overworld"), "but they are listed");
});

// ---- requirements
test("a link's requirements are met only when every flag is held", () => {
  const l = REGISTRY.links.find(x => x.id === "grocery.backhouse>secret_ops");
  assert.deepEqual(requirementsMet(l, []), {ok: false, missing: ["keycard_tier_1"]});
  assert.equal(requirementsMet(l, new Set(["keycard_tier_1"])).ok, true);
  assert.equal(requirementsMet(l, {keycard_tier_1: true}).ok, true);
  assert.equal(requirementsMet(l, {keycard_tier_1: false}).ok, false);
  assert.equal(requirementsMet(l, undefined).ok, false);
  assert.equal(requirementsMet({id: "free"}, []).ok, true);
  assert.deepEqual(requirementsMet(REGISTRY.links.find(x => x.id === "lot.L4.front_doors>overworld"), ["x"]).missing, ["original_complete"]);
});

// ---- addons
const addon = () => ({
  flags: ["shed_key"], connectors: ["rope"],
  areas: [{id: "shed_addon", name: "The shed", status: "built", scenes: [{id: "shed_inside", floorY: 0, files: ["addons/shed/shed.glb"], multiplayer: true, puzzle: "keypad", loot: {lockers: 0, packs: 1}}]}],
  links: [{id: "shed.in", status: "built", connector: "rope", requires: ["shed_key"], from: {area: "lot", scene: "L3", door: "x"}, to: {area: "shed_addon", scene: "shed_inside"}}],
  modes: {shed: {status: "built", area: "shed_addon", floors: ["shed_inside"], players: {min: 1, max: 4}}},
});
test("an addon adds scenes, links and a mode without touching the base", () => {
  const base = clone(FARWAY), frozen = JSON.stringify(base);
  const m = mergeAddon(base, addon());
  assert.equal(JSON.stringify(base), frozen, "the base is unchanged");
  const r = buildRegistry(m);
  assert.deepEqual(Object.keys(r.floors), ["B1", "L1", "L2", "L3", "L4", "shed_inside"]);
  assert.deepEqual(r.scenesWith("keypad"), ["L2", "shed_inside"]);
  assert.equal(r.maxPlayers("shed"), 4);
  assert.deepEqual(r.pageScenes.shed_inside, {glbs: ["addons/shed/shed.glb"], floor: 0});
});
test("an addon cannot reuse ids, redefine a base mode, or add a link between base areas", () => {
  const a = addon(); a.areas[0].id = "lot";
  assert.throws(() => mergeAddon(FARWAY, a), /area lot already exists/);
  const b = addon(); b.areas[0].scenes[0].id = "L1";
  assert.throws(() => mergeAddon(FARWAY, b), /duplicate scene id L1/);
  const c = addon(); c.modes = {original: c.modes.shed};
  assert.throws(() => mergeAddon(FARWAY, c), /mode original already exists/);
  const d = addon(); d.links[0].from = {area: "lot", scene: "L1"}; d.links[0].to = {area: "lot", scene: "L2"};
  assert.throws(() => mergeAddon(FARWAY, d), /touches none of the addon's own areas/);
  const e = addon(); e.links[0].requires = ["undeclared"];
  assert.throws(() => mergeAddon(FARWAY, e), /undeclared flag/);
  assert.throws(() => mergeAddon(FARWAY, {}), /at least one area/);
});
