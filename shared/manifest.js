// The world manifest: which areas, scenes, links and modes exist, and what each one needs. Pure functions only (no data, no I/O), so the game page, the
// server and the tools can all use them. The data is in shared/farway.manifest.js; shared/registry.js builds it once at load.
//
// A manifest is {manifestVersion: 1, flags, connectors, modes, areas, links}.
//   area  {id, name, status: "built" | "planned" | "reserved", soloOnly?, scenes?: [scene], ...}
//   scene {id, floorY?, files?, multiplayer?, puzzle?: "fuses" | "switches" | "keypad", powerSource?, loot?: {lockers, packs}}
//   link  {id, from: {area, scene?, door?}, to: {area, scene?, room?, door?, arrive?, face?}, connector, status, requires?: [flag], soloOnly?, returnTo?, note?}
//   mode  {status, area, floors, players: {min, max}, finish?: {scene, ...}, ...}
// A scene id is unique across the whole manifest (the server's messages name a scene by its bare id).
// An addon is the same shape ({areas, links, flags?, connectors?, modes?}) and is added with mergeAddon.

export const STATUSES = ["built", "planned", "reserved"];
export const PUZZLES = ["fuses", "switches", "keypad"];
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const isId = v => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(v);
const isLinkId = v => typeof v === "string" && /^[A-Za-z0-9_.>-]+$/.test(v);
const isFile = v => typeof v === "string" && v.length > 0 && !v.startsWith("/") && !v.split("/").includes("..");
const isCount = v => Number.isInteger(v) && v >= 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Everything wrong with a manifest, as {errors, warnings} (arrays of strings). With worldDocs ({sceneId: parsed world/<id>.json}) it also checks that the
// door links in those files and the built links here are the same set. Never throws and never mutates its input.
export function checkManifest(doc, {worldDocs = null} = {}) {
  const errors = [], warnings = [], err = m => errors.push(m);
  if (!isObj(doc)) return {errors: ["the manifest is not an object"], warnings};
  if (doc.manifestVersion !== 1) err(`manifestVersion must be 1 (got ${JSON.stringify(doc.manifestVersion)})`);
  if (!Array.isArray(doc.areas)) { err("areas must be an array"); return {errors, warnings}; }
  const flags = new Set(Array.isArray(doc.flags) ? doc.flags : []), connectors = new Set(Array.isArray(doc.connectors) ? doc.connectors : []);
  const areas = new Map(), sceneArea = new Map(), scenesOf = new Map();

  for (const a of doc.areas) {
    if (!isObj(a) || !isId(a.id)) { err(`an area needs an id of letters, digits and underscores (got ${JSON.stringify(a && a.id)})`); continue; }
    if (areas.has(a.id)) { err(`duplicate area id ${a.id}`); continue; }
    areas.set(a.id, a);
    if (!STATUSES.includes(a.status)) err(`area ${a.id}: status must be one of ${STATUSES.join(", ")}`);
    if (a.scenes === undefined) continue;
    if (!Array.isArray(a.scenes)) { err(`area ${a.id}: scenes must be an array`); continue; }
    const ids = new Set(); scenesOf.set(a.id, ids);
    for (const s of a.scenes) {
      if (!isObj(s) || !isId(s.id)) { err(`area ${a.id}: a scene needs an id (got ${JSON.stringify(s && s.id)})`); continue; }
      if (sceneArea.has(s.id)) { err(`duplicate scene id ${s.id} (in ${sceneArea.get(s.id)} and ${a.id})`); continue; }
      sceneArea.set(s.id, a.id); ids.add(s.id);
      const at = `scene ${s.id}`;
      if (s.puzzle !== undefined && !PUZZLES.includes(s.puzzle)) err(`${at}: puzzle must be one of ${PUZZLES.join(", ")}`);
      if (s.loot !== undefined && !(isObj(s.loot) && isCount(s.loot.lockers) && isCount(s.loot.packs))) err(`${at}: loot needs whole-number lockers and packs`);
      if (s.files !== undefined && !(Array.isArray(s.files) && s.files.every(isFile))) err(`${at}: files must be relative paths without ..`);
      if (a.status === "built") {
        if (s.files !== undefined && s.files.length === 0) err(`${at}: a built scene needs at least one file`);
        if (s.multiplayer && typeof s.floorY !== "number") err(`${at}: a multiplayer scene needs a floorY`);
      } else if (s.multiplayer) err(`${at}: only a built scene can be multiplayer`);
    }
  }

  const linkIds = new Set();
  for (const l of Array.isArray(doc.links) ? doc.links : []) {
    if (!isObj(l) || !isLinkId(l.id)) { err(`a link needs an id (got ${JSON.stringify(l && l.id)})`); continue; }
    if (linkIds.has(l.id)) { err(`duplicate link id ${l.id}`); continue; }
    linkIds.add(l.id);
    const at = `link ${l.id}`;
    if (!STATUSES.includes(l.status)) err(`${at}: status must be one of ${STATUSES.join(", ")}`);
    if (!connectors.has(l.connector)) err(`${at}: unknown connector ${JSON.stringify(l.connector)}`);
    for (const need of l.requires === undefined ? [] : Array.isArray(l.requires) ? l.requires : [null]) if (!flags.has(need)) err(`${at}: requires an undeclared flag ${JSON.stringify(need)}`);
    for (const end of ["from", "to"]) {
      const e = l[end];
      if (!isObj(e) || !areas.has(e.area)) { err(`${at}: ${end}.area ${JSON.stringify(e && e.area)} is not an area`); continue; }
      if (e.scene !== undefined && scenesOf.has(e.area) && !scenesOf.get(e.area).has(e.scene)) err(`${at}: ${end}.scene ${e.scene} is not a scene of ${e.area}`);
      if (l.status === "built" && areas.get(e.area).status !== "built") err(`${at}: a built link cannot touch the ${areas.get(e.area).status} area ${e.area}`);
    }
    if (l.returnTo !== undefined && !(isObj(l.returnTo) && areas.has(l.returnTo.area) && (l.returnTo.scene === undefined || sceneArea.get(l.returnTo.scene) === l.returnTo.area))) err(`${at}: returnTo is not a place`);
  }

  for (const [name, m] of Object.entries(isObj(doc.modes) ? doc.modes : {})) {
    const at = `mode ${name}`;
    if (!isObj(m) || !STATUSES.includes(m.status)) { err(`${at}: needs a status`); continue; }
    const ids = scenesOf.get(m.area);
    if (!areas.has(m.area)) { err(`${at}: area ${m.area} does not exist`); continue; }
    if (!Array.isArray(m.floors) || !m.floors.length) err(`${at}: needs floors`);
    else for (const f of m.floors) if (m.status === "built" && !(ids && ids.has(f))) err(`${at}: floor ${f} is not a scene of ${m.area}`);
    if (m.players !== undefined && !(isObj(m.players) && Number.isInteger(m.players.min) && Number.isInteger(m.players.max) && m.players.min >= 1 && m.players.min <= m.players.max)) err(`${at}: players needs 1 <= min <= max`);
    if (m.finish !== undefined && Array.isArray(m.floors) && !m.floors.includes(m.finish.scene)) err(`${at}: finish.scene must be one of its floors`);
  }

  if (worldDocs) compareWorldDocs(doc, worldDocs, err, m => warnings.push(m));
  return {errors, warnings};
}
export const validateManifest = (doc, opts) => checkManifest(doc, opts).errors;

