"""
Gates into the two hidden games, on the lot (L4 scene).
  RDW: a stairwell dug into the lawn in front of the dream house. Twelve steps lead down to a landing and a closed door; opening it starts
       Right Door, Wrong Exit's dining room (the game's own first scene) with no hand-off screen. Replaces the old orange hatch.
Run after stairdoors. Re-running wipes its own objects (o["gate"]) and rebuilds the lawn cut from the saved copy.
Coordinates are Blender (x, y, z-up); the descent runs toward +y.
"""
import bpy
import json
import math
import os
import sys
import importlib
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import backrooms_lib as L
importlib.reload(L)
from backrooms_lib import *

scene = bpy.data.scenes.get("World_All") or bpy.context.scene
level_empty = bpy.data.objects["LEVEL_L1"]
GZ = 9.6
T, RISE, RUN, NST, LAND, DW, DH = 0.2, 0.25, 0.28, 12, 1.4, 1.1, 2.16
X0, X1, TOP = -122.4, -120.0, -62.4
CX = (X0 + X1) / 2
BOT = TOP + NST * RUN
DOORY = BOT + LAND
FLOOR = GZ - NST * RISE
PARAPET = GZ + 0.6

for o in list(bpy.data.objects):
    if o.get("gate"): remove(o)
for nm in ("COL_Link_RDW_House_hatch_RDW_House", "Stair_hatch_RDW_House_dark", "Stair_hatch_RDW_House_frame", "Stair_hatch_RDW_House_hatch", "Stair_hatch_RDW_House_rail",
           "Stair_RDW_House_to_RDW_dining"):
    ob = bpy.data.objects.get(nm)
    if ob: remove(ob)

mat_wall = pbr_mat("M_Gate_Concrete", None, color=(0.52, 0.52, 0.50), rough=0.95)
mat_step = pbr_mat("M_Gate_Step", None, color=(0.42, 0.42, 0.40), rough=0.9)
mat_door = bpy.data.materials.get("M_Door") or pbr_mat("M_Door", None, color=(0.42, 0.30, 0.18), rough=0.7)
mat_col = pbr_mat("M_Collider", None, color=(0.1, 0.9, 0.3), rough=1.0)
vis_coll = bpy.data.collections["Lvl_RDW_House"]
col_coll = bpy.data.collections["RDW_House_Collision"]

# --- cut the lawn
grass = bpy.data.objects["Ground_LOT_Exterior_grass"]
if "Ground_LOT_Exterior_grass_orig" in bpy.data.meshes:
    grass.data = bpy.data.meshes["Ground_LOT_Exterior_grass_orig"].copy()
else:
    bpy.data.meshes[grass.data.name].copy().name = "Ground_LOT_Exterior_grass_orig"
cut = bpy.data.objects.new("GateCutter", mesh_from_boxes("cut", [((X0 - T, TOP - T, FLOOR - 1), (X1 + T, DOORY + T, GZ + 1))], uv=False))
bpy.context.scene.collection.objects.link(cut)
mod = grass.modifiers.new("gate_cut", "BOOLEAN"); mod.object, mod.operation, mod.solver = cut, "DIFFERENCE", "EXACT"
bpy.context.view_layer.objects.active = grass
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(cut)

# --- every ground collider under the lawn gets the same hole
HOLE = (X0 - T, TOP - T, X1 + T, DOORY + T)
for old in [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("COL_Ground_LOT")]:
    coll, lvl, src = old.users_collection[0], old.get("level", "LOT"), old.get("source", old.name[4:])
    mat = old.data.materials[0] if old.data.materials else mat_col
    boxes = []
    for lo, hi in components(old.data):
        p, q = old.matrix_world @ lo, old.matrix_world @ hi
        x0, x1, y0, y1, z0, z1 = min(p.x, q.x), max(p.x, q.x), min(p.y, q.y), max(p.y, q.y), min(p.z, q.z), max(p.z, q.z)
        if x0 < HOLE[2] and x1 > HOLE[0] and y0 < HOLE[3] and y1 > HOLE[1]:
            boxes += [((r[0], r[1], z0), (r[2], r[3], z1)) for r in rect_minus((x0, y0, x1, y1), [HOLE])]
        else:
            boxes.append(((x0, y0, z0), (x1, y1, z1)))
    name = old.name
    remove(old)
    g = place_mesh(name, mesh_from_boxes("g", boxes, uv=False), [mat], coll, level_empty, lvl)
    g.display_type, g.hide_render, g["collider"], g["source"] = "WIRE", True, "box", src
    g.hide_set(True)

