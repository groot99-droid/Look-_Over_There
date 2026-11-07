# Sessions: how the work is split

The Farway plan is too big for one session. This file splits it into sessions that can run side by side, says which must come first, and gives each a brief that stands on its own, since a new session starts from its prompt and a fresh checkout.

Read first: `docs/WORLD.md` (what Farway is), `docs/ROUND.md` (what a round must do), `docs/MANIFEST.md` (the world manifest), `docs/GAMEPLAY.md` (what is built).

## Status

| # | Session | Needs | Status |
|---|---|---|---|
| 1 | Manifest core and loader | | **done**, in the draft PR for `claude/manifest-loader` |
| 2 | Gate return fix, links read from the manifest | 1 | not started |
| 3 | Run record, player stats, results v2 | 1 | not started |
| 4 | Modes and parties | 1 | not started |
| 5 | Backend: Postgres, anonymous accounts, Discord sign-in, leaderboard | 3 | decided, plan in `docs/BACKEND.md`; not started |
| 6 | Overworld v0 | 1, 3 (after 2) | not started |
| 7 | Physics: decision and a playground prototype | | not started |
| 8 | Going back in prototype | 3, 4 | not started |
| 9 | City v0 on Hallam Row | 6 | not started |
| 10 | Editor for scenes and links | 1 | not started |
| 11 | Games inside parties (co-op in Right Door, Wrong Exit and the Intern) | 4 | not started |

Update this table in the last commit of each session.

## Order

```
1 -+-> 2 --------------+
   +-> 3 -+-> 5        +-> 6 -> 9
   |      +-> 4 -+-> 8 --+
   |             +-> 11
   +-> 10
7 (independent)
```

- **Wave A**, after session 1 merges: 2, 3, 7, 10. They touch different files.
- **Wave B**: 4, 5 (decision document first), 6.
- **Wave C**: 8, 9, 11.

## Rules for every session

1. Start from `main` after the manifest PR is merged. Work on a branch named `claude/<short-name>`, one branch and one draft PR per session.
2. Before pushing, run all three:
   - `node --test shared/*.test.js`
   - `cd server && npm ci && npm test`
   - `node tools/manifest.mjs check`
3. A change to what the game does needs a test that fails first and passes after. Say in the PR what you ran and what you did not run. Do not say a browser flow works unless you drove it.
4. Stay inside your files (table below). If you must touch another session's region, keep it to a few lines and say so in the PR.
5. Follow the existing style: short comments that say why. No key or secret in any file, and tests use fake values.
6. When you need a decision from the owner, write the question and the default you will use, and carry on with the default.

### Who touches `index.html`

`index.html` is one large file, so parallel sessions conflict there. Keep to these regions:

| Region | Session |
|---|---|
| gates, `goLink`, `enterGame`, the "That door does not open in a room" toast | 2 |
| the finale and `#results` (markup, styles and code) | 3 |
| the lobby overlay and the join code | 4 |
| `loadScene`, scene types, the options screen at the store doors | 6 |
| held items, consumable slots, the chamber loader | 8 |

Merge order when several are open: 2, then 3, then 6.

---

## Briefs

Every prompt below starts with this line:
> You are working in `groot99-droid/Look_Over_There`. Read `docs/WORLD.md`, `docs/ROUND.md`, `docs/MANIFEST.md` and `docs/SESSIONS.md` first, branch from `main`, and follow the rules in `docs/SESSIONS.md`.

### Session 2: gate return fix, links read from the manifest
- **Goal.** Reproduce the suspected bug first. After Right Door, Wrong Exit ends, the page may call `loadScene(l.scene || S.id)` with `S.id` equal to the passage scene `T`, which has no entry in `SCENES`. Prove it in a headless browser, then fix it using `returnTo` from the manifest. Read the "solo only" toast from the manifest's `soloOnly` flag.
- **Touches.** `index.html` (gates region), a new `tools/gates_test.mjs`.
- **Done when.** The new test fails on `main` for the Right Door, Wrong Exit gate and passes after the fix. Both gates return to L4 at the arrival point in their link. The Intern's gate still works.
- **Prompt.** Reproduce the gate return bug in `tools/gates_test.mjs` (Playwright, same style as `tools/stairs_test.mjs`): walk to each gate in solo play, enter the game, end it, and assert the player is back on L4. For Right Door, Wrong Exit, end it by calling the walk module's finish. For the Intern, post the `intern-ending` message. Show the test failing, then fix `enterGame` using `REGISTRY` and the link's `returnTo`. Make the room toast read `soloOnly`.

### Session 3: run record, player stats, results v2
- **Goal.** RND-20 to RND-23 in `docs/ROUND.md`.
- **Touches.** `server/playerstate.js`, `server/server.js` (stat hooks, the run record), `shared/finish.js`, the `#results` region of `index.html`.
- **Does not touch.** Ranking and accounts.
- **Done when.** The server counts downs, revives, shots, hits, beacons and time per floor. At the end it builds the run record from RND-21 and sends the rows with downs. The results screen shows time, downs and the best time. The first Original finish shows a welcome to Farway and sets `original_complete` on this device. Each counter has a test.
- **Decided.** A death is a down nobody revived (the 45 s ran out, or any down in solo play). Revives given are counted and add to the score. Start from the formula in RND-27 of `docs/ROUND.md`; it is a placeholder.
- **Prompt.** Add per-player counters to the server's player state and tests. Build the run record in `shared/finish.js` as a pure function with tests. Extend the `results` message and the results screen. Store `original_complete` in `localStorage` under one key, wrapped in try and catch.

