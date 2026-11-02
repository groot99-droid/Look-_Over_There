"""
Scene-per-level stairs. Each staircase belongs to its LOWER level and ends in a sealed landing with a door; the UPPER level covers the old
stair hole with a small cupboard whose door is the matching way down. Opening either door starts the other level (the game's scene manager reads
the "link" on each door in bk_doors). Run after links/fixes and before split_scenes; re-running wipes its own objects first (o["stairdoor"]).

  A  B1 <-> L1   Stairs_1C_Down       (was part of L1, moved into B1)
  B  L1 <-> L2   Stairs_1D_Up
  C  L2 <-> L3   Stairs_L3_L2_Loop    (was exported with L3, moved into L2)
  D  L3 <-> L4   Stairs_L3_L3_Room
All coordinates are Blender (x, y, z-up); `a` is the distance along the climb direction measured from the top edge of the stairs.
"""
import bpy
import json
import math
import os
import sys
import importlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import backrooms_lib as L
importlib.reload(L)
from backrooms_lib import *

scene = bpy.data.scenes.get("World_All") or bpy.context.scene
level_empty = bpy.data.objects["LEVEL_L1"]
T, LD, DW, DH, WALL_H = 0.2, 1.4, 1.1, 2.16, 2.7

for o in list(bpy.data.objects):
    if o.get("stairdoor"): remove(o)
doors_json = [d for d in json.loads(scene.get("bk_doors", "[]")) if not d["name"].startswith("DoorLeaf_Stair")]

SPECS = [
    dict(key="B1_L1", lower="B1", upper="L1", x=(-1.1333, 1.1504), top=2.099, base=6.099, dirv=-1, y0=-3.0, y1=0.0,
         vis=["Stairs_1C_Down"], col=["COL_Stairs_1C_Down"], upper_floor="Floor_L1"),
    dict(key="L1_L2", lower="L1", upper="L2", x=(-1.1574, 1.1426), top=-9.208, base=-4.588, dirv=-1, y0=0.0, y1=3.2,
         vis=[], col=[], upper_floor="Floor_L2_Loop"),
    dict(key="L2_L3", lower="L2", upper="L3", x=(-17.6667, -15.2889), top=13.778, base=10.278, dirv=1, y0=3.2, y1=6.4,
         vis=["Stairs_L3_L2_Loop"], col=[], upper_floor="Floor_L3_L2_Loop"),
    dict(key="L3_L4", lower="L3", upper="L4", x=(14.8, 17.2), top=-8.5, base=-12.0, dirv=1, y0=6.4, y1=9.6,
         vis=[], col=[], upper_floor="Floor_L4_L3_Room"),
]

def mat_(name, color, rough=0.9):
    return pbr_mat(name, None, color=color, rough=rough)
mat_wall = mat_("M_Stair_Wall", (0.78, 0.75, 0.66))
mat_door = bpy.data.materials.get("M_Door") or mat_("M_Door", (0.42, 0.30, 0.18), 0.7)
mat_col = pbr_mat("M_Collider", None, color=(0.1, 0.9, 0.3), rough=1.0)

def coll_for(name):
    return bpy.data.collections.get(name)

class Part:
    """Boxes in (x0, x1, a0, a1, z0, z1) along a staircase frame; emitted as one mesh + one collider mesh per level."""
    def __init__(self, sp, lvl):
        self.sp, self.lvl, self.vis, self.col = sp, lvl, {}, []
    def box(self, key, x0, x1, a0, a1, z0, z1, mat=None, col=True):
        sp = self.sp
        b1, b2 = sp["top"] + sp["dirv"] * a0, sp["top"] + sp["dirv"] * a1
        bx = ((x0, min(b1, b2), z0), (x1, max(b1, b2), z1))
        self.vis.setdefault(key, (mat or mat_wall, []))[1].append(bx)
        if col: self.col.append(bx)
    def emit(self, tag):
        lvl = self.lvl
        for key, (mat, boxes) in self.vis.items():
            ob = place_mesh(f"Stair_{tag}_{key}", mesh_from_boxes("s", boxes), [mat], coll_for(f"Detail_{lvl}"), level_empty, lvl)
            ob["stairdoor"] = ob["keep_mat"] = True
        if self.col:
            ob = place_mesh(f"COL_StairDoor_{tag}", mesh_from_boxes("c", self.col, uv=False), [mat_col], coll_for(f"{lvl}_Collision"), level_empty, lvl)
            ob["stairdoor"] = True
            ob["source"] = f"StairDoor_{tag}"

