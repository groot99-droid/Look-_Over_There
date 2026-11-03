# Models for the puzzle objects

The game draws placeholders in code, so nothing waits on these. When a model exists, drop it in `models/<id>.glb` and it replaces the placeholder (the loader scales it to the height below and centres it).

Meshy is a paid step in the studio: run the `asset-3d` pipeline on your own machine (it needs `MESHY_API_KEY` in `~/.rosw/keys.env` and your recorded go-ahead after seeing the credit estimate). `studio/pipeline/meshy_client.py` is a dry run until confirmed. These prompts are starting points to paste into that run.

## Needed now (fuses)

| id | file | prompt | height | notes |
|---|---|---|---|---|
| `fuse` | `models/fuse.glb` | "A heavy industrial cartridge fuse, about 30 cm long: a glass body glowing amber with a visible filament, brass end caps, worn and slightly dirty, game prop, single object, no stand" | 0.30 m | A prop, no rig needed. Keep it under about 3k triangles; centred; long axis vertical. |

## Needed later

| id | prompt | height | for |
|---|---|---|---|
| `gate_panel` | "A wall-mounted electrical lock panel with three small indicator lamps in a row and a fuse slot, dirty 1990s industrial, game prop" | 0.40 m | the stair door's fuse panel (replaces the three code-made lamps) |
| `switch` | "A waist-high industrial control pedestal with a heavy black lever switch on a grey steel plate and a small indicator lamp, worn paint, game prop" | 1.2 m | L1 switches (the loader already looks for `models/switch.glb`; the lever and lamp of the placeholder are what show on/off today) |
| `keypad` | "A wall-mounted numeric keypad with a small green LCD, scuffed grey plastic, game prop" | 0.30 m | L2 four-digit code |
| `fuse_box` | "An open grey electrical fuse box on a wall with a big power lever, labelled breakers, grime, game prop" | 0.7 m | L3 break-floor box / L4 power switch |

## Preparing a model for the game

1. Generate with Meshy (studio `asset-3d`, `class: spend`). Check it with `studio/pipeline/glb_inspect.py` against the budget.
2. Shrink it for the web (the characters went from about 20 MB to 0.5 MB): `node tools/optimize_character.mjs <in.glb> <out.glb>` keeps the animations named Walking and Running, which a prop does not have, so for props use the same script with the animation line removed, or just resize the texture to 1024 px WebP and Draco-compress the mesh with `gltf-transform`.
3. Put the result at `models/<id>.glb`. Keep each file under about 1 MB: every player downloads every model.
