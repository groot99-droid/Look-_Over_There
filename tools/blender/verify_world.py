"""
Read-only checks after the stair / ceiling / dedupe passes.
  blender -b backrooms_world5.blend --python verify_world.py
  ceiling   every floor point of B1..L3 has a ceiling overhead (stair shafts are roofed, so they count too); no two ceiling slabs overlap
  stairs    no stair / cupboard / shaft part intersects anything else in its level (walls, props, fittings) beyond touching faces
  props     B1/L1/L2: one Prop_ of each kind except fire alarms and clocks
"""
import bpy
import collections
import json
import re
from mathutils import Vector
from mathutils.bvhtree import BVHTree

FL = {"B1": -3.0, "L1": 0.0, "L2": 3.2, "L3": 6.4, "L4": 9.6}
dg = bpy.context.evaluated_depsgraph_get()
out = {}

def wbox(o):
    p = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return [min(v.x for v in p), min(v.y for v in p), min(v.z for v in p), max(v.x for v in p), max(v.y for v in p), max(v.z for v in p)]
def inter(a, b): return [min(a[i + 3], b[i + 3]) - max(a[i], b[i]) for i in range(3)]
def visible(o): return o.type == "MESH" and not o.name.startswith(("COL_", "Zone_"))

for lv, fz in FL.items():
    objs = [o for o in bpy.data.collections[f"Level_{lv}"].all_objects if visible(o)]
    verts, polys = [], []
    for o in objs:
        if o.name.startswith("SecCam"): continue
        me = o.evaluated_get(dg).to_mesh(); b = len(verts)
        verts += [o.matrix_world @ v.co for v in me.vertices]; polys += [[b + i for i in p.vertices] for p in me.polygons]
        o.evaluated_get(dg).to_mesh_clear()
    bvh = BVHTree.FromPolygons(verts, polys)
    n = unc = 0; where = []
    for xi in range(-53, 54):
        for yi in range(-55, 46):
            x, y = xi * 0.5, yi * 0.5
            h = bvh.ray_cast(Vector((x, y, fz + 1.6)), Vector((0, 0, -1)), 2.5)
            if h[0] is None or h[1].z < 0.7 or abs(h[0].z - fz) > 0.8: continue
            n += 1
            if bvh.ray_cast(h[0] + Vector((0, 0, 0.5)), Vector((0, 0, 1)), 9.0)[0] is None: unc += 1; where.append((x, y))
    ceils = [(o.name, wbox(o)) for o in objs if o.name.startswith("Ceiling_")]
    overl = [(a[0], b[0]) for i, a in enumerate(ceils) for b in ceils[i + 1:] if min(inter(a[1], b[1])) > 0.01]
    # stair parts against everything else in the level (bounding boxes of separate parts; the parts of one staircase may touch each other)
    # stair parts are merged boxes: compare each box (connected piece) with each connected piece of everything else that could be in the way
    import bmesh
    def pieces(o):
        bm = bmesh.new(); bm.from_mesh(o.evaluated_get(dg).data); seen = set(); res = []
        for v in bm.verts:
            if v.index in seen: continue
            st = [v]; seen.add(v.index); pts = []
            while st:
                a = st.pop(); pts.append(o.matrix_world @ a.co)
                for e in a.link_edges:
                    b = e.other_vert(a)
                    if b.index not in seen: seen.add(b.index); st.append(b)
            res.append([min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts), max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)])
        bm.free(); return res
    parts = [(o.name, b) for o in objs if o.name.startswith(("Stair_", "DoorLeaf_Stair", "Ceiling_") ) and (not o.name.startswith("Ceiling_") or o.name.endswith("_cap")) for b in pieces(o)]
    lo = [min(b[i] for _, b in parts) for i in range(3)] if parts else [0, 0, 0]
    hi = [max(b[i + 3] for _, b in parts) for i in range(3)] if parts else [0, 0, 0]
    hits = []
    for o in objs:
        if o.name.startswith(("Stair_", "Stairs_", "DoorLeaf_Stair", "Ceiling_", "Floor_", "Lights_", "Housing_")) or o.name.startswith("SecCam") and "mount" in o.name: continue
        if min(inter(lo + hi, wbox(o))) <= 0.02: continue
        for ob in pieces(o):
            for pn, pb in parts:
                d = inter(pb, ob)
                if min(d) > 0.035: hits.append((pn, o.name, [round(v, 2) for v in ob], [round(v, 2) for v in d]))
    out[lv] = {"floor_pts": n, "no_ceiling": unc, "no_ceiling_at": where[:10], "ceiling_overlaps": overl, "stair_hits": hits[:40], "n_stair_hits": len(hits)}
    if lv in ("B1", "L1", "L2"):
        c = collections.Counter(re.sub(r"\.\d+$", "", o.name)[5:] for o in objs if o.name.startswith("Prop_"))
        out[lv]["dupes"] = {k: v for k, v in c.items() if v > 1 and k not in ("fire_alarm", "wall_clock")}
        out[lv]["kinds"] = len(c)
print("VERIFY", json.dumps(out))
