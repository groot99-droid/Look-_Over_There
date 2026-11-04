# Look Over There

A walkable multi-level Backrooms building (flooded poolrooms, office maze, white plaster room, the "Look Over There" showroom, parking lot, ), built in Blender and served as a static three.js page.

- `index.html` is the whole game: keyboard (WASD / arrow keys), mouse look, or an Xbox controller.
- `world/<scene>.glb` + `world/<scene>.json` are the Draco-compressed geometry and the collision boxes, doors and cameras of one scene (B1, L1, L2, L3, L4; L4 includes the parking lot and the city). Only one scene is loaded at a time; the floors are joined by a door at the top of each staircase.
- `blender/Look_Over_There.blend` is the final Blender file (all textures packed, stored with Git LFS).
- `.github/workflows/pages.yml` publishes `index.html` and `world/` to GitHub Pages on every push to `main`.

Run it locally by serving the folder (`python -m http.server`) and opening `index.html`.

## The game

You start on the pool level (B1) and work upwards. Every door is shut: you open one with X (controller) or X / E (keyboard) and the monsters have to open them too.
Move with WASD / arrow keys / left stick; look with the mouse, left-right arrows or right stick; you walk by default; hold R (or the right trigger) to run, which is faster than any monster but loud and lasts about 4 s before a short recovery; Shift or the left trigger (or B) crouches (monsters see you from half as far and cannot hear you).
Tab or Y takes the handheld device out: it shows the security cameras on your floor (Q / R or LB / RB to switch) and, toggled with M or View, a map of the floor with the monsters pinged.
If a monster sees you it chases; if it catches you, you die and come back on the same floor in a random spot.

Monsters (config in `world/monsters.json`): Sinew of the Abyss on B1, The Pale Traveler on L1, a clawed creature on L2, the first creature in the showroom (L4).
Models are in `monsters/`; the two Meshy exports that came with their own animations are used as-is (textures shrunk), and the rig-only ones got idle/walk/run/attack clips from `tools/make_monster_anims.py`.

## Multiplayer

Up to 8 players share one building and its monsters. `node server/server.js` (after `cd server && npm ci`) serves the game and relays the room on one port; open `http://localhost:8080/`, pick one of five characters, enter a name and a room code, and send friends the same code (or `/?room=CODE`). Everyone readies up in a waiting room, then the group starts together on B1; anyone joining later drops straight in.

In a room you see each other as the chosen characters (name tags, and arrows on the handheld map), share open doors (X / E also shuts an open door), and are hunted by the same monsters. One client per floor (chosen by the server, handed over when they leave) simulates that floor's monsters and the others follow its snapshots. The stair door at the top of each floor is locked until that floor's puzzle is done: on B1 (and for now L2) find three fuses, press E / X to pick one up (one at a time), and E / X at the door to put it in (a carrier is louder to the monsters and drops the fuse if downed); on L1 flip two far-apart switches, one at a time in any order, though each flip is loud and draws the monsters; on L2 find four notes (each holds one digit, shown to the whole team) and type the code at the door's keypad, where a wrong code is loud and locks it for 8 s ; L3 is a break floor with a power box that turns the building's power on, and on L4 the store's glass doors stay shut until the power is on, so otherwise you must find the power switch in the far corner of the store, which is loud. Opening the doors sets off a 60 s alarm that sends the L4 monsters to the doors; walking out onto the parking lot is your finish (the lot is safe), and when everyone is out the results show places, times and your best B1 has a locker for each player (one gun each) and every floor has ammo packs (press E). Fire the ray gun with the left mouse button, F or the controller's right bumper: a hit does not kill, it deletes the monster to a far spot out of sight. The handheld map shows a monster only while a security camera can see it, and for 3 s after (`docs/GAMEPLAY.md` has the rules). A monster that catches you downs only you: a teammate holds E / X beside you for 4 s to lift you, or you wake at the stairs after 45 s. You only learn which floor a teammate is on, never where.

"Play solo" skips the server entirely (and keeps the old die-and-respawn rule), so the GitHub Pages build still works alone. To play online from Pages, point it at a server with `?server=wss://your-host/ws`. `Dockerfile` deploys the server to Railway. Tests: `node --test shared/*.test.js` (the puzzle rules), `cd server && npm test` (the relay), `node tools/mp_test.mjs` (two headless browsers in a room) and `node tools/solo_test.mjs` (solo play and the optional model loader). `node tools/bots.mjs 3` plays whole rounds with a team of bot players (runner, bait, scout) and prints a tuning report (run it locally; what it found is in `docs/GAMEPLAY.md`). The plan for where the gameplay goes next is in `docs/GAMEPLAY.md`.