// The door links stored in world/<scene>.json and the built links here must be the same set, with the same arrival points.
function compareWorldDocs(doc, worldDocs, err, warn) {
  const built = (doc.links || []).filter(l => l && l.status === "built");
  for (const [scene, wdoc] of Object.entries(worldDocs)) {
    const doors = new Map((wdoc.doors || []).filter(d => d.link).map(d => [d.name, d.link]));
    const mine = built.filter(l => l.from && l.from.scene === scene);
    for (const [name, jl] of doors) {
      const l = mine.find(x => x.from.door === name);
      if (!l) { err(`world/${scene}.json: door ${name} has a link that the manifest does not list`); continue; }
      if (jl.game) {
        if (l.to.area !== jl.game || l.to.room !== jl.room || !same(l.to.arrive, jl.arrive) || !same(l.to.face, jl.face)) err(`${l.id}: differs from the game link in world/${scene}.json`);
        if (!l.soloOnly) err(`${l.id}: a game gate must say soloOnly while rooms cannot enter games`);
        if (jl.scene === undefined) warn(`${l.id}: world/${scene}.json has no return scene, so after the game the page falls back to the passage scene (manifest says ${l.returnTo ? l.returnTo.scene : "nothing"})`);
        else if (!l.returnTo || l.returnTo.scene !== jl.scene) err(`${l.id}: returnTo differs from world/${scene}.json`);
      } else if (l.to.scene !== jl.scene || l.to.door !== jl.door || !same(l.to.arrive, jl.arrive) || !same(l.to.face, jl.face)) err(`${l.id}: differs from the stair link in world/${scene}.json`);
    }
    for (const l of mine) if (!doors.has(l.from.door)) err(`${l.id}: world/${scene}.json has no door ${l.from.door} with a link`);
  }
}