def make_door(name, lvl, sp, a_wall_center, swing_sign, y_floor, open_dir):
    """Door in a wall plane perpendicular to the stair axis at `a_wall_center`; hinge on the low-x side."""
    cx = (sp["x"][0] + sp["x"][1]) / 2
    by = sp["top"] + sp["dirv"] * a_wall_center
    lw, lh = DW - 0.06, DH - 0.04
    hinge = (cx - DW / 2 + 0.03, by, y_floor)
    me = mesh_from_boxes(name, [((0, -0.025, 0), (lw, 0.025, lh))])
    me.materials.append(mat_door)
    leaf = bpy.data.objects.new(name, me)
    leaf.location = hinge
    leaf["level"], leaf["door"], leaf["state"], leaf["stairdoor"] = lvl, True, "closed", True
    coll_for(f"Detail_{lvl}").objects.link(leaf)
    parent_to(leaf, level_empty)
    swing = 90.0 * swing_sign
    return {"name": name, "level": lvl, "hinge": [round(hinge[0], 4), round(hinge[2], 4), round(-hinge[1], 4)], "width": round(lw, 3),
            "height": round(lh, 3), "closed_yaw_deg": 0.0, "swing_deg": swing, "state": "closed"}

links = []
for sp in SPECS:
    cx = (sp["x"][0] + sp["x"][1]) / 2
    x0, x1 = sp["x"]
    a_base = sp["dirv"] * (sp["base"] - sp["top"])
    # --- move the stair meshes into the lower level
    for nm in sp["vis"]:
        ob = bpy.data.objects.get(nm)
        if ob:
            for c in list(ob.users_collection): c.objects.unlink(ob)
            coll_for(f"Detail_{sp['lower']}").objects.link(ob)
            ob["level"] = sp["lower"]
    for nm in sp["col"]:
        ob = bpy.data.objects.get(nm)
        if ob:
            for c in list(ob.users_collection): c.objects.unlink(ob)
            coll_for(f"{sp['lower']}_Collision").objects.link(ob)
            ob["level"] = sp["lower"]
    # --- lower level: top landing, walls, head wall with the door, ceiling
    lo = Part(sp, sp["lower"])
    z0, z1 = sp["y0"], sp["y1"]
    lo.box("landing", x0 - T, x1 + T, -T, LD + T, z1 - 0.25, z1)
    lo.box("wallL", x0 - T, x0, a_base, LD + T, z0 - 0.3, z1 + WALL_H)
    lo.box("wallR", x1, x1 + T, a_base, LD + T, z0 - 0.3, z1 + WALL_H)
    dxa, dxb = cx - DW / 2, cx + DW / 2
    lo.box("head", x0 - T, dxa, LD, LD + T, z1, z1 + WALL_H)
    lo.box("head", dxb, x1 + T, LD, LD + T, z1, z1 + WALL_H)
    lo.box("head", dxa, dxb, LD, LD + T, z1 + DH, z1 + WALL_H)
    lo.box("ceil", x0 - T, x1 + T, 0.0, LD + T, z1 + WALL_H, z1 + WALL_H + 0.2)
    lo.emit(f"{sp['key']}_lower")
    d_lo = make_door(f"DoorLeaf_Stair_{sp['key']}_up", sp["lower"], sp, LD + T / 2, sp["dirv"], z1, 1)
    # --- upper level: cupboard over the old stair hole, door on the top edge
    up = Part(sp, sp["upper"])
    fl = bpy.data.objects.get(sp["upper_floor"])
    fmat = fl.data.materials[0] if fl and fl.data.materials else mat_wall
    fy = z1
    up.box("cap", x0 - T, x1 + T, a_base - T, 0.0, fy - 0.3, fy - 0.003, mat=fmat)
    up.box("wallL", x0 - T, x0, a_base - T, 0.0, fy - 0.3, fy + WALL_H)
    up.box("wallR", x1, x1 + T, a_base - T, 0.0, fy - 0.3, fy + WALL_H)
    up.box("wallEnd", x0, x1, a_base - T, a_base, fy - 0.3, fy + WALL_H)
    up.box("ceil", x0 - T, x1 + T, a_base - T, 0.0, fy + WALL_H, fy + WALL_H + 0.2)
    up.box("head", x0 - T, dxa, -T, 0.0, fy, fy + WALL_H)
    up.box("head", dxb, x1 + T, -T, 0.0, fy, fy + WALL_H)
    up.box("head", dxa, dxb, -T, 0.0, fy + DH, fy + WALL_H)
    up.emit(f"{sp['key']}_upper")
    d_up = make_door(f"DoorLeaf_Stair_{sp['key']}_down", sp["upper"], sp, -T / 2, -sp["dirv"], fy, -1)
    # --- arrivals (Blender -> y-up: z -> -by) and the link records
    arr_lo = [round(cx, 3), z1, round(-(sp["top"] + sp["dirv"] * (LD - 0.9)), 3)]
    arr_up = [round(cx, 3), fy, round(-(sp["top"] + sp["dirv"] * 1.3), 3)]
    d_lo["link"] = {"scene": sp["upper"], "door": d_up["name"], "arrive": arr_up, "face": [0.0, -float(sp["dirv"])]}
    d_up["link"] = {"scene": sp["lower"], "door": d_lo["name"], "arrive": arr_lo, "face": [0.0, float(sp["dirv"])]}
    doors_json += [d_lo, d_up]
    links.append({"key": sp["key"], "lower": sp["lower"], "upper": sp["upper"]})

scene["bk_doors"] = json.dumps(doors_json)
bpy.context.view_layer.update()
result = {"stair_links": links, "doors": len(doors_json)}
print("STAIRDOORS", result)
