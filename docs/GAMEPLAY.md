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

## Progress (planned)

- **Fuses:** each stair door needs 3 fuses, found at random walkable spots. The carrier is louder (hearing radius ×1.5). Anyone can slot a fuse; the pool is shared.
- **Finale (L4):** taking the last fuse to the exit sets off the alarm. For 60 s every L4 monster hunts toward the exit; run the parking lot to get out. Where the exit sits on L4 is still to be decided after walking the map.
- **Score:** how many escaped out of how many started, the time, and a bonus if nobody went down.

## Roles that emerge (planned)

No assigned classes. The camera watcher matters because monsters show on the handheld map only while a camera currently sees them (today they are pinged all the time). Scouts, carriers and revivers come from the fuse and revive rules.

## Build order

1. Ready-up lobby, group spawn, floor-only position relay: **built**
2. Downed and revive, scream arrow: **built**
3. Close doors: **built**
4. Fuses, gated stairs, fuse counter
5. Monsters on the map only through cameras
6. Monster simulation on the server (catches cheat-proof; no stutter when a host's tab is in the background). Do this before scaling to many players.
7. Finale alarm and scoring
8. Bot players to tune the numbers

## Characters

Five playable characters (`characters/<id>.glb`, picked in the lobby, shown to everyone else with name tags): `plaid`, `suit`, `shorts`, `red`, `white`. Duplicates are allowed. Each has Walking and Running clips; standing still plays the walk almost frozen (no idle clip), crouching walks slowly, being downed lies the model down. `tools/optimize_character.mjs` produced them from the Meshy exports (1024 px WebP texture, ~30–76k vertices, Draco; about 0.5–0.7 MB each).
