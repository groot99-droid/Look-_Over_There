// The world registry: shared/farway.manifest.js checked and turned into the lookups the game and the server use (floors, scenes, puzzle floors, loot, links, modes).
// Built once when the first module imports it; an invalid manifest stops the game and the server at start, with every problem listed, not halfway through a round.
import {buildRegistry} from "./manifest.js";
import {FARWAY} from "./farway.manifest.js";

export const REGISTRY = buildRegistry(FARWAY);
