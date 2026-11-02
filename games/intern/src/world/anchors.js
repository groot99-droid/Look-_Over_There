// Attach maths for the continuous building (src/world/world.js). Pure: no
// renderer, no scene, so test/cases/world.anchors.js runs without WebGL.
//
// An ANCHOR is a doorway's outward-facing frame in its room's own
// coordinates: { pos: [x, y, z], yaw } with yaw in degrees in the
// controls.js convention (yaw 0 faces -z, 90 faces -x, -90 faces +x, 180
// faces +z). A door on the N wall faces out at yaw 0, S at 180, E at -90,
// W at 90; its pos is the outer face of the wall, at the sill.
//
// Joining room B to room A's exit means: B's entry anchor, turned to face
// back the way it came (180 deg), lands exactly on A's exit anchor.
//     M_B = M_A . P(exitA) . Ry(180) . P(entryB)^-1
// A `vertical` anchor (the water surface over the dive) joins without the
// turn: the two frames simply coincide.

import * as THREE from '../../vendor/three/three.module.js';

const DEG = Math.PI / 180;

export function poseMatrix(anchor, out = new THREE.Matrix4()) {
  const [x = 0, y = 0, z = 0] = anchor.pos || [];
  out.makeRotationY((anchor.yaw || 0) * DEG);
  out.setPosition(x, y, z);
  return out;
}

const _a = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _turn = new THREE.Matrix4().makeRotationY(Math.PI);

// The world matrix for a room whose `entry` anchor should meet `exit` of a
// room already placed at `fromMatrix`.
export function attachMatrix(fromMatrix, exit, entry, { vertical = false } = {}) {
  const m = new THREE.Matrix4().copy(fromMatrix).multiply(poseMatrix(exit, _a));
  if (!vertical) m.multiply(_turn);
  m.multiply(poseMatrix(entry, _b).invert());
  return m;
}

// An anchor carried into world space by a room's matrix: position and the
// yaw it now faces (rooms are only ever turned about Y).
export function anchorToWorld(matrix, anchor) {
  const p = new THREE.Vector3(...(anchor.pos || [0, 0, 0])).applyMatrix4(matrix);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().extractRotation(matrix), 'YXZ');
  return { pos: [p.x, p.y, p.z], yaw: (anchor.yaw || 0) + e.y / DEG };
}

// Room-local pose ({pos, look, fov}) -> world pose, for carried camera moves
// and ending shots authored in the room's own frame.
export function poseToWorld(matrix, pose) {
  const p = new THREE.Vector3(...pose.pos).applyMatrix4(matrix);
  const l = new THREE.Vector3(...pose.look).applyMatrix4(matrix);
  return { pos: [p.x, p.y, p.z], look: [l.x, l.y, l.z], fov: pose.fov };
}

// Outward anchor for a door on a wall of a room of size [W, H, D].
// `x` is the door's offset along the wall: the x coordinate on N/S walls,
// the z coordinate on E/W walls. `y` is the sill. `t` is the wall depth.
export function doorAnchor(size, door, t = 0.3) {
  const [W, , D] = size;
  const x = door.x || 0, y = door.y || 0;
  switch (door.wall) {
    case 'N': return { pos: [x, y, -D / 2 - t], yaw: 0 };
    case 'S': return { pos: [x, y, D / 2 + t], yaw: 180 };
    case 'E': return { pos: [W / 2 + t, y, x], yaw: -90 };
    case 'W': return { pos: [-W / 2 - t, y, x], yaw: 90 };
    default: throw new Error(`anchors: bad wall ${door.wall}`);
  }
}

// Axis-aligned interior box of a room in its own frame, for "which room is
// the player in" and the overlap checks.
export function interiorBox(rec) {
  const [W, H, D] = rec.size;
  const y0 = rec.floorY || 0;
  return new THREE.Box3(new THREE.Vector3(-W / 2, y0 - 0.5, -D / 2), new THREE.Vector3(W / 2, H + 0.5, D / 2));
}
