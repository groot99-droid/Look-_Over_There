// The world manifest for Farway: the one place that says which scenes, floors, puzzles, links and modes exist. Edit this file to add a scene or a link; the
// loader (shared/manifest.js) checks it when the game or the server starts, and `node tools/manifest.mjs check` also checks it against world/*.json.
// Status: "built" is in the game now; "planned" is designed but not built; "reserved" holds a place for an addon. Only built things reach the game.
// See docs/MANIFEST.md.

// the stair doors between floors: copied from the "link" in world/<scene>.json (tools/manifest.mjs check fails if they drift)
const stair = (scene, door, to, toDoor, arrive, face) => ({
  id: `lot.${scene}.${door}`, status: "built", connector: "stair_door",
  from: {area: "lot", scene, door}, to: {area: "lot", scene: to, door: toDoor, arrive, face},
});
// a door that opens one of the two games. Rooms cannot enter games yet, so both are solo only.
const gate = (door, game, to, returnScene) => ({
  id: `lot.L4.${door}`, status: "built", connector: "gate", soloOnly: true,
  from: {area: "lot", scene: "L4", door}, to: {area: game, ...to}, returnTo: {area: "lot", scene: returnScene},
});
const plan = (id, from, to, connector, extra = {}) => ({id, status: "planned", connector, from, to, ...extra});
const stub = (id, name, status, scenes) => ({id, name, status, scenes: scenes.map(s => ({id: s}))});

