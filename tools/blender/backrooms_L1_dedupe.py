"""
One of each prop per level on B1, L1 and L2 (the overworld, L3 and L4 are left alone). Security cameras, fire alarms and wall clocks keep all
their copies; every other Prop_ type keeps exactly one. The keeper is the copy that sits cleanly (not in a wall, not overlapping another prop,
standing on the floor or on its desk / shelf, or mounted on a wall) in the largest room; a desk keeps its own chair and laptop, a shelf keeps one
box on it. The furniture collider is rebuilt so only kept props block the way. Run after stairdoors, before split_scenes.
"""
import bpy
import json
import math
import os
import re
import sys
import importlib
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import backrooms_lib as L
import rooms_lib as R
importlib.reload(L); importlib.reload(R)

LEVELS = ("B1", "L1", "L2")
KEEP_ALL = ("fire_alarm", "wall_clock")
DESKS = ("metal_office_desk", "SchoolDesk_01")
ON_DESK = ("classic_laptop", "office_notepads", "Television_01", "boombox", "desk_lamp_arm_01")
MOUNTED = ("korean_fire_extinguisher_01", "lifebuoy", "life_jacket", "korean_public_payphone_01", "dartboard", "fire_alarm", "wall_clock")
FLOATS = ("rubber_duck_toy", "ring_yellow", "ring_pink", "ring_blue", "ball", "noodle_pink", "noodle_green", "noodle_orange", "noodle_blue", "football", "ocean_buoy")
mat_col = L.pbr_mat("M_Collider", None, color=(0.1, 0.9, 0.3), rough=1.0)
level_empty = bpy.data.objects["LEVEL_L1"]
base = lambda n: re.sub(r"\.\d+$", "", n)[5:]

def wbox(o):
    p = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return [min(v.x for v in p), min(v.y for v in p), min(v.z for v in p), max(v.x for v in p), max(v.y for v in p), max(v.z for v in p)]
def inter(a, b): return [min(a[i + 3], b[i + 3]) - max(a[i], b[i]) for i in range(3)]
def inside_xy(p, b, pad=0.05): return b[0] - pad < p[0] < b[3] + pad and b[1] - pad < p[1] < b[4] + pad
def centre(b): return ((b[0] + b[3]) / 2, (b[1] + b[4]) / 2)

