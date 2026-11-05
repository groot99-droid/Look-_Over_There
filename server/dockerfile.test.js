// A deploy crashed once because a new server module was not copied into the image. Every file the server imports from its own folder must have a COPY line.
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), read = p => fs.readFileSync(path.join(root, p), "utf8");
const docker = read("Dockerfile"), copied = new Set(docker.split("\n").filter(l => l.startsWith("COPY ") && !l.includes("--from")).flatMap(l => l.split(/\s+/).slice(1, -1)));
test("every local module the server imports is copied into the image", () => {
  const seen = new Set(), queue = ["server/server.js"];
  while (queue.length) {
    const f = queue.pop(); if (seen.has(f)) continue; seen.add(f);
    for (const m of read(f).matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
      const target = path.relative(root, path.resolve(root, path.dirname(f), m[1]));
      if (!target.endsWith(".js")) continue; queue.push(target);
      assert.ok(copied.has(target) || copied.has(target.split("/")[0]), `${target} (imported by ${f}) has no COPY line in the Dockerfile`);
    }
  }
  assert.ok(seen.size >= 5, "walked the import graph: " + [...seen].join(", "));
});
test("the page's audio scripts are copied too", () => {
  for (const f of ["audio/engine.js", "audio/audition.js", "audio/cues.json"]) assert.ok(copied.has(f) || copied.has("audio"), f);
});