export const FARWAY = {
  manifestVersion: 1,
  world: "Farway",
  flags: ["original_complete", "keycard_tier_1", "keycard_tier_2", "admin_access"],
  connectors: ["stair_door", "gate", "doors", "walk", "elevator", "stairs", "bus", "pool_dive", "pool_route", "service_corridor", "one_way"],

  // a mode is a way to play a round; `players.max` is the room size the server enforces
  modes: {
    original: {
      status: "built", area: "lot", floors: ["B1", "L1", "L2", "L3", "L4"], startScene: "B1", players: {min: 1, max: 10},
      finish: {scene: "L4", trigger: "parking_lot", alarmMs: 60000}, results: ["place", "time", "bestOnBrowser"],
    },
    going_back_in: {
      status: "planned", area: "lot", floors: ["L4", "L3", "L2", "L1", "B1"], players: {min: 1, max: 10}, chambersPerFloor: 4, waves: 20,
    },
  },

  areas: [
    {
      id: "lot", name: "Look Over There", status: "built", tone: "backrooms",
      scenes: [
        {id: "B1", floorY: -3.0, files: ["world/B1.glb", "world/B1.json"], multiplayer: true, puzzle: "fuses", loot: {lockers: 8, packs: 3}},
        {id: "L1", floorY: 0, files: ["world/L1.glb", "world/L1.json"], multiplayer: true, puzzle: "switches", loot: {lockers: 0, packs: 3}},
        {id: "L2", floorY: 3.2, files: ["world/L2.glb", "world/L2.json"], multiplayer: true, puzzle: "keypad", loot: {lockers: 0, packs: 3}},
        {id: "L3", floorY: 6.4, files: ["world/L3.glb", "world/L3.json"], multiplayer: true, powerSource: true, loot: {lockers: 0, packs: 4}},
        {id: "L4", floorY: 9.6, files: ["world/L4.glb", "world/Exterior.glb", "world/L4.json"], multiplayer: true, powerSource: true, loot: {lockers: 0, packs: 3}},
      ],
    },
    {id: "rdwe", name: "Right Door, Wrong Exit", status: "built", soloOnly: true, tone: "dreamcore", rooms: ["dining", "hallway", "teal", "teal2", "flooded", "trampoline", "grocery"]},
    {id: "intern", name: "The Intern", status: "built", soloOnly: true, tone: "liminal", spine: ["S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]},
    stub("overworld", "Overworld", "planned", ["parking_lot", "table_and_chairs", "playground", "tree_house", "bus_station", "road", "endless_hills"]),
    stub("dreamcore_forest", "Dreamcore forest and meadow", "planned", ["forest", "meadow"]),
    stub("city", "City", "planned", ["street", "bus_stop"]),
    stub("hotel", "Strange hotel (apartment tower)", "planned", ["sub_pools", "lobby", "atrium", "floor_1_lower", "floor_1_upper", "floor_2_lower", "floor_2_upper", "floor_3", "roof", "anomaly_maze"]),
    stub("mall", "Liminal mall", "planned", ["entrance"]),
    stub("grocery", "Grocery", "planned", ["main_floor", "back_of_house"]),
    stub("jobs", "Hallam Row (street of jobs)", "planned", ["street_of_jobs"]),
    stub("secret_ops", "Secret Operations (Project Never Land)", "planned", ["service_entry", "hidden_entry"]),
    {id: "future_addon_shed", name: "Reserved for the shed", status: "reserved"},
    {id: "future_addon_treehouse", name: "Reserved for the tree house", status: "reserved"},
  ],

  links: [
    // ---- built: the stairs and the two game gates (arrive and face are what goLink hands to loadScene)
    stair("B1", "DoorLeaf_Stair_B1_L1_up", "L1", "DoorLeaf_Stair_B1_L1_down", [0.009, 0.0, -0.799], [0.0, 1.0]),
    stair("L1", "DoorLeaf_Stair_B1_L1_down", "B1", "DoorLeaf_Stair_B1_L1_up", [0.009, 0.0, -1.599], [0.0, -1.0]),
    stair("L1", "DoorLeaf_Stair_L1_L2_up", "L2", "DoorLeaf_Stair_L1_L2_down", [-0.007, 3.2, 10.508], [0.0, 1.0]),
    stair("L2", "DoorLeaf_Stair_L1_L2_down", "L1", "DoorLeaf_Stair_L1_L2_up", [-0.007, 3.2, 9.708], [0.0, -1.0]),
    stair("L2", "DoorLeaf_Stair_L2_L3_up", "L3", "DoorLeaf_Stair_L2_L3_down", [-16.478, 6.4, -15.078], [0.0, -1.0]),
    stair("L3", "DoorLeaf_Stair_L2_L3_down", "L2", "DoorLeaf_Stair_L2_L3_up", [-16.478, 6.4, -14.278], [0.0, 1.0]),
    stair("L3", "DoorLeaf_Stair_L3_L4_up", "L4", "DoorLeaf_Stair_L3_L4_down", [16.0, 9.6, 7.2], [0.0, -1.0]),
    stair("L4", "DoorLeaf_Stair_L3_L4_down", "L3", "DoorLeaf_Stair_L3_L4_up", [16.0, 9.6, 8.0], [0.0, 1.0]),
    gate("DoorLeaf_Gate_RDW", "rdwe", {room: "dining", arrive: [-121.2, 9.6, 63.6], face: [0.0, 1.0]}, "L4"),
    gate("DoorLeaf_Gate_ITN", "intern", {arrive: [116.4, 9.6, 75.0], face: [1.0, 0.0]}, "L4"),

    // ---- planned: from the world bible. None of these reach the game until their area is built.
    plan("lot.L4.front_doors>overworld", {area: "lot", scene: "L4", door: "front_doors"}, {area: "overworld", scene: "parking_lot"}, "doors", {requires: ["original_complete"], note: "The existing finish is walking out onto the parking lot. Extend its results with deaths, an online ranking and the welcome to Farway."}),
    plan("overworld.store_doors>lot", {area: "overworld", scene: "parking_lot", door: "store_doors"}, {area: "lot"}, "doors", {requires: ["original_complete"], note: "Options screen: Original or Going back in."}),
    plan("overworld.bus>city", {area: "overworld", scene: "bus_station"}, {area: "city", scene: "bus_stop"}, "bus", {note: "Just a ride."}),
    plan("overworld.road>forest", {area: "overworld", scene: "road"}, {area: "dreamcore_forest", scene: "forest"}, "walk"),
    plan("forest.house>rdwe", {area: "dreamcore_forest", scene: "meadow", door: "house_door"}, {area: "rdwe", room: "dining"}, "gate", {soloOnly: true}),
    plan("forest.shed>addon", {area: "dreamcore_forest", scene: "meadow", door: "shed"}, {area: "future_addon_shed"}, "gate", {note: "Leads to its own addon later. Also a puzzle."}),
    plan("overworld.treehouse>addon", {area: "overworld", scene: "tree_house"}, {area: "future_addon_treehouse"}, "gate", {note: "Leads to its own addon later. Also a puzzle."}),
    plan("city.street>hotel_lobby", {area: "city", scene: "street"}, {area: "hotel", scene: "lobby"}, "doors"),
    plan("hotel.lobby>atrium", {area: "hotel", scene: "lobby", door: "back_hall"}, {area: "hotel", scene: "atrium"}, "doors", {note: "A back door past the deli under the loft, then a narrow hall."}),
    plan("hotel.atrium>floors", {area: "hotel", scene: "atrium"}, {area: "hotel", scene: "floor_1_lower"}, "elevator", {note: "One elevator to every floor. Each floor has its own section of the atrium."}),
    plan("hotel.floor_1_stairs", {area: "hotel", scene: "floor_1_lower"}, {area: "hotel", scene: "floor_1_upper"}, "stairs", {note: "Same on floor 2. Floor 3 has one level, and its upper level is the roof."}),
    plan("hotel.atrium>maze", {area: "hotel", scene: "atrium"}, {area: "hotel", scene: "anomaly_maze"}, "one_way", {note: "Also reached when the elevator glitches. You leave only by solving it."}),
    plan("hotel.sub_pools>lot.B1", {area: "hotel", scene: "sub_pools"}, {area: "lot", scene: "B1"}, "pool_route", {note: "Separate pools connected underwater, a long way with many levels between."}),
    plan("city.street>mall", {area: "city", scene: "street"}, {area: "mall", scene: "entrance"}, "doors"),
    plan("city.street>grocery", {area: "city", scene: "street"}, {area: "grocery", scene: "main_floor"}, "doors", {note: "Open by day, abandoned by night."}),
    plan("city.street>jobs", {area: "city", scene: "street"}, {area: "jobs", scene: "street_of_jobs"}, "doors"),
    plan("grocery.backhouse>secret_ops", {area: "grocery", scene: "back_of_house"}, {area: "secret_ops", scene: "service_entry"}, "service_corridor", {requires: ["keycard_tier_1"]}),
    plan("rdwe.repeating_room>secret_ops", {area: "rdwe", room: "repeating_room"}, {area: "secret_ops", scene: "hidden_entry"}, "gate", {note: "The only entrance with no clearance. Hinted by a room that repeats or a door seen from one angle."}),
    plan("intern.pool_dive>secret_ops", {area: "intern", room: "S8_H"}, {area: "secret_ops", scene: "service_entry"}, "pool_dive", {note: "The Intern's escape."}),
    plan("rdwe.finale>grocery", {area: "rdwe", room: "grocery"}, {area: "grocery", scene: "main_floor"}, "doors", {note: "One ending, many exits."}),
  ],
};