# --- the stairwell
vis, col = {"wall": [], "step": []}, []
def add(key, x0, x1, y0, y1, z0, z1, collide=True):
    b = ((x0, y0, z0), (x1, y1, z1)); vis[key].append(b)
    if collide: col.append(b)
for i in range(NST):
    y0, y1 = TOP + i * RUN, TOP + (i + 1) * RUN
    add("step", X0, X1, y0, y1, FLOOR - 0.3, GZ - (i + 1) * RISE)
add("step", X0, X1, BOT, DOORY, FLOOR - 0.3, FLOOR)
add("wall", X0 - T, X0, TOP - T, DOORY + T, FLOOR - 0.3, PARAPET)
add("wall", X1, X1 + T, TOP - T, DOORY + T, FLOOR - 0.3, PARAPET)
add("wall", X0, X1, TOP - T, TOP, FLOOR - 0.3, GZ - RISE)                           # back wall behind the first step
dxa, dxb = CX - DW / 2, CX + DW / 2
add("wall", X0, dxa, DOORY, DOORY + T, FLOOR, PARAPET)
add("wall", dxb, X1, DOORY, DOORY + T, FLOOR, PARAPET)
add("wall", dxa, dxb, DOORY, DOORY + T, FLOOR + DH, PARAPET)
add("wall", X0, X1, DOORY, DOORY + T, FLOOR - 0.3, FLOOR, collide=False)
for key, boxes in vis.items():
    ob = place_mesh(f"Gate_RDW_{key}", mesh_from_boxes("g", boxes), [mat_step if key == "step" else mat_wall], vis_coll, level_empty, "RDW_House")
    ob["gate"] = ob["keep_mat"] = True
co = place_mesh("COL_Gate_RDW", mesh_from_boxes("c", col, uv=False), [mat_col], col_coll, level_empty, "RDW_House")
co["gate"] = True; co["source"] = "Gate_RDW"

lw, lh = DW - 0.06, DH - 0.04
hinge = (dxa + 0.03, DOORY + T / 2, FLOOR)
me = mesh_from_boxes("DoorLeaf_Gate_RDW", [((0, -0.025, 0), (lw, 0.025, lh))]); me.materials.append(mat_door)
leaf = bpy.data.objects.new("DoorLeaf_Gate_RDW", me); leaf.location = hinge
leaf["level"], leaf["door"], leaf["state"], leaf["gate"] = "RDW_House", True, "closed", True
vis_coll.objects.link(leaf); parent_to(leaf, level_empty)

doors = [d for d in json.loads(scene.get("bk_doors", "[]")) if d["name"] != "DoorLeaf_Gate_RDW"]
doors.append({"name": "DoorLeaf_Gate_RDW", "level": "RDW_House", "hinge": [round(hinge[0], 4), round(hinge[2], 4), round(-hinge[1], 4)], "width": round(lw, 3),
              "height": round(lh, 3), "closed_yaw_deg": 0.0, "swing_deg": 90.0, "state": "closed",
              "link": {"game": "rdwe", "room": "dining", "arrive": [round(CX, 3), GZ, round(-(TOP - 1.2), 3)], "face": [0.0, 1.0]}})
scene["bk_doors"] = json.dumps(doors)
bpy.context.view_layer.update()
result = {"gate": "rdwe", "door_z_yup": round(-hinge[1], 2), "floor": FLOOR}