### Session 4: modes and parties
- **Goal.** RND-10 to RND-14, and the first half of RND-12: a party is a room, each player's place is separate from the party, any player can join or leave a floor at any time, and "go to a friend" jumps to their floor.
- **Touches.** The join and lobby code in `server/server.js` and the lobby overlay in `index.html`; `shared/registry.js` lookups for modes.
- **Done when.** A client joins with a `mode`. The room takes its floors, size and finish from the manifest. A party key groups people by mode and code. `GET /rooms?mode=` lists open rooms. The server refuses to start if the manifest's room size exceeds the player colours.
- **Decided.** Room size is 10 (done in the manifest PR). Make sure the lobby, name tags and spawns handle 10.

### Session 5: backend (Postgres, anonymous accounts, Discord sign-in, leaderboard)
- **Decided.** `docs/BACKEND.md` is the plan: Postgres as its own Railway service, anonymous accounts first, Discord sign-in, server-only writes, 18+ audience. Email and marketing come later.
- **Goal.** The five build steps in `docs/BACKEND.md`: the store interface with an in-memory and a Postgres implementation, anonymous sessions, Discord sign-in, run records and the leaderboard, and the privacy routes.
- **Touches.** New files under `server/store/` and `server/auth/`, a few lines in `server/server.js` (the join and the end of a round), new migration files. Nothing in `index.html` except a sign-in button and the leaderboard screen, kept to a small new region.
- **Needs.** Session 3 merged for steps 4 and 5. Steps 1 to 3 can start earlier.
- **The owner must first** create the Discord application, add the Railway Postgres service and set the variables listed in `docs/BACKEND.md`. Never put a secret in a file, a test or a chat.
- **Done when.** The existing server tests pass unchanged against the in-memory store, a reload keeps `original_complete`, Discord sign-in works against a fake Discord in tests, and a time sent by a client is refused.
- **Prompt.** Follow `docs/BACKEND.md` step by step. Start with the store interface and migrations, with every existing test passing on the in-memory store. Use a fake Discord server in tests. Say in the PR what ran against a real database and what did not.

### Session 6: Overworld v0
- **Goal.** The smallest Overworld. Promote `overworld` to built in the manifest with a `parking_lot` scene made from `world/Exterior.glb`, the table and chairs as the spawn, the Look Over There store doors, and one sky mode. Walking out of L4 after the Original continues into it. The store doors show an options screen: Original, or Going back in (disabled, "soon"). The link `lot.L4.front_doors>overworld` requires `original_complete`.
- **Touches.** The `loadScene` and scene-type region of `index.html`, new files under `world/`, the manifest.
- **Does not touch.** The city, the bus, the forest, physics.
- **Done when.** A solo round ends in the Overworld, a reload keeps the flag, and `node tools/manifest.mjs check` passes with the Overworld built.
- **Needs.** Sessions 1 and 3, and after session 2.

### Session 7: physics decision and playground prototype
- **Goal.** Choose how objects get gravity and physics everywhere. Compare a WASM engine (Rapier) with a small JS one (cannon-es) on download size, step cost with 200 bodies, and fit with the existing box colliders. Write `docs/PHYSICS.md`. Build an isolated prototype (a kickable ball, a swing) under `tools/physics/`.
- **Does not touch.** `index.html`. Nothing merges into the game until the owner accepts the document.
- **Decision to carry on with a default.** Physics objects are visual only in rooms (each client simulates them, the server does not).

### Session 8: Going back in prototype
- **Goal.** GBI-1 to GBI-8 for one floor. A chamber scene loaded through the manifest, the wave starting on entry, a stairs-down chamber, a loadout locker, consumable slots on Q and E, and one lethal weapon with its own ammo rule (the hunting crossbow).
- **Needs.** Sessions 3 and 4. Split it further before starting if it grows.

### Session 9: city v0 on Hallam Row
- **Goal.** A street scene reached by the bus, the apartment with its computer, a 15-minute game day, the night rule (stores close, then danger), and the Intern's job at 666 Hallam Row through the shared application quiz.
- **Needs.** Session 6.

### Session 10: editor for scenes and links
- **Goal.** A local page for placing doors, spawn points and links and writing them to the manifest and the scene files. Decide first whether the manifest becomes JSON with a thin JS wrapper (so a tool can write it safely); `node tools/manifest.mjs export` already produces the JSON.
- **Needs.** Session 1.

### Session 11: games inside parties
- **Goal.** RND-15. Co-op inside Right Door, Wrong Exit and the Intern is optional: a player can enter a game alone or with friends, and friends can pop in at any time. A party of 10 can split across levels and games.
- **Needs.** Session 4 (a party is a room, and a player's place is separate from the party).
- **Start with a design note** in `docs/ROUND.md` before code: one instance per party and game, which players are in it, and what is shared. Default for version 1: players in the same instance see each other walk (presence and positions only), and each player's puzzles stay their own. Shared puzzle state comes later.
- **Done when.** Two clients enter Right Door, Wrong Exit separately, meet in one instance, and leave without breaking the other's game. The gate's `soloOnly` flag is dropped for that game in the manifest. Then the same for the Intern.
