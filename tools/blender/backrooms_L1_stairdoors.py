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
# every stair part wears the look of the level it is seen from: below the upper floor the lower level, above it the upper level
WALL = {"B1": "M_D_wall_B1", "L1": "M_D_wall_L1", "L2": "M_D_wall_L2", "L3": "M_D_wall_L3", "L4": "M_U_wall_L4"}
def lm(kind, lvl):
    name = WALL[lvl] if kind == "wall" else f"M_D_{kind}_{lvl}"
    return bpy.data.materials.get(name) or mat_wall
mat_tube, mat_housing = bpy.data.materials.get("M_Fluorescent"), bpy.data.materials.get("M_Fixture_Housing")
mat_door = bpy.data.materials.get("M_Door") or mat_("M_Door", (0.42, 0.30, 0.18), 0.7)
mat_col = pbr_mat("M_Collider", None, color=(0.1, 0.9, 0.3), rough=1.0)

def coll_for(name):
    return bpy.data.collections.get(name)

_EXIST = {}
def existing(lvl):
    """World boxes of the level's own walls and pillars: a stair part never doubles one of them (no coplanar copies, nothing buried in a wall)."""
    if lvl not in _EXIST:
        out = []
        for o in bpy.data.collections[f"Level_{lvl}"].all_objects:
            if o.type == "MESH" and not o.get("stairdoor") and o.name.startswith(("Walls_", "Wall_", "Columns_", "Pillars_")):
                for lo, hi in components(o.data):
                    p, q = o.matrix_world @ lo, o.matrix_world @ hi
                    out.append((min(p.x, q.x), min(p.y, q.y), min(p.z, q.z), max(p.x, q.x), max(p.y, q.y), max(p.z, q.z)))
        _EXIST[lvl] = out
    return _EXIST[lvl]

def carve(lvl, bx):
    """Split a box so the parts already filled by an existing wall are left out. Upright slabs are cut in their own plane, flat ones in plan."""
    (x0, y0, z0), (x1, y1, z1) = bx
    flat = (z1 - z0) < min(x1 - x0, y1 - y0)
    along_x = (x1 - x0) >= (y1 - y0)
    holes = []
    for e in existing(lvl):
        ox, oy, oz = min(x1, e[3]) - max(x0, e[0]), min(y1, e[4]) - max(y0, e[1]), min(z1, e[5]) - max(z0, e[2])
        if ox <= 0.02 or oy <= 0.02 or oz <= 0.02: continue
        if flat: holes.append((max(x0, e[0]), max(y0, e[1]), min(x1, e[3]), min(y1, e[4])))
        else:
            thin = oy if along_x else ox
            if thin < 0.05: continue                                              # only grazes the face
            holes.append((max(x0, e[0]), max(z0, e[2]), min(x1, e[3]), min(z1, e[5])) if along_x else (max(y0, e[1]), max(z0, e[2]), min(y1, e[4]), min(z1, e[5])))
    if not holes: return [bx]
    if flat: return [((r[0], r[1], z0), (r[2], r[3], z1)) for r in rect_minus((x0, y0, x1, y1), holes)]
    if along_x: return [((r[0], y0, r[1]), (r[2], y1, r[3])) for r in rect_minus((x0, z0, x1, z1), holes)]
    return [((x0, r[0], r[1]), (x1, r[2], r[3])) for r in rect_minus((y0, z0, y1, z1), holes)]

