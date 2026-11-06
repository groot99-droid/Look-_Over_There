# The round: requirements

A **round** is one play-through of a **mode** by a **room** of 1 to 8 players: from the ready-up to the results. This file says what a round must do for Farway.

- **BUILT**: it is in the game now and a test covers it (`tools/mp_test.mjs`, `tools/stairs_test.mjs`, `server/*.test.js`, `shared/*.test.js`).
- **CHANGE**: it exists and must change.
- **NEW**: nothing exists yet.
- **OPEN**: it needs a decision from the owner first. The question is in the "Decisions" list.

Modes live in the world manifest (`shared/farway.manifest.js`, `modes`): `original` is built, `going_back_in` is planned. A mode names its area, its floors in order, its room size and how a round finishes. Docs: `docs/MANIFEST.md`, `docs/GAMEPLAY.md`, `docs/SESSIONS.md` (who builds what).

## Round states

```
join (room code) -> LOBBY (pick a character, ready up)
  -> everyone ready -> COUNTDOWN 10 s -> PLAYING (stages, floor by floor)
  -> everyone still in the room is out -> RESULTS -> [Play again] or [Walk out to the Overworld]
A player who joins during PLAYING skips the lobby and spawns with the group. A round runs until the room empties.
```

## A. The round today and what it needs

| ID | Requirement | Status | How we know |
|---|---|---|---|
| RND-1 | A room is joined by code. It holds `modes.<mode>.players.max` players (8) and refuses more with `{t:"full"}`. | BUILT | `server/server.test.js` |
| RND-2 | Lobby: pick one of five characters, ready up. When everyone is ready a 10 s countdown starts, then the round starts for the room. Someone who joins mid-round skips the lobby. | BUILT | `tools/mp_test.mjs` |
| RND-3 | The stages are the mode's floors, in order. A gated floor's stair door stays locked until its puzzle is solved: fuses (B1), switches (L1), a keypad (L2). L3 has none. L4 needs power. | BUILT | `shared/*.test.js`, `tools/stairs_test.mjs` |
| RND-4 | On L4 the store's glass doors open when the power is on, then a 60 s alarm runs. Walking out onto the parking lot is your finish. | BUILT | `shared/finish.test.js`, `shared/power.test.js` |
| RND-5 | The round ends when everyone still in the room is out. Place is the order you left in. Someone who leaves the room does not hold it up. Solo ends the moment you walk out. | BUILT | `shared/finish.test.js` |
| RND-6 | A caught player is downed, not dead. A teammate revives them in 4 s. After 45 s they wake at the stairs they came up. Solo: die, wait 3 s, respawn somewhere random. | BUILT | `server/playerstate.test.js` |
| RND-7 | The server owns each player's HP, rounds, beacons, cloak and down state. A client sends intents and cannot give itself anything. | BUILT | `server/playerstate.test.js` |
| RND-8 | Monsters run on the server at 20 Hz, one simulation per room and floor that has a player. Snapshots go out at 10 Hz. | BUILT | `server/floors.test.js` |
| RND-9 | A round must never name a floor that is not a multiplayer scene of the manifest. | BUILT (session 1) | `shared/manifest.test.js`, `server/server.test.js` |

## B. What Farway adds

### Modes and parties

| ID | Requirement | Status | How we know |
|---|---|---|---|
| RND-10 | A client joins with a `mode`. The server reads the mode's floors, room size and finish from the manifest, and a room keeps one mode for its life. | NEW | A test joins `original` and `going_back_in` rooms and checks each one's floors and cap. |
| RND-11 | The room size comes only from the manifest. Raising it to 10 must fail at server start until there are 10 player colours and 10 character slots. | CHANGE (guard built in session 1) | `server/server.js` throws at start if colours are short. |
| RND-12 | A party key groups people by game: the same mode and the same code. Friends can join a party's running round at any time. | NEW | Two clients with the same party key land in one room whatever the order. |
| RND-13 | The server can list open rooms for a mode: code, mode, players, phase, floor furthest along. | NEW | `GET /rooms?mode=original` returns only open, non-full rooms. |
| RND-14 | The two game gates are solo only today. A manifest link marks this with `soloOnly`, and the page reads the flag instead of hard-coding it. | CHANGE | A test asserts the toast comes from the manifest flag. |
| RND-15 | Co-op inside a game (Right Door, Wrong Exit, the Intern) is wanted ("everywhere"). It needs a design. | OPEN | Decision 1. |

### Results, deaths and ranking

