# Look Over There

A walkable multi-level Backrooms building (flooded poolrooms, office maze, white plaster room, the "Look Over There" showroom, parking lot, ), built in Blender and served as a static three.js page.

- `index.html` is the whole game: keyboard (WASD / arrow keys), mouse look, or an Xbox controller.
- `world/<scene>.glb` + `world/<scene>.json` are the Draco-compressed geometry and the collision boxes, doors and cameras of one scene (B1, L1, L2, L3, L4; L4 includes the parking lot and the city). Only one scene is loaded at a time; the floors are joined by a door at the top of each staircase.
- `blender/Look_Over_There.blend` is the final Blender file (all textures packed, stored with Git LFS).
- `.github/workflows/pages.yml` publishes `index.html` and `world/` to GitHub Pages on every push to `main`.

Run it locally by serving the folder (`python -m http.server`) and opening `index.html`.

## The game

You start on the pool level (B1) and work upwards. Every door is shut: you open one with X (controller) or X / E (keyboard) and the monsters have to open them too.
**Controls** (the same on keyboard and controller; `H` in game lists them):
- Move WASD / left stick; look mouse / right stick; jump Space / A.
- Crouch (toggle) Shift / left-stick click: press again to walk normally. Run (hold) R / right-stick click: faster than any monster, but loud and it tires you; running stands you up.
- X (keyboard X or F) is the action button: doors, fuses, switches, notes, the power, the keypad, loot, and (held beside a downed teammate) lifting them.
- Y takes out what you carry (tap again to rotate through the ray gun, the cloak and the beacon; hold for the wheel). Keyboard: Y, or 1 / 2 / 3.
- RT / left click uses what you hold: the gun fires, the cloak switches on or off, a beacon is rolled. LT / right click: the gun aims; the cloak's secondary is a **short circuit** (it goes dead for 5 minutes and every monster within 8 m is stunned for 5 s, so you can run through them); a beacon's secondary **reverses its frequency** (for 12 s the monsters run from it, then they come back and group up round it).
- LB / RB (Q / E): the support and the combat/objective consumable slots (empty for now).
- D-pad up / View / Tab / M: the handheld map. The camera feeds have no controls for now.
If a monster sees you it chases; if it catches you, you die and come back on the same floor in a random spot.

Monsters (config in `world/monsters.json`): Sinew of the Abyss on B1, The Pale Traveler on L1, a clawed creature on L2, the first creature in the showroom (L4).
Models are in `monsters/`; the two Meshy exports that came with their own animations are used as-is (textures shrunk), and the rig-only ones got idle/walk/run/attack clips from `tools/make_monster_anims.py`.

## Multiplayer

Up to 8 players share one building and its monsters. `node server/server.js` (after `cd server && npm ci`) serves the game and relays the room on one port; open `http://localhost:8080/`, pick one of five characters, enter a name and a room code, and send friends the same code (or `/?room=CODE`). Everyone readies up in a waiting room, then the group starts together on B1; anyone joining later drops straight in. The server runs the monsters and keeps each player's health, rounds, cloak and beacons (see docs/GAMEPLAY.md); press `H` in game for the controls, or open `/?sound=1` to audition the sounds.

**Deploying on Railway.** The service is connected to `groot99-droid/Look_Over_There`, branch `claude/stoic-cannon-dej2nw` (change the branch under the service's Settings > Source when you merge). If the repository is ever renamed again, re-attach the source there; a stale name stops deploys on push.

In a room you see each other as the chosen characters (name tags, and arrows on the handheld map), share open doors (X / E also shuts an open door), and are hunted by the same monsters. One client per floor (chosen by the server, handed over when they leave) simulates that floor's monsters and the others follow its snapshots. The stair door at the top of each floor is locked until that floor's puzzle is done: on B1 (and for now L2) find three fuses, press E / X to pick one up (one at a time), and E / X at the door to put it in (a carrier is louder to the monsters and drops the fuse if downed); on L1 flip two far-apart switches, one at a time in any order, though each flip is loud and draws the monsters; on L2 find four notes (each holds one digit, shown to the whole team) and type the code at the door's keypad, where a wrong code is loud and locks it for 8 s ; L3 is a break floor with a power box that turns the building's power on, and on L4 the store's glass doors stay shut until the power is on, so otherwise you must find the power switch in the far corner of the store, which is loud. Opening the doors sets off a 60 s alarm that sends the L4 monsters to the doors; walking out onto the parking lot is your finish (the lot is safe), and when everyone is out the results show places, times and your best B1 has a locker for each player (one gun each) and every floor has ammo packs (press E). Fire the ray gun with the left mouse button, F or the controller's right bumper: a hit does not kill, it deletes the monster to a far spot out of sight. The handheld map shows a monster only while a security camera can see it, and for 3 s after (`docs/GAMEPLAY.md` has the rules). A monster that catches you downs only you: a teammate holds E / X beside you for 4 s to lift you, or you wake at the stairs after 45 s. You only learn which floor a teammate is on, never where.

"Play solo" skips the server entirely (and keeps the old die-and-respawn rule), so the GitHub Pages build still works alone. To play online from Pages, point it at a server with `?server=wss://your-host/ws`. `Dockerfile` deploys the server to Railway. Tests: `node --test shared/*.test.js` (the puzzle rules), `cd server && npm test` (the relay), `node tools/mp_test.mjs` (two headless browsers in a room) and `node tools/solo_test.mjs` (solo play and the optional model loader). `node tools/bots.mjs 3` plays whole rounds with a team of bot players (runner, bait, scout) and prints a tuning report (run it locally; what it found is in `docs/GAMEPLAY.md`). The plan for where the gameplay goes next is in `docs/GAMEPLAY.md`.
Opening a stair door shows a lit hallway behind it (drawn only through the doorway, so it never runs into the level around it); stepping through the doorway takes you to the other floor, where the same hallway is behind you. The two gates to the hidden games still open into a short walkable passage first.
On B1, L1 and L2 there is one of each kind of prop; fire alarms, clocks and security cameras are the only things that repeat. `tools/blender/verify_world.py` checks the ceilings, the stair parts against everything around them, and the duplicates.