// Evaluates a link's `requires` against the flags a player holds (a Set, an array or an object of true values).
export function requirementsMet(link, flags) {
  const has = flags instanceof Set ? f => flags.has(f) : Array.isArray(flags) ? f => flags.includes(f) : flags ? f => !!flags[f] : () => false;
  const missing = (link && link.requires ? link.requires : []).filter(f => !has(f));
  return {ok: missing.length === 0, missing};
}

function deepFreeze(o) { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; }

// The lookups the rest of the code needs, derived once from a valid manifest. Throws (listing every problem) on an invalid one. The result is frozen.
export function buildRegistry(doc) {
  const {errors} = checkManifest(doc);
  if (errors.length) throw new Error("invalid world manifest:\n  " + errors.join("\n  "));
  const builtScenes = doc.areas.filter(a => a.status === "built").flatMap(a => (a.scenes || []).map(s => ({...s, area: a.id})));
  const floors = {}, pageScenes = {}, loot = {};
  for (const s of builtScenes) {
    if (s.multiplayer) floors[s.id] = s.floorY;
    if (s.files) pageScenes[s.id] = {glbs: s.files.filter(f => f.endsWith(".glb")), floor: s.floorY};
    if (s.loot) loot[s.id] = {lockers: s.loot.lockers, packs: s.loot.packs};
  }
  const links = doc.links || [];
  return deepFreeze({
    manifest: structuredClone(doc),
    floors, pageScenes, loot,
    powerSources: builtScenes.filter(s => s.powerSource).map(s => s.id),
    scenesWith: puzzle => Object.freeze(builtScenes.filter(s => s.puzzle === puzzle).map(s => s.id)),
    modes: structuredClone(doc.modes || {}),
    maxPlayers: mode => ((doc.modes || {})[mode] || {}).players?.max,
    links: structuredClone(links),
    linkFrom: (scene, door) => links.find(l => l.status === "built" && l.from.scene === scene && l.from.door === door),
    linksFrom: scene => links.filter(l => l.from.scene === scene),
    area: id => doc.areas.find(a => a.id === id),
  });
}

// A new manifest with an addon's areas and links added. An addon may add areas, links, flags, connectors and modes; it may not reuse an existing
// area, scene, link or mode id, and every link it brings must touch one of its own areas. Throws on any problem; the base is never changed.
export function mergeAddon(base, addon) {
  const problems = [];
  if (!isObj(addon) || !Array.isArray(addon.areas) || !addon.areas.length) throw new Error("an addon needs at least one area");
  const own = new Set(addon.areas.map(a => a && a.id));
  for (const a of addon.areas) if ((base.areas || []).some(b => b.id === a.id)) problems.push(`area ${a.id} already exists`);
  for (const k of Object.keys(addon.modes || {})) if ((base.modes || {})[k]) problems.push(`mode ${k} already exists`);
  for (const l of addon.links || []) if (!own.has(l.from && l.from.area) && !own.has(l.to && l.to.area)) problems.push(`link ${l.id} touches none of the addon's own areas`);
  if (problems.length) throw new Error("addon refused:\n  " + problems.join("\n  "));
  const merged = {
    ...structuredClone(base),
    flags: [...new Set([...(base.flags || []), ...(addon.flags || [])])],
    connectors: [...new Set([...(base.connectors || []), ...(addon.connectors || [])])],
    modes: {...structuredClone(base.modes || {}), ...structuredClone(addon.modes || {})},
    areas: [...structuredClone(base.areas), ...structuredClone(addon.areas)],
    links: [...structuredClone(base.links || []), ...structuredClone(addon.links || [])],
  };
  const {errors} = checkManifest(merged);
  if (errors.length) throw new Error("addon refused:\n  " + errors.join("\n  "));
  return merged;
}
