# models/

Optional 3D models for puzzle objects, loaded by `index.html` as `models/<id>.glb`. Each one replaces a placeholder drawn in code, so the game works without any of them.
Currently used: `fuse.glb` (see `docs/MODELS.md` for what to generate, the budget, and how to prepare the file).

`gun.glb` is the player's weapon (not shown in the game yet: see `docs/GAMEPLAY.md`, "Fighting back"). It is Meshy's "Error Deletion Ray": an improvised ray gun (taped barrel, a cyan canister, an "ERR" display, a "404" label, an antenna and a glowing tip). The Meshy character-style export (16 MB, 10k triangles, three 2048 px PNG textures, a skeleton with no animations) was prepared with gltf-transform: skeleton removed (it is a static model), 1024 px WebP colour, normal and metal/rough maps, Draco, 0.88 MB, 10k triangles, one mesh. It is 3.2 units long (X, the muzzle points to -X), 1.7 high (the grip hangs below the barrel; Y starts at 0) and 0.9 wide, so it must be scaled to about 0.55 m long (about 0.17x) when it is held. An earlier, heavier export of the same gun (100k triangles) was replaced by this one.