| ID | Requirement | Status | How we know |
|---|---|---|---|
| RND-20 | The server counts per player: downs, revives, shots, shots that hit, beacons thrown, cloak seconds, time on each floor. Today it keeps none of these. | NEW | `server/playerstate.test.js` covers each counter. |
| RND-21 | At the end the server builds one **run record**: `{roomCode, mode, startedAt, endedAt, floors: [{scene, ms}], players: [{name, char, place, ms, downs, revives, shots}]}`. Only the server writes it. | NEW | A test plays a fake round and checks the record. |
| RND-22 | The results screen shows place, time and deaths (downs), your best time on this browser, and a welcome to Farway the first time you finish the Original. | CHANGE | A browser test finishes a solo round and reads the screen. |
| RND-23 | Finishing the Original for the first time sets the flag `original_complete`. It is stored on this device first and moves to the account when accounts exist. | NEW | The flag survives a reload. |
| RND-24 | After the results the player can walk out to the Overworld. The link `lot.L4.front_doors>overworld` requires `original_complete`. | NEW (needs the Overworld) | `tools/manifest.mjs links` shows it open once the flag is held. |
| RND-25 | Ranking is online and counts runs from the whole game. Boards are kept apart by mode and by group size: solo, 2 to 4, 5 to 8. | NEW, needs a backend | Decision 2. |
| RND-26 | A run time is accepted only from a run record the server made. A client cannot send a time. | NEW | A test posts a made-up time and it is refused. |

### Safety and load

| ID | Requirement | Status | How we know |
|---|---|---|---|
| RND-30 | A finish is accepted only from L4 with the power on. | BUILT | `server/server.test.js` |
| RND-31 | The server rejects puzzle claims that the floor's state does not allow (a fuse you are not near, a wrong code, a switch already on). | BUILT | `shared/*.test.js` |
| RND-32 | The server tick averages under 5 ms with a full room. It measured 0.31 ms with 8 bots. Measure again at 10. | BUILT at 8, CHANGE at 10 | `node tools/bots.mjs 8` prints the tick time. |
| RND-33 | Each socket has a message budget (a burst of 240, 90 a second, a kick past 600). | BUILT | `server/server.test.js` |

## C. Going back in (planned)

A 20-wave run: 5 floors, 4 chambers each, top down: L4, L3, L2, L1, B1. A chamber is as big as an original floor.

| ID | Requirement | Status | How we know |
|---|---|---|---|
| GBI-1 | The mode `going_back_in` lists its floors top down, `chambersPerFloor: 4` and `waves: 20`. Version 1 has 4 chambers per floor, so no randomness yet. The existing floor is one of the four. | NEW | Manifest check. |
| GBI-2 | A chamber is a scene of the manifest. The 4th chamber on each floor has the stairs down. Chambers join with a mix of vent crawls, elevators, stairs, doors and painted-sky halls. | NEW | A walk test reaches the bottom floor. |
| GBI-3 | The wave starts when the players enter the chamber. The rest is quiet time: objects to find, puzzles, loot, defences to build. A chamber is cleared when its objectives are done. | NEW | A sim test starts one wave on entry. |
| GBI-4 | Unkillable threats are environmental (crushing walls, lava floor, high tides, toxic gas, chainsaw blades). Special entities come later. | NEW | One hazard per chamber type. |
| GBI-5 | Doors can be closed, trapped or barricaded, and nothing else. Players can crawl into vents. Monsters never use vents. | NEW | |
| GBI-6 | A safe house on every floor holds a shop, a stash, a save, crafting and a respawn point. | NEW | |
| GBI-7 | A locker (one per safe house and one per chamber) shows your loadout and lets you change it. After you die it returns your weapons and gear for free. It does not return ammo, consumables or perks. Those are bought back at the Market or a safe house. The existing one-time loot locker on B1 needs a different name. | NEW | A test dies and checks what the locker returns. |
| GBI-8 | Lethal weapons come from the arsenal (ten weapons, three consumables). Each needs its own ammo rule. The ray, the cloak and the beacon stay non-lethal. Q and E (LB and RB) are consumable slots. | NEW | One test per weapon rule. |
| GBI-9 | Money comes from clearing chambers and from kills and revives. Level comes from achievements. Money and items are shared with the rest of the game. Progress is its own save. | NEW | |
| GBI-10 | Per-run score goes to an online leaderboard, with personal and overall bests. | NEW, needs a backend | Decision 2. |
| GBI-11 | The 20 waves stay 20 when floors are added, by sampling. | NEW | |

## Decisions the owner still has to make

1. **Co-op inside the games.** Do rooms enter Right Door, Wrong Exit and the Intern together? Today the gates are solo only.
2. **Backend.** Accounts, saves and an online leaderboard need storage. Pick one (for example a database add-on on the current host) and say whether accounts start anonymous, with a device id.
3. **Room size.** Is 8 enough, or must it be 10? It also needs colours and character slots.
4. **Names.** A name for the Going back in locker.
5. **Deaths.** Is "deaths" on the results screen the number of downs, or only the downs nobody revived?
