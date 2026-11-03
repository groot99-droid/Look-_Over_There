# Gameplay plan

A co-op round for 2–8 players: climb the building together (B1 → L1 → L2 → L3 → L4) and get out. About 20 minutes.
Status: **built** = in the game and covered by `tools/mp_test.mjs` / `server/server.test.js`; **planned** = not built.
The numbers are starting points, not tuned.

## The round

| Stage | Floor | Time | Notes |
|---|---|---|---|
| Ready-up | lobby | 1 min | **built.** Pick a character, ready up, a short countdown, the group spawns together on B1. Someone joining mid-round skips the lobby. |
| 1 | B1 pools | ~4 min | Sinew of the Abyss. The teaching floor. |
| 2 | L1 offices | ~5 min | The Pale Traveler. 127 doors, so doors matter. |
| 3 | L2 | ~5 min | The clawed creature. The biggest floor. |
| 4 | L3 white room | ~1 min | No monsters. Checkpoint: everyone regroups. |
| 5 | L4 showroom + lot | ~4 min | The first creature. Alarm hunt at the end. |

## Surviving

- **Crouch** halves how far monsters see you and makes no noise, but you move at 2.2 against their 5.4–5.5 chase speed: you cannot outrun one, so you hide and use doors. (built; original)
- **Close doors** (built): X / E on an open door shuts it, unless someone is standing in it. Monsters open doors (0.5 s each) but never shut them; stair doors never shut. A door you shut is shut for everyone.
- **Downed, not dead** (built): in a room, a caught player drops where they fell and everyone else on the floor gets a scream arrow toward the body. A teammate holds E / X beside them for 4 s to lift them (and gets 4 s of safety afterwards). Unrevived after 45 s, you wake at the stairs you came up. Solo play keeps the old rule: die, wait 3 s, respawn somewhere random.
- **Floors are private** (built): you only learn that someone is on another floor, never where.
- **Monster count scales** (planned): 3 per floor for 1–2 players, 4 for 3–5, 5 for 6–8.
- **Floor reset** (planned): if everyone on a floor is down at once, its fuses reset and you restart at the stairs.

## Progress: one puzzle per floor

The stair door at the top of each floor stays locked until that floor's puzzle is solved. The order the owner chose:

| Floor | Puzzle | Status |
|---|---|---|
| B1 | **Fuses:** 3 lie around the floor; carry them one at a time to the stair door | **built** |
| L1 | **Switches:** two far-apart switches, flipped one at a time in any order; each flip is loud and draws nearby monsters to look | **built** |
| L2 | **Keypad:** a 4-digit code, each digit on a note found at a different place, shared by the team | **built** |
| L3 | Break floor, no monsters. A **fuse box** here is an optional shortcut that powers L4's doors early | **built** |
| L4 | **The trick:** the store's glass doors are shut unless the power is on; the L3 box turns it on early, otherwise the power switch is on the far side of the room, with the monsters | **built** |

