"""
Splits the combined collider export into one JSON per scene (world/<scene>.json) and copies the matching level GLBs into world/.
  python tools/split_world.py <blender dir with backrooms_L1_colliders.json + levels/> <repo world dir>
Scenes: B1, L1, L2, L3, L4. L4 is the showroom plus the parking lot and the city/house set pieces around it (one continuous space at floor 9.6).
"""
import json, os, shutil, sys
src, out = sys.argv[1], sys.argv[2]
SCENES = {"B1": ["B1"], "L1": ["L1"], "L2": ["L2"], "L3": ["L3"], "L4": ["L4", "LOT", "ITN_Road", "ITN_Street", "RDW_House"]}
GLBS = {"B1": ["B1"], "L1": ["L1"], "L2": ["L2"], "L3": ["L3"], "L4": ["L4", "Exterior"]}
d = json.load(open(os.path.join(src, "backrooms_L1_colliders.json")))
r3 = lambda v: [round(x, 3) for x in v]
os.makedirs(out, exist_ok=True)
for sid, levels in SCENES.items():
    L = set(levels)
    doc = {
        "scene": sid,
        "colliders": [{"s": c["source"], "min": r3(c["min"]), "max": r3(c["max"])} for c in d["colliders"] if c["level"] in L],
        "doors": [x for x in d["doors"] if x["level"] in L],
        "cameras": [x for x in d["cameras"] if x["level"] in L],
        "markers": [x for x in d["markers"] if x["level"] in L and x["kind"] in ("Spawn", "Entrance", "Exit")],
    }
    json.dump(doc, open(os.path.join(out, sid + ".json"), "w"), separators=(",", ":"))
    for g in GLBS[sid]:
        shutil.copy(os.path.join(src, "levels", g + ".glb"), os.path.join(out, g + ".glb"))
    print(sid, len(doc["colliders"]), "colliders", len(doc["doors"]), "doors", len(doc["cameras"]), "cameras")
