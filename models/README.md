# models/

Optional 3D models for puzzle objects, loaded by `index.html` as `models/<id>.glb`. Each one replaces a placeholder drawn in code, so the game works without any of them.
Currently used: `fuse.glb` (see `docs/MODELS.md` for what to generate, the budget, and how to prepare the file).

`gun.glb` is the player's weapon (not shown in the game yet: see `docs/GAMEPLAY.md`, "Fighting back"). It was made by Meshy ("Error Deletion Ray"), 20.9 MB with three 2048 px PNG textures, and shrunk with gltf-transform to 1.1 MB: 1024 px WebP colour, normal and metal/rough maps, Draco, 48k triangles. It is about 1.9 units long (X), 1.0 high and 0.55 wide, so it needs scaling to about 0.5 m when it is held. The mesh is made of many separate UV pieces, so it cannot be reduced further without re-baking the textures: a Meshy re-export with a lower polycount (about 8k) would be better.
