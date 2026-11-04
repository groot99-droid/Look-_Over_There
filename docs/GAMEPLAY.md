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

- **You:** walk 4 m/s (quiet), hold R (press in the left stick on a controller) to run at 7.5 m/s (loud) for about 4 s, then a short recovery (the bar under the screen, back to 30% before you can run again), crouch (Shift; B or a push of the right stick on a controller) at 2.2 m/s (silent). A monster chases at 5.4 to 5.7 m/s, so running pulls away from one and walking does not.
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

## Fighting back: the Error Deletion Ray (planned)

The gun is `models/gun.glb` (Meshy's "Error Deletion Ray", 10k triangles). It is not in the game yet. These are the owner's decisions and the rules built from them; anything marked *assumed* is mine and open to change.

**Decisions (owner).**
- A hit **does not kill: it no-clips the monster to another place on the map** (the ray deletes it from where it stands and it reappears elsewhere).
- Ammo is **scarce and found on every floor**.
- **One gun per player, found on B1** (lockers in the opening).
- A shot is **as quiet as running** (heard at 9 m, halved through a wall), not an alarm.

**The shot.** Aim with the camera; fire with the left mouse button or `F` (controller: the right trigger; run and crouch moved to the stick clicks). Hitscan: a ray from the camera, 25 m long, blocked by walls and shut doors (the same `segClear` test the monsters' sight uses), hitting a monster inside a 0.6 m radius, 2.2 m tall capsule. One shot every 0.6 s. No reload: the rounds you carry are your magazine. You cannot fire while carrying a fuse (your hands are full: drop it first), while crouching-and-reviving, or while downed.

**What a hit does (assumed details).** The monster glitches for 0.5 s (a flicker and a cyan scanline), then is placed at a spot on its own floor that is at least 35 m away by path from every player, out of every player's sight and at least 15 m from any player; it forgets its chase, waits 4 s, and goes back to patrolling. It cannot be banished again for 8 s. The spot is random among those, so the ray can land a monster near an objective: it relieves a chase, it does not clear a floor. Other monsters are not affected; a monster that was chasing someone else keeps chasing.

**Ammo (assumed numbers).** A gun starts with 3 rounds; an ammo pack holds 3; you carry at most 9. B1 has 8 lockers (one gun each, taken once by whoever opens it, a player holds one) plus 3 packs; L1, L2 and L4 have 3 packs each; L3 (no monsters) has 4, as the place to restock before the finale. Packs sit at seeded spots in the floor's main walkable area (like the fuses and notes), the same for everyone, and are taken once for the whole room. Rounds are never shared between players except by dropping: a downed player keeps their gun and rounds.

**What it changes.**
- *The game's premise:* monsters were unbeatable and the answer was hiding. Now there is a way out of a chase, but a scarce one: three rounds is about one escape per player per floor. Expect the 8 to 11 downs per bot on B1 to fall a lot; the bots (below) are how to check.
- *Roles:* the bait stops being a sacrifice, since a hit sends the lure's monster away; the scout can clear the stairs; the runner can shoot a monster off a fuse.
- *Noise:* a shot is not an alarm (it is a run), so shooting a monster that is watching you does not call the others, but two monsters near each other will still hear it at 9 m.
- *Cameras and the map:* a banished monster only shows on the map if a camera sees where it lands.
- *The finale:* the 60 s alarm sends every L4 monster to the doors; the rounds saved for L4 (3 packs and what is left from L3) decide whether the last run is a rush or a fight.
- *Scoring:* worth adding later: shots fired and hit, and rounds left at the exit.
- *Tuning to revisit once it exists:* the monsters' chase speed against the run speed, the 45 s down time, the sight range, how many monsters B1 needs.

**How it is built (the architecture).**
- `shared/loot.js` (pure, with tests): lockers and ammo packs per floor, taken once; the same rules in the server and in solo play, like `shared/fuses.js`.
- Server: relays loot state to the floor (late joiners get it on arrival) and sends a `shot` message only to the host of the shooter's floor; the host resolves it, because the host already runs the monsters. A banish is a position jump in the host's snapshot (clients already snap a monster that moves more than 8 m) plus a `zap` message so every client plays the effect.
- Client: the held gun (scaled to about 0.55 m, bottom right, a short recoil kick and a cyan flash from the tip), a small cross-hair, a round counter, lockers and packs drawn in code like the fuses, and the other players seen holding it.
- Monster: a `banish(spot)` method and the placement rule above.
- Bots: a bot with rounds fires at a chasing monster that is within 12 m, in sight, when its escape margin is under 2 s, and the bait uses it to pull a monster off the runner's way. Then rerun `tools/bots.mjs` and compare downs per floor with and without the gun: the first real test of the idea.

**Build order.** 1. `shared/loot.js`, the server relay, lockers and packs: **built** (below). 2. The held gun, firing, hit and banish: **built** (below). 3. The bots' use of it and the comparison run: **built**; first result below (the gun cuts downs by about a third and does not by itself let a team finish B1). 4. Tuning, then scoring.

**Settled (owner).** "Another location" means far away and out of sight (at least 35 m by path from every player, out of every player's view, at least 15 m from any player), as written above, not a fixed set of spots. The banished monster visibly flickers out and in (a 0.5 s glitch and cyan scanline). *Still open:* friendly fire is assumed off.

**Step 1, built: lockers and ammo packs.** B1 has 8 lockers and 3 packs; L1, L2 and L4 have 3 packs each and L3 has 4 (the numbers above). They stand at seeded spots in the floor's main walkable area, the same for everyone (lockers at least 6 m apart where the floor allows, packs 10 m). Press E (or X on the controller) within 1.5 m: a locker gives you the gun with 3 rounds (once per player: a second locker is refused while you carry one), a pack adds 3 rounds (refused at 9). A locker or pack is taken once for the whole room, and a late joiner sees what is gone; a player who leaves puts their locker back, so a room can always arm everyone. The rounds show bottom right as `RAY ● ● ● 3/9`. Rules: `shared/loot.js`; the server keeps the state per floor and checks every pickup. The gun itself cannot be fired or seen yet (step 2). Solo play uses the same rules locally.

**Step 2, built: the gun in your hand.** Once you have a gun it is held bottom right (the Meshy model, scaled to about 0.55 m, with a short kick and a cyan flash when it fires). Fire with the left mouse button (once the mouse is captured), `F`, or the controller's right bumper (the cameras keep LB and D-pad right). One shot every 0.6 s, each costs a round. You cannot fire with a fuse in your hands, with the map or camera device out, while downed, or at the end screen; with no rounds it clicks ("Out of rounds").
- *The ray:* from your eye along the aim, 25 m long, stopped by walls and shut doors; a monster is hit if the ray passes within 0.6 m of any of three points up its body. A thin cyan beam is drawn to where the ray ended, for you and for everyone on the floor.
- *A hit:* the floor's host (who runs the monsters) decides it. The monster is deleted: it flickers for 0.5 s while it does nothing, then stands at a spot on its floor that is at least 15 m from every player, out of every player's sight, and (where the floor allows) at least 35 m away by path; it forgets the chase, waits 4 s and patrols again. It cannot be banished again for 8 s: a shot at it in that time is a wasted round. Everyone sees the glitch at both places (a cyan flash) because the host announces it (`zap`).
- *Noise:* a shot is heard as a run (9 m, halved through a wall) for half a second, even if you are crouching: the shooter counts as running for the monsters' hearing.
- *In a room:* a shot from anyone but the host goes through the server to the floor's host only; the server sends everyone else just the beam. Rounds are counted by each player's own game (a modified client could cheat), like the rest of the trust in this build, and the hit itself is the host's call. The host works out the landing spot, which can cost it a moment (a few path searches) on a big floor.
- *Not done yet:* the other players are not seen holding the gun; the bots do not use it (step 3); there is no sound (the game has none yet).

## Bots for tuning

`node tools/bots.mjs [bots=3] [--timeout=600] [--deaths] [--trail] [--debug]` runs N real game clients (headless browsers, `?bot=1`, the game's own code, no drawing) in one room on a local server and prints a report: time on each floor, downs, revives, stuck moments, seconds fleeing and waiting, tick rate, and each bot's place, time and the alarm left when it got out. Run it locally; it is slow in software rendering. The bots' mind is `tools/bot_brain.mjs`.

**How they think.** Everything runs on the game's own walkable grid.
- *Arrival times.* Dijkstra distance fields from the bot and from every monster on the floor. The bot covers a distance in `tb(d)` (running while its stamina bar lasts, then walking); a monster in `d / chase speed`. The **margin** of a cell is the least, over the monsters, of (monster time to the cell minus bot time to the cell): positive means the bot gets there first by that many seconds.
- *Safe route.* The cheapest path that keeps out of every monster's sight ring (16 m, 8 m if crouching) and uses only cells with a margin of at least 2 s; the margin and the ring are relaxed in steps (2 s and 60% of the ring, 1 s, 0 s, then anything). If only a risky route is open, the bot waits still and quiet (crouched) while its spot is safe, up to 25 s, as a patrol passes.
- *Flee.* From the reachable cells with a margin of at least half a second it picks the best-scored one that every chaser's line of sight misses (and, for the bait, that is far from the runner), preferring open space over dead ends, runs there, then crouches and keeps still for 6 s.
- *Team* (the runner process relays a blackboard of every bot's position, role and claim every 0.4 s): the **runner** fetches what the floor needs (fuses, switches, notes) and claims one item so two bots do not go for the same; the **bait** goes to a visible spot 9 to 13 m from the monster that threatens the runner most and draws it off (and flees away from the runner); the **scout** waits at a safe spot near the stairs, types the code on L2 and throws the L3 power. With no runner left on a floor the others do the runner's work, and anyone lifts a downed teammate when the way is safe.

**What the runs showed (3 bots, B1, 600 s each).** Nobody got off B1 in any of them. Downs per bot: plain bots 8 to 11 (and about the same with the new monster rules: they run straight at monsters and away in a straight line); team bots with margins and hiding 8 to 10; with the patient waiting and open-space fleeing 6, 6 and 8. A bot is down for 45 s each time, so six downs is most of a round, and a third of the rest was spent waiting for patrols. The harness is sound: the tick rate is a steady 50 ms with no stalls, and the measured speeds are exactly walk 4, run 7.5 and crouch 2.2 m/s.

**The gun, with and without (step 3).** The bots now arm themselves (each opens a locker on B1, claiming one so two bots do not go for the same), pick up an ammo pack that is within about 22 m by path when they are down to 5 rounds or fewer, and fire at a chasing monster that has come within 13 m, aimed at its body, only when the ray would hit it (not through a wall, not at a monster that is still immune or glitching), while they keep fleeing. `node tools/bots.mjs 3 --nogun` is the control: the same team that never arms. Two pairs of 600 s rounds, 3 bots on B1 each (downs per bot, bait and scout and runner in that order of the log):

| | gun | no gun |
|---|---|---|
| run 1 | 4, 6, 5 (15) | 9, 6, 8 (23) |
| run 2 | 2, 7, 7 (16) | 7, 8, 9 (24) |

- *The gun roughly cuts downs by a third* (31 against 47 over the four runs): 12 and 12 shots, every one a hit, every round spent (3 rounds each plus packs; each bot ended with none), so the three starting rounds are used up well inside the 10 minutes. Armed times were slow in the second pair (26, 67 and 74 s) because the lockers are spread out.
- *It did not let anyone finish B1.* Fuses in the door: 0 of 3 in all four runs, with or without guns. Downs are only part of the cost: a bot downed 7 times is out for 7 x 45 s = about 5 of the 10 minutes, the team also waits for patrols (about 150 s each for the runner and the bait) and crosses about 80 m to the fuses.
- *Run to run the spread is large* (a bot's downs ranged 2 to 9), so one pair of runs shows a direction, not a measurement.
- *What to try next, in order:* a short down time (45 s is long for a bot team and probably for people), ammo for the whole trip (more packs or more rounds per pack on B1), and a spawn nearer the fuses or fuses nearer the spawn. The bots can run each of these changes in about 10 minutes.

**What it says about the floor.** The room spawn on B1 is at the far east (about x 14, z -22) and the fuses are in the west, so a team has to cross the whole floor, about 80 m of path, through the corridor near x 0 to 9, z -10 to -15 where nearly every death happened, and where the monsters from (24, -8), (3, 6) and (-7, -1) all patrol. Dying twice within 0.2 m of the same spot says the route, not the bot, is the problem. Before blaming the bots, consider: moving the spawn nearer the fuses (or the fuses nearer the spawn), thinning B1's four monsters, and giving that corridor a way round.

**Not done:** no bot has finished a floor, so there are no L1 to L4 timings, no alarm margin and no placings from them yet. The bots do not shut doors behind them (the doors-as-a-tool idea), and they read the monsters' positions straight from the game.

## Health and spawns (built)

- **Health.** 100 HP. A monster touch (within 1 m, line of sight) hits for 35, at most once every 1.2 s per monster, and you get a 1 s grace after any hit, so three hits (in about 3 s or more) down you. +1 HP/s after 10 s without damage. A lifted teammate returns with 50 HP; a self-respawn after the down timer gives 100. HUD: bar bottom-left, a red flash on a hit, a stronger vignette under 36 HP; a teammate's HP shows as a thin bar under their name. Rules: `shared/health.js`; the floor's host decides a touch and relays `{t:"hit", dmg}` (server: host only, damage clamped 1..50). HP is trusted to each client, like ammo.
- **Spawns.** Each player draws their own random spot at round start and after every down, on every floor: `shared/spawn.js`, weight `exp(-d/15) + 0.02` with d the distance to the nearest unfinished objective (B1 fuses not in the door, L1 switches off, L2 notes not found; L3 and L4 uniform), never within 16 m of a monster. On B1 the median spawn is 11.4 m from a fuse against 18.8 m for a uniform draw.
- **Bots (4, guns, 600 s, B1).** Before: 0/3 fuses in the door in all four runs, team downs 15 to 24. After health + spawns: 1/3 fuses, 13 team downs (2, 5, 2, 4), the floor still not finished. Bots do not yet read their HP.

## The cloak and the AFK Beacon (built)

- **Cloak** (`models/cloak.glb`, `shared/cloak.js`). One per player, in the same B1 locker as the gun. `V` (controller: left trigger) toggles it. On, monsters cannot see you beyond 1.5 m, but they still hear you (running while cloaked is loud). The battery lasts about 15 s of use and recharges in about 45 s after a 2 s wait while off; it cannot be switched on below 10%. You see a cyan edge shimmer and a battery bar; teammates see you flicker. Held at the bottom left.
- **AFK Beacon** (`models/beacon.glb`, `shared/beacon.js`, `shared/loot.js`). Two lie on every floor (taken once, carry at most 2). `G` (controller: right bumper) rolls one up to 12 m ahead (it stops at a wall). For 25 s every monster within 30 m of it goes to a spot on a 1.5 to 3 m ring round the can and idles there facing it, shuffling apart when they bump; they ignore players, even a monster already chasing drops the chase, unless a player is within 4 m of that monster (it still sees them). When the 25 s end they search at the can for 6 s and then patrol. The thrower sends `{t:"beacon", x, z}`; the server relays it to the rest of the floor; the floor's host runs the lure. The can shows a pulsing LED and a ring that shrinks with the time left.
- **Models.** Both Meshy exports (12 to 16 MB, 10k triangles, 2048 px maps) were reduced to 1024 px WebP maps and Draco: `beacon.glb` 0.9 MB, `cloak.glb` 0.8 MB, geometry unchanged. The beacon is 1.9 x 1.2 x 0.8 units (shown 0.36 m long); the cloak 1.0 x 1.9 x 0.6 units (held at 0.12x).
- **Bots.** They pick up beacons within 20 m, roll one at a chaser 7 to 22 m away, and switch the cloak on when a monster is within 14 m and off when clear; below 50 HP they flee a monster that is not on patrol.
- **Bot run with everything (4 bots, guns, cloak, beacons, 600 s, B1).** 0/3 fuses in the door, 17 team downs (4, 5, 5, 3), each bot hit 7 to 10 times, cloak on 71 to 100 s each, beacons thrown 0, 0, 0, 2. Not better than the health + spawns run (1/3, 13 downs); one run each is within the spread seen before (15 to 24 downs), so this says only that the items did not obviously help yet. The bots rarely walk to a beacon and the cloak is on whenever a monster is within 14 m, which drains it early; both are tuning for later.
