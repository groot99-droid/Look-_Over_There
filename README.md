# Look Over There

A walkable multi-level Backrooms building (flooded poolrooms, office maze, white plaster room, the "Look Over There" showroom, parking lot, plus The Intern's city and Right Door, Wrong Exit's rooms stacked underneath), built in Blender and served as a static three.js page.

- `index.html` is the whole game: keyboard (WASD / arrow keys), mouse look, or an Xbox controller.
- `world/backrooms_L1.glb` is the Draco-compressed level geometry. `world/backrooms_L1_colliders.json` holds the collision boxes, markers, doors, lights, cameras and the stair/hatch links between stacked levels.
- `blender/Look_Over_There.blend` is the final Blender file (all textures packed, stored with Git LFS).
- `.github/workflows/pages.yml` publishes `index.html` and `world/` to GitHub Pages on every push to `main`.

Run it locally by serving the folder (`python -m http.server`) and opening `index.html`.

## The game

You start on the pool level (B1) and work upwards. Every door is shut: you open one with X (controller) or X / E (keyboard) and the monsters have to open them too.
Move with WASD / arrow keys / left stick; look with the mouse, left-right arrows or right stick; Shift or the left trigger (or B) crouches (monsters see you from half as far and cannot hear you).
Tab or Y takes the handheld device out: it shows the security cameras on your floor (Q / R or LB / RB to switch) and, toggled with M or View, a map of the floor with the monsters pinged.
If a monster sees you it chases; if it catches you, you die and come back on the same floor in a random spot.

Monsters (config in `world/monsters.json`): Sinew of the Abyss on B1, The Pale Traveler on L1, a clawed creature on L2, the first creature in the showroom (L4).
Models are in `monsters/`; the two Meshy exports that came with their own animations are used as-is (textures shrunk), and the rig-only ones got idle/walk/run/attack clips from `tools/make_monster_anims.py`.
