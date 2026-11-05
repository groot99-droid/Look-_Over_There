"""
Walkability fixes found by the in-game audit (tools/walkaudit.js in the game repo). Each entry removes one prop island (visual and collider) that seals off floor space.
Idempotent: an island that is already gone is simply not found. Run after furnish/links and before split_scenes.
"""
import bpy
import bmesh
from mathutils import Vector

# (object names, world-space Blender region x0, y0, z0, x1, y1, z1, why)
FIXES = [
    (("Extra_Props_L1", "COL_Extra_Props_L1"), (-3.9, 0.55, -0.1, -2.4, 1.75, 2.6), "L1 room 1B_W: a prop seals the doorway (audit: 3.3 m2 cut off)"),
]
removed = []
for names, (x0, y0, z0, x1, y1, z1), why in FIXES:
    for nm in names:
        ob = bpy.data.objects.get(nm)
        if not ob or ob.type != "MESH": continue
        bm = bmesh.new(); bm.from_mesh(ob.data)
        seen, kill = set(), []
        for v in bm.verts:
            if v.index in seen: continue
            stack, comp = [v], []; seen.add(v.index)
            while stack:
                a = stack.pop(); comp.append(a)
                for e in a.link_edges:
                    b = e.other_vert(a)
                    if b.index not in seen: seen.add(b.index); stack.append(b)
            ws = [ob.matrix_world @ a.co for a in comp]
            lo = Vector((min(p.x for p in ws), min(p.y for p in ws), min(p.z for p in ws)))
            hi = Vector((max(p.x for p in ws), max(p.y for p in ws), max(p.z for p in ws)))
            if lo.x >= x0 and hi.x <= x1 and lo.y >= y0 and hi.y <= y1 and lo.z >= z0 and hi.z <= z1: kill += comp
        if kill:
            bmesh.ops.delete(bm, geom=kill, context="VERTS")
            bm.to_mesh(ob.data); removed.append((nm, len(kill), why))
        bm.free()
result = {"walkfix_removed": removed}
print("WALKFIX", result)

# ------------------------------------------------------------------ gaps cut into collider walls (the lot's east skirt wall cut the city street off from the lot)
from backrooms_lib import mesh_from_boxes, place_mesh, components
def cut_gap(col_name, region, gap_y, lintel_z):
    """region = (x0, x1) of the wall island (Blender x), gap_y = (y0, y1) the opening along the wall, lintel_z = height of the opening."""
    ob = bpy.data.objects.get(col_name)
    if not ob: return 0
    boxes, n = [], 0
    for lo, hi in components(ob.data):
        p, q = ob.matrix_world @ lo, ob.matrix_world @ hi
        b = ((min(p.x, q.x), min(p.y, q.y), min(p.z, q.z)), (max(p.x, q.x), max(p.y, q.y), max(p.z, q.z)))
        if abs(b[0][0] - region[0]) < 0.2 and abs(b[1][0] - region[1]) < 0.2 and b[0][1] < gap_y[0] and b[1][1] > gap_y[1]:
            (x0, y0, z0), (x1, y1, z1) = b
            boxes += [((x0, y0, z0), (x1, gap_y[0], z1)), ((x0, gap_y[1], z0), (x1, y1, z1)), ((x0, gap_y[0], z0 + lintel_z), (x1, gap_y[1], z1))]
            n += 1
        else: boxes.append(b)
    if n:
        coll, lvl, src, mat = ob.users_collection[0], ob.get("level", "LOT"), ob.get("source"), (ob.data.materials[0] if ob.data.materials else None)
        name, par = ob.name, ob.parent
        bpy.data.objects.remove(ob)
        new = place_mesh(name, mesh_from_boxes("c", boxes, uv=False), [mat] if mat else [], coll, bpy.data.objects["LEVEL_L1"], lvl)
        new["source"], new["collider"] = src, "box"
        new.display_type = "WIRE"; new.hide_set(True)
    return n
gaps = cut_gap("COL_Site_ITN_City", (60.0, 61.0), (-54.0, -48.0), 4.0)
result["gaps_cut"] = gaps
print("WALKFIX gaps", gaps)
