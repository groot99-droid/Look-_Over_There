import test from "node:test";
import assert from "node:assert/strict";
import {newRun, exitPlayer, done, finish, results, fmtTime} from "./finish.js";

test("places go in the order players leave, with their time", () => {
  let run = newRun(1000);
  const a = exitPlayer(run, 7, 61000, "Ann"); run = a.run;
  assert.deepEqual(a.entry, {id: 7, name: "Ann", place: 1, ms: 60000});
  const b = exitPlayer(run, 3, 95000, "Bo"); run = b.run;
  assert.equal(b.entry.place, 2); assert.deepEqual(results(run).map(r => r.id), [7, 3]);
});
test("leaving twice changes nothing; no run or an ended run refuses", () => {
  const run = exitPlayer(newRun(0), 1, 10, "A").run;
  assert.equal(exitPlayer(run, 1, 20, "A"), null);
  assert.equal(exitPlayer(null, 1, 20), null);
  assert.equal(exitPlayer(finish(run), 2, 20), null);
});
test("the round is done when everyone still present is out, once", () => {
  let run = newRun(0);
  assert.equal(done(run, [1, 2]), false);
  run = exitPlayer(run, 1, 5).run; assert.equal(done(run, [1, 2]), false);
  assert.equal(done(run, [1]), true, "the one who is left behind has left the room");
  assert.equal(done(run, []), false);
  run = exitPlayer(run, 2, 9).run; assert.equal(done(run, [1, 2]), true);
  assert.equal(done(finish(run), [1, 2]), false, "already announced");
});
test("input is never mutated and times format as m:ss", () => {
  const run = newRun(0), frozen = JSON.stringify(run);
  exitPlayer(run, 1, 5); assert.equal(JSON.stringify(run), frozen);
  assert.equal(fmtTime(0), "0:00"); assert.equal(fmtTime(65400), "1:05"); assert.equal(fmtTime(3725000), "62:05");
});
