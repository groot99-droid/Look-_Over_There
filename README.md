# Look Over There

A walkable multi-level Backrooms building (flooded poolrooms, office maze, white plaster room, the "Look Over There" showroom, parking lot, plus The Intern's city and Right Door, Wrong Exit's rooms stacked underneath), built in Blender and served as a static three.js page.

- `index.html` is the whole game: keyboard (WASD / arrow keys), mouse look, or an Xbox controller.
- `world/backrooms_L1.glb` is the Draco-compressed level geometry. `world/backrooms_L1_colliders.json` holds the collision boxes, markers, doors, lights, cameras and the stair/hatch links between stacked levels.
- `blender/Look_Over_There.blend` is the final Blender file (all textures packed, stored with Git LFS).
- `.github/workflows/pages.yml` publishes `index.html` and `world/` to GitHub Pages on every push to `main`.

Run it locally by serving the folder (`python -m http.server`) and opening `index.html`.

## The game

Monsters patrol every floor of L1, L2 and B1. They see you inside a view cone (walls block it) and hear you when you run nearby; once they see you they chase, and if they catch you, you die and restart. `world/monsters.json` configures them (model, height, speed, sight, counts per floor); `monsters/creature.glb` is the Meshy character (textured, rigged); its idle/walk/run/attack clips were generated in Blender by `make_monster_anims.py` because the Meshy export had a skeleton but no animation. Drop in other animated `.glb` files and set `glb` to use them.