### Fuses (built)
- Three fuses per gated floor, in the same places for everyone (seeded, in the floor's main walkable area, away from the door and from where monsters start). Press E / X within 1.5 m to pick one up; E / X at the door puts it in. One carried at a time. Three lamps above the door go from red to green.
- Priority of E / X: lift a downed teammate, then pick up a fuse, then the door.
- A carrier is easier to find: monsters hear a carrier walking or running 1.5x as far, and a crouching carrier is no longer silent (heard at 0.4x the hearing range) and is seen from 0.75x instead of 0.5x. Other players see a glow round a carrier.
- A downed carrier drops the fuse where they fell. A carrier who leaves the floor or the room puts it back where it started. A powered door stays powered.
- State is held by the server per room (`shared/fuses.js` is the one rule set, used by the server and by solo play); a late joiner sees the current state.
- The art is drawn in code for now; an optional `models/fuse.glb` replaces it (`docs/MODELS.md` has the Meshy prompts and the budget).

### Switches (built)
- Two switch posts stand at least 14 m apart (usually 25+), in the same places for everyone (seeded, like the fuses). Press E / X within 1.6 m to flip one. They are flipped one at a time, by anyone, in any order, and stay flipped; both on powers the stair door. The lamps over the door and the HUD (`SWITCHES 1/2`) show progress.
- A flip is loud: every monster on the floor within 40 m goes to look at the switch (unless it is already chasing someone). The floor's host runs the monsters, so this works the same in a room and solo.
- A player arriving on the floor later sees which switches are already on. State is held by the server per room (`shared/switches.js` is the one rule set).
- Placeholder art in code; an optional `models/switch.glb` replaces it (see `docs/MODELS.md`).

### Keypad (built)
- Four notes stand at least 8 m apart (usually 15+), in the same places for everyone. Note *i* holds digit *i* of the code. Press E / X within 1.5 m to read one: that digit is shown to the whole team (a toast, the `CODE _ 2 _ 3` line in the HUD, and the "Notes found" line on the keypad). A note is read once.
- Press E / X at the locked door to open the keypad: type the digits with the number keys, Backspace, Enter (or click the buttons); Esc or E closes it. You cannot move while it is open. The code is made by the server when the room first reaches the floor and never leaves it: clients only ever receive the digits that were found. Solo play keeps the code in the game.
- A wrong code is loud and locks the keypad for 8 s for everyone: every monster within 40 m of the door goes to look. Typing during the lock does nothing. Malformed input (not 4 digits) is ignored, not counted.
- A late joiner sees which notes were already read. Rules: `shared/keypad.js`.
- The notes and the door panel are drawn in code; `keypad` in `docs/MODELS.md` is not wired to a model yet.

### Power: the L3 box and the L4 trick (built)
- The room has one power flag (`shared/power.js`). It starts off and is thrown **once**, by anyone, and stays on. Two places can throw it: the **power box on L3** (the prop that is already in the Blender file, at the south wall, with a lever and lamp added) and a **power switch on L4** in the far north-west alcove of the store, about 49 m from where the stairs bring you in.
- **Off:** the store's glass entrance is shut, and the model has no collider there, so a collider is added across the 5.4 m opening; monsters cannot pass either. **On:** the glass rolls up out of the opening, the collider goes, and the monsters' walkable map is rebuilt so they can use the way out too.
- The L3 box is silent (no monsters on L3), so it is the quick, safe way. The L4 switch is loud: every monster within 40 m goes to look at it, the same as the L1 switches.
- Everyone in the room hears of it wherever they are: a toast, `POWER ON` in the HUD, and the doors are already open when you arrive. A late joiner is told in the welcome message. L3 to L4 stairs are never locked.
- The L4 switch is a placeholder in code (the L3 box is the real model). The finale is below.

### Finale: the alarm, the way out, the parking lot (built)
- **The alarm** goes off once the L4 doors are open and someone is in the store: if the L4 switch is thrown, at once; if the quiet L3 box was used, when the first player arrives. It lasts 60 s (`ALARM 0:41` in the HUD, a red pulse at the screen edge). While it runs, every L4 monster heads for the doors every 2 s, unless it is already chasing someone. A late joiner is told how much of it is left.
- **The way out:** walking out of the store onto the parking lot (past z 28.8 between the doors) is your finish. The lot is safe: it is off the monsters' map, and a player who is out is not a target. You can walk back in to help a teammate; your place stays.
- **The round ends when everyone still in the room is out.** Someone who leaves the room does not hold it up. Then everyone sees the results: place (the order they left), time (from the start of the round), and the best time on this browser (`BEST` or `NEW RECORD`). Solo ends the moment you walk out.
- Rules: `shared/finish.js`; the server keeps the run and the alarm (`exit` is accepted only from L4 with the power on).
- Not done: a siren sound (the game has no audio yet); the best record is per browser, not shared; the 60 s and the hunt are untuned.

## Movement, sight and hearing

- **You:** walk 4 m/s (quiet), hold R (right trigger on a controller) to run at 7.5 m/s (loud) for about 4 s, then a short recovery (the bar under the screen, back to 30% before you can run again), crouch (Shift) at 2.2 m/s (silent). A monster chases at 5.4 to 5.7 m/s, so running pulls away from one and walking does not.
- **They see** up to 16 m in a 110 degree view and need a clear line (8 m if you crouch). A monster that has seen you runs to the spot where it last saw you, not to where you are now, and gives up 2.5 s after losing sight (or on arriving), then searches that spot for 6 s.
- **They hear** by what you are doing: running at the full range (9 m), walking at half (4.5 m), crouching not at all (a crouching carrier at 0.4x). A wall between you halves it. Hearing sends a monster to look, at its searching pace, never straight into a chase; only seeing you starts a chase.
- The numbers are `NOISE_WALK`, `NOISE_CARRY_CROUCH`, `NOISE_WALL`, `CHASE_LOSE_S`, `SEARCH_S` above `class Monster`, and `WALK_SPEED`, `RUN_SPEED`, `RUN_S`, `RECOVER_S` by the player, in `index.html`. All untuned until the bots and real players have used them.

## Roles that emerge (built)

No assigned classes. **Monsters show on the handheld map only through the cameras** (built): every security camera on the floor sweeps on its loop, and a monster inside a camera's view (within 40 m, not behind a wall) is marked on everyone's map with pulsing rings; the mark stays at its last seen spot and fades over 3 s. A floor's blind spots are the places no camera reaches. Nobody has to hold a feed open, but the map is only as good as the sweep, so a player who watches the feeds can tell the team what the map cannot. Each client runs the cameras on its own clock, so two players' sweeps can be a few seconds out of step. Scouts, carriers and revivers come from the fuse and revive rules.

## Build order

1. Ready-up lobby, group spawn, floor-only position relay: **built**
2. Downed and revive, scream arrow: **built**
3. Close doors: **built**
4. Fuses and the gated stair door: **built** (B1). Switches on L1, the keypad on L2, and the L3 box / L4 power trick: **built**. The finale and score (7) are built too. The next steps are server-side monsters (6) and bots (8).
5. Monsters on the map only through cameras: **built**
6. Monster simulation on the server (catches cheat-proof; no stutter when a host's tab is in the background). Do this before scaling to many players.
7. Finale alarm and scoring: **built**
8. Bot players to tune the numbers: **first version built** (`tools/bots.mjs`, see below)

## Characters

Five playable characters (`characters/<id>.glb`, picked in the lobby, shown to everyone else with name tags): `plaid`, `suit`, `shorts`, `red`, `white`. Duplicates are allowed. Each has Walking and Running clips; standing still plays the walk almost frozen (no idle clip), crouching walks slowly, being downed lies the model down. `tools/optimize_character.mjs` produced them from the Meshy exports (1024 px WebP texture, ~30–76k vertices, Draco; about 0.5–0.7 MB each).

## Bots for tuning (first version)

`node tools/bots.mjs [bots=4] [--timeout=900] [--debug]` runs N real game clients (headless browsers, `?bot=1`, the game's own code, no drawing) in one room on a local server and prints a report: time on each floor, downs, revives, stuck moments, seconds spent fleeing, and each bot's place, time and the alarm left when it got out. A bot walks the game's walkable grid to what its floor needs (fuses, switches, notes and the code, the L3 box, the L4 doors), crouches when a monster is near, runs from one that is chasing, and lifts downed teammates. Run it locally; it is slow in software rendering.

**What the first runs showed, before the movement and hearing change above (3 bots, B1, about 500 s):** nobody got off B1. Each bot was downed 6 to 10 times, about once per respawn. The monsters chase at 5.4 to 5.7 m/s and the player runs at 5.6, so once a monster has locked on you can hardly shake it; crouching and fleeing made little difference (8 to 9 downs instead of 9 to 10). The bots are not clever (no hiding, no use of doors), so this is a worst case, but it points at three numbers to look at first: the monsters' chase speed against the player's run speed, the 16 m sight with a 110 degree view, and where a downed player wakes up (the stairs, which may be where the monster was).