# ============================================================ The Intern: an apartment-entrance alcove on the city sidewalk
for nm in ("COL_Link_ITN_Street_hatch_ITN_Street", "Stair_hatch_ITN_Street_dark", "Stair_hatch_ITN_Street_frame", "Stair_hatch_ITN_Street_hatch",
           "Stair_hatch_ITN_Street_rail", "Stair_ITN_Street_to_ITN_Apartment"):
    ob = bpy.data.objects.get(nm)
    if ob: remove(ob)
IV, IC = bpy.data.collections["Lvl_ITN_Street"], bpy.data.collections["ITN_Street_Collision"]
AX0, AX1 = 113.0, 115.0                  # against the west building face, two metres deep
AY0, AY1 = -76.3, -73.7                  # 2.6 m wide on the sidewalk
AZ0, AZ1 = GZ, GZ + 2.9
ACY = (AY0 + AY1) / 2
mat_alc = pbr_mat("M_Gate_Alcove", None, color=(0.34, 0.33, 0.31), rough=0.95)
mat_in = pbr_mat("M_Gate_AlcoveLit", None, color=(1.0, 0.85, 0.55), rough=0.6, emit=0.9)
ibox, icol = {"wall": [], "lit": []}, []
def iadd(key, x0, x1, y0, y1, z0, z1, collide=True):
    b = ((x0, y0, z0), (x1, y1, z1)); ibox[key].append(b)
    if collide: icol.append(b)
iadd("wall", AX0, AX1, AY0 - T, AY0, AZ0, AZ1)
iadd("wall", AX0, AX1, AY1, AY1 + T, AZ0, AZ1)
iadd("wall", AX0, AX1, AY0, AY1, AZ1, AZ1 + 0.2)                                  # roof
iadd("lit", AX0, AX0 + 0.04, AY0, AY1, AZ0, AZ1, collide=False)                  # the lit back wall seen through the open door
iadd("wall", AX0 - 0.2, AX0, AY0, AY1, AZ0, AZ1)                                   # seal against the building
dya, dyb = ACY - DW / 2, ACY + DW / 2
iadd("wall", AX1, AX1 + T, AY0 - T, dya, AZ0, AZ1)
iadd("wall", AX1, AX1 + T, dyb, AY1 + T, AZ0, AZ1)
iadd("wall", AX1, AX1 + T, dya, dyb, AZ0 + DH, AZ1)
for key, boxes in ibox.items():
    ob = place_mesh(f"Gate_ITN_{key}", mesh_from_boxes("g", boxes), [mat_in if key == "lit" else mat_alc], IV, level_empty, "ITN_Street")
    ob["gate"] = ob["keep_mat"] = True
ob = place_mesh("COL_Gate_ITN", mesh_from_boxes("c", icol, uv=False), [mat_col], IC, level_empty, "ITN_Street"); ob["gate"] = True; ob["source"] = "Gate_ITN"
me = mesh_from_boxes("DoorLeaf_Gate_ITN", [((0, -0.025, 0), (lw, 0.025, lh))]); me.materials.append(mat_door)
leaf = bpy.data.objects.new("DoorLeaf_Gate_ITN", me); leaf.location = (AX1 + T / 2, dya + 0.03, GZ); leaf.rotation_euler = (0, 0, math.radians(90))
leaf["level"], leaf["door"], leaf["state"], leaf["gate"] = "ITN_Street", True, "closed", True
IV.objects.link(leaf); parent_to(leaf, level_empty)
doors = [d for d in json.loads(scene.get("bk_doors", "[]")) if d["name"] != "DoorLeaf_Gate_ITN"]
doors.append({"name": "DoorLeaf_Gate_ITN", "level": "ITN_Street", "hinge": [round(AX1 + T / 2, 4), GZ, round(-(dya + 0.03), 4)], "width": round(lw, 3),
              "height": round(lh, 3), "closed_yaw_deg": 90.0, "swing_deg": 90.0, "state": "closed",
              "link": {"game": "intern", "scene": "L4", "arrive": [round(AX1 + T + 1.2, 3), GZ, round(-ACY, 3)], "face": [1.0, 0.0]}})
scene["bk_doors"] = json.dumps(doors)
bpy.context.view_layer.update()
result["intern_gate"] = round(-ACY, 2)
print("GATES", result)