class Part:
    """Boxes in (x0, x1, a0, a1, z0, z1) along a staircase frame; emitted as one mesh + one collider mesh per level."""
    def __init__(self, sp, lvl):
        self.sp, self.lvl, self.vis, self.col = sp, lvl, {}, []
    def box(self, key, x0, x1, a0, a1, z0, z1, mat=None, col=True):
        sp = self.sp
        b1, b2 = sp["top"] + sp["dirv"] * a0, sp["top"] + sp["dirv"] * a1
        bxs = carve(self.lvl, ((x0, min(b1, b2), z0), (x1, max(b1, b2), z1)))
        CARVED[0] += 1 if len(bxs) != 1 or bxs[0] != ((x0, min(b1, b2), z0), (x1, max(b1, b2), z1)) else 0
        self.vis.setdefault(key, (mat or mat_wall, []))[1].extend(bxs)
        if col: self.col.extend(bxs)
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
HOLES, STEPS, CARVED, RAILS = {}, [], [0], {}          # level -> ceiling openings of the shafts that rise from it (x0, y0, x1, y1)
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
    L_, U_ = sp["lower"], sp["upper"]
    lo.box("landing", x0 - T, x1 + T, -T, LD + T, z1 - 0.2, z1, mat=lm("floor", U_))
    lo.box("wallLo", x0 - T, x0, a_base, LD + T, z0 - 0.3, z1, mat=lm("wall", L_))
    lo.box("wallLo", x1, x1 + T, a_base, LD + T, z0 - 0.3, z1, mat=lm("wall", L_))
    lo.box("wallHi", x0 - T, x0, a_base - T, LD + T, z1, z1 + WALL_H, mat=lm("wall", U_))
    lo.box("wallHi", x1, x1 + T, a_base - T, LD + T, z1, z1 + WALL_H, mat=lm("wall", U_))
    lo.box("wallHi", x0, x1, a_base - T, a_base, z1, z1 + WALL_H, mat=lm("wall", U_))           # closes the shaft above the lower ceiling at the foot of the stairs
    dxa, dxb = cx - DW / 2, cx + DW / 2
    lo.box("wallHi", x0 - T, dxa, LD, LD + T, z1, z1 + WALL_H)
    lo.box("wallHi", dxb, x1 + T, LD, LD + T, z1, z1 + WALL_H)
    lo.box("wallHi", dxa, dxb, LD, LD + T, z1 + DH, z1 + WALL_H)
    lo.box("ceil", x0 - T, x1 + T, a_base - T, LD + T, z1 + WALL_H, z1 + WALL_H + 0.2, mat=lm("ceil", U_))   # the whole shaft is roofed, not just the landing
    if mat_tube and mat_housing:                                                                 # one light panel over the landing
        am = LD / 2
        lo.box("housing", cx - 0.32, cx + 0.32, am - 0.62, am + 0.62, z1 + WALL_H - 0.06, z1 + WALL_H, mat=mat_housing, col=False)
        lo.box("tube", cx - 0.28, cx + 0.28, am - 0.58, am + 0.58, z1 + WALL_H - 0.09, z1 + WALL_H - 0.06, mat=mat_tube, col=False)
    HOLES.setdefault(L_, []).append((x0 - T, min(sp["top"] + sp["dirv"] * a_base, sp["top"] + sp["dirv"] * (LD + T)),
                                     x1 + T, max(sp["top"] + sp["dirv"] * a_base, sp["top"] + sp["dirv"] * (LD + T))))
    for ob in bpy.data.collections[f"Level_{L_}"].all_objects:                                    # steps in the lower level's floor finish
        if ob.type == "MESH" and ob.name.startswith("Stairs_"):
            bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
            if abs((min(p.x for p in bb) + max(p.x for p in bb)) / 2 - cx) < 0.3:
                ob.data.materials.clear(); ob.data.materials.append(lm("floor", L_)); STEPS.append(ob.name)
    lo.emit(f"{sp['key']}_lower")
    d_lo = make_door(f"DoorLeaf_Stair_{sp['key']}_up", sp["lower"], sp, LD + T / 2, sp["dirv"], z1, 1)
    # --- upper level: cupboard over the old stair hole, door on the top edge
    up = Part(sp, sp["upper"])
    fy = z1
    up.box("cap", x0 - T, x1 + T, a_base - T, 0.0, fy - 0.3, fy - 0.003, mat=lm("floor", U_))
    up.box("wall", x0 - T, x0, a_base - T, 0.0, fy - 0.3, fy + WALL_H, mat=lm("wall", U_))     # the cupboard reads as a block of the level's own wall
    up.box("wall", x1, x1 + T, a_base - T, 0.0, fy - 0.3, fy + WALL_H)
    up.box("wall", x0, x1, a_base - T, a_base, fy - 0.3, fy + WALL_H)
    up.box("wall", x0 - T, dxa, -T, 0.0, fy, fy + WALL_H)
    up.box("wall", dxb, x1 + T, -T, 0.0, fy, fy + WALL_H)
    up.box("wall", dxa, dxb, -T, 0.0, fy + DH, fy + WALL_H)
    up.box("ceil", x0 - T, x1 + T, a_base - T, 0.0, fy + WALL_H, fy + WALL_H + 0.2, mat=lm("ceil", U_))
    up.emit(f"{sp['key']}_upper")
    # the old guard rail round the stair hole would now stick through the cupboard: drop the rail pieces that stand on its footprint
    ya, yb = sorted((sp["top"] + sp["dirv"] * (a_base - T), sp["top"]))
    fx = (x0 - T - 0.25, ya - 0.25, x1 + T + 0.25, yb + 0.25)
    import bmesh as _bm
    for ob in list(bpy.data.collections[f"Level_{U_}"].all_objects):
        if ob.type != "MESH" or not ob.name.startswith(("Rails_", "COL_Rails_")): continue
        if ob.data.users > 1: ob.data = ob.data.copy()
        bm = _bm.new(); bm.from_mesh(ob.data); mw = ob.matrix_world; seen = set(); kill = []
        for v in bm.verts:
            if v.index in seen: continue
            st, isl = [v], []; seen.add(v.index)
            while st:
                a = st.pop(); isl.append(a)
                for e in a.link_edges:
                    b = e.other_vert(a)
                    if b.index not in seen: seen.add(b.index); st.append(b)
            pts = [mw @ a.co for a in isl]
            cxy = (sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts))
            if fx[0] < cxy[0] < fx[2] and fx[1] < cxy[1] < fx[3] and min(p.z for p in pts) < fy + 1.5: kill += isl
        if kill:
            _bm.ops.delete(bm, geom=kill, context="VERTS"); bm.to_mesh(ob.data); RAILS[ob.name] = len(kill)
        bm.free()
        if not ob.data.vertices: remove(ob)
    d_up = make_door(f"DoorLeaf_Stair_{sp['key']}_down", sp["upper"], sp, -T / 2, -sp["dirv"], fy, -1)
    # --- arrivals (Blender -> y-up: z -> -by) and the link records
    arr_lo = [round(cx, 3), z1, round(-(sp["top"] + sp["dirv"] * (LD - 0.9)), 3)]
    arr_up = [round(cx, 3), fy, round(-(sp["top"] + sp["dirv"] * 1.3), 3)]
    d_lo["link"] = {"scene": sp["upper"], "door": d_up["name"], "arrive": arr_up, "face": [0.0, -float(sp["dirv"])]}
    d_up["link"] = {"scene": sp["lower"], "door": d_lo["name"], "arrive": arr_lo, "face": [0.0, float(sp["dirv"])]}
    doors_json += [d_lo, d_up]
    links.append({"key": sp["key"], "lower": sp["lower"], "upper": sp["upper"]})


