"""
Gives a rigged Meshy character (skeleton + textures, no animation clips) idle / walk / run / attack clips and exports it for the game.
  blender -b --python make_monster_anims.py -- in.glb out.glb
Bone roles are found from the rest pose (heights and left/right), so it works with Meshy's generic Bone_000.. names. Every swing is a rotation
about the armature's X axis expressed in each bone's own rest frame, so the clips are correct whatever the bones' roll is.
"""
import bpy
import math
import sys
from mathutils import Quaternion, Vector

src, dst = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
bones = arm.data.bones
head = {b.name: b.head_local.copy() for b in bones}
tail = {b.name: b.tail_local.copy() for b in bones}
Q = {b.name: b.matrix_local.to_quaternion() for b in bones}
kids = {b.name: [c.name for c in b.children] for b in bones}
root = next(b.name for b in bones if b.parent is None)

def chain(start, n):
    out, cur = [], start
    while cur and len(out) < n:
        out.append(cur); cur = kids[cur][0] if kids[cur] else None
    return out
# the two legs hang from the pelvis: the children whose heads sit lowest; the arms leave the chest and are the widest bones
pelvis = kids[root][0]
leg_roots = sorted([k for k in kids[pelvis] if head[k].z < head[pelvis].z + 0.05], key=lambda k: head[k].x)
legs = {"L": chain(leg_roots[-1], 3), "R": chain(leg_roots[0], 3)}                 # x>0 and x<0
spine = [pelvis]
cur = pelvis
while True:
    ups = [k for k in kids[cur] if head[k].z > head[cur].z + 0.03 and abs(head[k].x) < 0.12]
    if not ups: break
    cur = max(ups, key=lambda k: head[k].z); spine.append(cur)
arm_roots = [k for b in spine for k in kids[b] if k not in spine and head[k].z > head[pelvis].z + 0.3 and abs(tail[k].x) > 0.07]
arm_roots = sorted(arm_roots, key=lambda k: tail[k].x)
arms = {"R": chain(arm_roots[0], 3), "L": chain(arm_roots[-1], 3)} if len(arm_roots) >= 2 else {}
print("ROLES legs", legs, "arms", arms, "spine", spine)

pose = arm.pose
for pb in pose.bones: pb.rotation_mode = "QUATERNION"
X = Vector((1, 0, 0))

def swing(bone, angle, axis=X):
    """Armature-space rotation by `angle` about `axis`, as the bone-local rotation Blender wants (valid for rotations about one shared axis)."""
    return Q[bone].inverted() @ Quaternion(axis, angle) @ Q[bone]

def make_action(name, frames, fn):
    act = bpy.data.actions.new(name)
    arm.animation_data_create(); arm.animation_data.action = act
    for f in range(1, frames + 2):
        t = (f - 1) / frames
        for pb in pose.bones:
            pb.rotation_quaternion = Quaternion((1, 0, 0, 0)); pb.location = (0, 0, 0)
        fn(t)
        for pb in pose.bones:
            pb.keyframe_insert("rotation_quaternion", frame=f)
        pose.bones[root].keyframe_insert("location", frame=f)
    return act

def setq(bone, angle, axis=X):
    pose.bones[bone].rotation_quaternion = swing(bone, angle, axis) @ pose.bones[bone].rotation_quaternion

def gait(amp_leg, amp_arm, lean, bob, knee):
    def fn(t):
        ph = 2 * math.pi * t
        for side, sgn in (("L", 1), ("R", -1)):
            p = ph + (0 if side == "L" else math.pi)
            hip, kn, ank = legs[side]
            setq(hip, amp_leg * math.sin(p)); setq(kn, knee * max(0.0, math.sin(p + math.pi / 2)) * 0.9 + 0.1 * knee); setq(ank, -0.25 * amp_leg * math.sin(p))
            if side in arms:
                sh = arms[side]
                setq(sh[0], -amp_arm * math.sin(p)); setq(sh[1], -0.5 * amp_arm * (1 + math.sin(p)) * 0.5)
        for i, b in enumerate(spine[1:], 1): setq(b, lean / max(1, len(spine) - 1))
        pose.bones[root].location = (0, 0, bob * abs(math.sin(ph)))
    return fn

def idle(t):
    ph = 2 * math.pi * t
    for i, b in enumerate(spine[1:], 1): setq(b, 0.03 * math.sin(ph + i * 0.4) + 0.05 / len(spine))
    for side in arms: setq(arms[side][0], 0.06 * math.sin(ph + (0 if side == "L" else 1.5)))
    pose.bones[root].location = (0, 0, 0.01 * math.sin(ph))

def attack(t):
    k = math.sin(math.pi * min(1.0, t * 1.1)) ** 1.5                       # wind up and lunge
    for b in spine[1:]: setq(b, 0.12 * k)
    for side in arms:
        sh = arms[side]; setq(sh[0], -1.9 * k); setq(sh[1], -0.6 * k)
    for side in legs: setq(legs[side][0], 0.25 * k * (1 if side == "L" else -1))

actions = [make_action("idle", 72, idle),
           make_action("walk", 33, gait(0.50, 0.40, 0.08, 0.025, 0.55)),
           make_action("run", 18, gait(0.80, 0.75, 0.30, 0.05, 0.95)),
           make_action("attack", 27, attack)]
arm.animation_data.action = None
for a in actions:                                                           # push each clip to its own NLA strip so the exporter writes all of them
    tr = arm.animation_data.nla_tracks.new(); tr.name = a.name
    st = tr.strips.new(a.name, 1, a); st.name = a.name
for pb in pose.bones: pb.rotation_quaternion = Quaternion((1, 0, 0, 0)); pb.location = (0, 0, 0)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_skins=True, export_apply=False, export_draco_mesh_compression_enable=False, export_image_format="AUTO")
print("EXPORTED", dst, [a.name for a in actions])
