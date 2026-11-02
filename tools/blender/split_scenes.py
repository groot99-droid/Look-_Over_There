"""
Splits the world into one Blender SCENE per level and exports one GLB per level (Draco) into levels/.
  blender -b backrooms6.blend --python split_scenes.py -- backrooms7.blend
Scenes created (each links the matching Level_* collection(s); the original scene is kept, renamed World_All):
  B1, L1, L2, L3, L4, Exterior (lot + roads + cityscape + dreamcore house), RDW_House, and ITN_<name> for every stacked Intern scene.
"""
import bpy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["backrooms7.blend"]
out_blend = argv[0]
OUT = os.path.join(HERE, "levels")
os.makedirs(OUT, exist_ok=True)

sys.path.insert(0, HERE)
import backrooms_export
backrooms_export.shrink_images()
main = bpy.data.scenes.get("World_All") or bpy.data.scenes[0]
if main.name != "World_All": main.name = "World_All"
root = bpy.data.collections["Backrooms_L1"]
levels = {c.name[len("Level_"):]: c for c in root.children if c.name.startswith("Level_")}

GROUPS = {}                                    # scene name -> [level ids]
for lid in levels:
    if lid == "LOT": GROUPS["Exterior"] = ["LOT", "ITN_Road"] + (["ITN_Street"] if "ITN_Street" in levels else []) + (["RDW_House"] if "RDW_House" in levels else [])
    elif lid in ("ITN_Road", "ITN_Street", "RDW_House"): continue
    else: GROUPS[lid] = [lid]
if "ITN_Street" in levels: GROUPS["ITN_Street"] = ["ITN_Street"]
if "RDW_House" in levels: GROUPS["RDW_House"] = ["RDW_House"]

def level_objects(ids):
    out = {}
    for i in ids:
        if i in levels:
            for o in levels[i].all_objects: out[o.name] = o
    return list(out.values())

created = []
for sname, ids in GROUPS.items():
    sc = bpy.data.scenes.get(sname) or bpy.data.scenes.new(sname)
    sc.world = main.world
    sc.render.fps = main.render.fps
    sc.unit_settings.system = "METRIC"
    for lid in ids:
        if lid in levels and levels[lid].name not in sc.collection.children: sc.collection.children.link(levels[lid])
    vl = sc.view_layers[0]
    for o in level_objects(ids):
        if o.name.startswith(("Zone_", "COL_")) or (o.type == "ARMATURE" and o.name.startswith("SecCam_")):
            try: o.hide_set(True, view_layer=vl)
            except Exception: pass
    created.append((sname, ids, len(level_objects(ids))))
print("SCENES", created, flush=True)

# one GLB per scene (from the main scene, selecting each group's objects)
wanted = dict(export_format="GLB", use_selection=True, use_active_scene=True, export_extras=True, export_yup=True, export_apply=True, export_cameras=True,
              export_animations=True, export_def_bones=True, export_force_sampling=True, export_frame_step=6, export_optimize_animation_size=True,
              export_frame_range=True, export_animation_mode="ACTIVE_ACTIONS", export_lights=False,
              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
supported = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
vlm = main.view_layers[0]
sizes = {}
_restore = backrooms_export.strip_scene_extras()
for sname, ids in GROUPS.items():
    objs = [o for o in level_objects(ids) if not o.name.startswith(("Zone_", "COL_"))]
    hidden = [o for o in objs if o.hide_get(view_layer=vlm)]
    for o in hidden: o.hide_set(False, view_layer=vlm)
    bpy.ops.object.select_all(action="DESELECT")
    for o in vlm.objects:                          # hidden objects keep a stale selection (e.g. from glTF imports) and would leak into the export
        try: o.select_set(False, view_layer=vlm)
        except Exception: pass
    n_sel = 0
    for o in objs:
        try: o.select_set(True, view_layer=vlm); n_sel += 1
        except Exception: pass
    path = os.path.join(OUT, f"{sname}.glb")
    try:
        bpy.ops.export_scene.gltf(filepath=path, **{k: v for k, v in wanted.items() if k in supported})
        backrooms_export.slim_glb(path)
        sizes[sname] = round(os.path.getsize(path) / 1048576, 2)
    except Exception as e:
        sizes[sname] = f"ERR {e}"
    bpy.ops.object.select_all(action="DESELECT")
    for o in hidden: o.hide_set(True, view_layer=vlm)
    print("EXPORTED", sname, n_sel, sizes[sname], flush=True)
_restore()
with open(os.path.join(OUT, "levels.json"), "w", encoding="utf-8") as f:
    json.dump({"scenes": [{"scene": s, "levels": ids, "glb": f"levels/{s}.glb", "mb": sizes.get(s)} for s, ids, _ in created]}, f, indent=1)
print("MAIN_EXPORT", backrooms_export.export_all(HERE, ["split"]), flush=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, out_blend))
print("SPLIT_DONE", sizes, flush=True)