# --- ceilings: every level's ceiling is the floor slab of the level above, which now lives in another scene. Each lower scene gets one slab over
# its whole footprint, at the height of the upper floor slab, in its own ceiling finish, open only where a stair shaft rises (the shaft roofs that).
FOOT = (-26.3, -27.35, 26.28, 22.35)
CEIL_Z = {"B1": (-0.2, 0.0), "L1": (3.0, 3.2), "L2": (6.2, 6.4), "L3": (9.4, 9.6)}
for nm in ("Ceiling_B1_Pools",):                       # only covered the north strip, and would z-fight with the slab
    ob = bpy.data.objects.get(nm)
    if ob: remove(ob)
    for co in [o for o in bpy.data.objects if o.name.startswith("COL_") and o.get("source") == nm]: remove(co)
made = []
for lower, (cz0, cz1) in CEIL_Z.items():
    rects = rect_minus(FOOT, HOLES.get(lower, []))
    boxes = [((r[0], r[1], cz0), (r[2], r[3], cz1)) for r in rects]
    ob = place_mesh(f"Ceiling_{lower}_cap", mesh_from_boxes("c", boxes), [lm("ceil", lower)], coll_for(f"Detail_{lower}"), level_empty, lower)
    ob["stairdoor"] = ob["keep_mat"] = True
    co = place_mesh(f"COL_Ceiling_{lower}_cap", mesh_from_boxes("c", boxes, uv=False), [mat_col], coll_for(f"{lower}_Collision"), level_empty, lower)
    co["stairdoor"], co["source"], co["collider"] = True, f"Ceiling_{lower}_cap", "box"
    co.display_type, co.hide_render = "WIRE", True
    co.hide_set(True)
    made.append((ob.name, len(boxes)))

# --- ceiling fittings that hung in a shaft opening (light panels, housings, vents) lose the faces that sit inside it
import bmesh
trimmed = {}
for lower, holes in HOLES.items():
    cz0 = CEIL_Z[lower][0]
    for ob in bpy.data.collections[f"Level_{lower}"].all_objects:
        if ob.type != "MESH" or ob.get("stairdoor") or not ob.name.startswith(("Lights_", "Housing_", "Extra_Vents_")): continue
        mw = ob.matrix_world
        if ob.data.users > 1: ob.data = ob.data.copy()
        bm = bmesh.new(); bm.from_mesh(ob.data)
        gone = []
        for f in bm.faces:
            c = mw @ f.calc_center_median()
            if cz0 - 0.6 < c.z < cz0 + 0.1 and any(h[0] - 0.05 < c.x < h[2] + 0.05 and h[1] - 0.05 < c.y < h[3] + 0.05 for h in holes): gone.append(f)
        if gone:
            # take whole connected fixtures, not just the faces that are inside
            seen, stack = set(gone), list(gone)
            while stack:
                f = stack.pop()
                for e in f.edges:
                    for g in e.link_faces:
                        if g not in seen: seen.add(g); stack.append(g)
            bmesh.ops.delete(bm, geom=list(seen), context="FACES")
            bm.to_mesh(ob.data); trimmed[ob.name] = len(seen)
        bm.free()
# an ordinary door standing right in front of a stair door (the old one at the top of the former stairs) would hide the hallway: it goes
double = []
for sd in [d for d in doors_json if d["name"].startswith("DoorLeaf_Stair")]:
    for od in [d for d in doors_json if not d["name"].startswith("DoorLeaf_Stair") and d["level"] == sd["level"]]:
        if math.dist(od["hinge"], sd["hinge"]) < 0.6 and abs(od["closed_yaw_deg"] - sd["closed_yaw_deg"]) % 180 < 1:
            double.append(od["name"])
            ob = bpy.data.objects.get(od["name"])
            if ob: remove(ob)
doors_json = [d for d in doors_json if d["name"] not in double]
scene["bk_doors"] = json.dumps(doors_json)
bpy.context.view_layer.update()
result = {"double_doors_removed": double,"stair_links": links, "doors": len(doors_json), "ceilings": made, "holes": HOLES, "trimmed": trimmed, "steps": STEPS, "carved_boxes": CARVED[0], "rails": RAILS}
print("STAIRDOORS", result)