report = {}
for lv in LEVELS:
    fz = R.FLOOR[lv]
    g, rooms = R.rooms(lv)
    cellroom = {c: r for r in rooms for c in r["cells"]}
    def room_area(b):
        cx, cy = centre(b)
        for dx, dy in ((0, 0), (0.3, 0), (-0.3, 0), (0, 0.3), (0, -0.3), (0.6, 0), (-0.6, 0), (0, 0.6), (0, -0.6)):
            ij = g.idx(cx + dx, cy + dy)
            if ij and (ij[1] * g.nx + ij[0]) in cellroom: return cellroom[ij[1] * g.nx + ij[0]]["area"]
        return 0.0
    props = [o for o in bpy.data.collections[f"Level_{lv}"].all_objects if o.type == "MESH" and o.name.startswith("Prop_")]
    box = {o.name: wbox(o) for o in props}
    kind = {o.name: base(o.name) for o in props}
    walls = [w for w in g.walls]
    def clean(n):
        b, k = box[n], kind[n]
        for w in walls:
            d = inter(b, w)
            if d[0] > 0.06 and d[1] > 0.06 and d[2] > 0.1: return False
        for m in box:
            if m == n: continue
            d = inter(b, box[m])
            if d[0] > 0.05 and d[1] > 0.05 and d[2] > 0.05:
                if {k, kind[m]} & set(DESKS) and ({k, kind[m]} & set(ON_DESK) or {k, kind[m]} & {"SchoolChair_01", "plastic_monobloc_chair_01"}): continue  # a chair tucked in / a laptop on its desk
                if k == "cardboard_box_01" and kind[m] in ("steel_frame_shelves_01", "cardboard_box_01"): continue
                if kind[m] == "cardboard_box_01" and k == "steel_frame_shelves_01": continue
                return False
        if b[5] > R.CEIL[lv] - 0.02: return False                              # nothing reaches into the ceiling
        if k in FLOATS: return abs(b[2] - (fz + 0.30 - 0.04)) < 0.25            # pool toys float on the water, not anywhere else
        if k in MOUNTED: return True
        lift = b[2] - fz
        if lift > 0.12:                                                           # resting on something (desk, shelf, box below)?
            return any(abs(box[m][5] - b[2]) < 0.12 or (kind[m] == "steel_frame_shelves_01" and inside_xy(centre(b), box[m])) for m in box if m != n and inside_xy(centre(b), box[m]))
        return lift > -0.08
    score = lambda n: (clean(n), room_area(box[n]))
    by_kind = {}
    for o in props: by_kind.setdefault(kind[o.name], []).append(o.name)
    keep = {}
    # desks first, then what goes with them
    for k in DESKS:
        if k in by_kind: keep[k] = max(by_kind[k], key=score)
    kept_desks = [keep[k] for k in DESKS if k in keep]
    for k in ("SchoolChair_01", "plastic_monobloc_chair_01", "metal_stool_01") + ON_DESK:
        if k not in by_kind: continue
        near = [n for n in by_kind[k] for d in kept_desks if math.dist(centre(box[n]), centre(box[d])) < 1.3 and clean(n)]
        keep[k] = near[0] if near else max(by_kind[k], key=score)
    if "steel_frame_shelves_01" in by_kind:
        keep["steel_frame_shelves_01"] = max(by_kind["steel_frame_shelves_01"], key=score)
        if "cardboard_box_01" in by_kind:
            sb = box[keep["steel_frame_shelves_01"]]
            on = [n for n in by_kind["cardboard_box_01"] if inside_xy(centre(box[n]), sb)]
            if on: keep["cardboard_box_01"] = min(on, key=lambda n: box[n][2])
    for k, names in by_kind.items():
        if k in KEEP_ALL or k in keep: continue
        keep[k] = max(names, key=score)
    removed, gone_boxes = [], []
    for o in list(props):
        k = kind[o.name]
        if k in KEEP_ALL or keep.get(k) == o.name: continue
        removed.append(o.name); gone_boxes.append(box[o.name]); L.remove(o)
    for n in removed: box.pop(n)
    # a keeper that still pokes into a wall or another prop is slid (with its chair / laptop / box) to the nearest spot where it fits
    moved = {}
    def group_of(n):
        k, out = kind[n], [n]
        if k in DESKS or k == "steel_frame_shelves_01":
            out += [m for m in keep.values() if m != n and m in box and kind[m] not in DESKS and math.dist(centre(box[m]), centre(box[n])) < 1.3
                    and (k in DESKS and (kind[m] in ON_DESK or "Chair" in kind[m] or "chair" in kind[m]) or k == "steel_frame_shelves_01" and kind[m] == "cardboard_box_01")]
        return out
    def fits(names, dx, dy):
        saved = {m: box[m] for m in names}
        for m in names: b = saved[m]; box[m] = [b[0] + dx, b[1] + dy, b[2], b[3] + dx, b[4] + dy, b[5]]
        ok = all(clean(m) for m in names)
        if ok:
            for m in names:
                ij = g.idx(*centre(box[m]))
                if not ij or g.wall_only[ij[1] * g.nx + ij[0]]: ok = False
        for m in names: box[m] = saved[m]
        return ok
    leaders = [n for n in keep.values() if n in box and kind[n] in DESKS + ("steel_frame_shelves_01",)]
    for k, n in list(keep.items()):
        if n not in box: continue
        if n not in leaders and any(n in group_of(d) for d in leaders): continue                # moves with its desk / shelf
        names = group_of(n)
        if all(clean(m) for m in names): continue
        best = None
        for r in range(1, 31):
            step = r * 0.05
            for a in range(0, 360, 15):
                dx, dy = step * math.cos(math.radians(a)), step * math.sin(math.radians(a))
                if fits(names, dx, dy): best = (dx, dy); break
            if best: break
        if best:
            for m in names:
                bpy.data.objects[m].location.x += best[0]; bpy.data.objects[m].location.y += best[1]
                b = box[m]; box[m] = [b[0] + best[0], b[1] + best[1], b[2], b[3] + best[0], b[4] + best[1], b[5]]
                moved[m] = [round(best[0], 2), round(best[1], 2)]
        else:                                                                    # nowhere clean within 1.5 m: better gone than inside a wall
            for m in names:
                if not clean(m): L.remove(bpy.data.objects[m]); box.pop(m); moved[m] = "removed"
    bpy.context.view_layer.update()
    # rebuild the furniture collider: a box survives only if it belongs to a kept prop
    kept_boxes = [box[n] for n in keep.values() if n in box]
    for co in [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("COL_Furnish_") and o.get("level") == lv]:
        boxes = []
        for a, b in L.components(co.data):
            p, q = co.matrix_world @ a, co.matrix_world @ b
            c = ((p.x + q.x) / 2, (p.y + q.y) / 2)
            if any(inside_xy(c, kb, 0.02) for kb in kept_boxes):
                boxes.append(((min(p.x, q.x), min(p.y, q.y), min(p.z, q.z)), (max(p.x, q.x), max(p.y, q.y), max(p.z, q.z))))
        coll, src, name = co.users_collection[0], co.get("source", f"Detail_Props_{lv}"), co.name
        L.remove(co)
        if boxes:
            new = L.place_mesh(name, L.mesh_from_boxes("c", boxes, uv=False), [mat_col], coll, level_empty, lv)
            new.display_type, new.hide_render, new["collider"], new["source"] = "WIRE", True, "box", src
            new.hide_set(True)
    report[lv] = {"kept": {k: (n, round(room_area(box[n]), 1), clean(n)) for k, n in sorted(keep.items()) if n in box}, "removed": len(removed), "moved": moved,
                  "unclean": [n for n in box if not clean(n)],
                  "kept_all": {k: len(by_kind.get(k, [])) for k in KEEP_ALL}}
bpy.context.view_layer.update()
result = report
print("DEDUPE", json.dumps(report))
