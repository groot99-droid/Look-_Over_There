// Scene-building helpers shared by the walk scenes: PBR materials over the procedural
// texture sets, a builder that batches geometry per material (one draw call per material,
// which is what keeps a phone at 60 fps), world-space UVs for architecture, lathes for
// turned wood and ceramics, and simple AABB colliders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// World-space UVs (after the Chronicle Museum's matlib.applyWorldUV): each vertex takes the
// two world axes perpendicular to its dominant normal axis, divided by the metres-per-repeat
// tile. Tiling is then seamless across every piece that shares a material.
export function applyWorldUV(geometry, tile) {
  const pos = geometry.attributes.position;
  let nor = geometry.attributes.normal;
  if (!nor) { geometry.computeVertexNormals(); nor = geometry.attributes.normal; }
  const t = Array.isArray(tile) ? tile : [tile, tile];
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[2 * i] = u / t[0];
    uv[2 * i + 1] = v / t[1];
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// A MeshStandardMaterial over a texture set from textures.js (or none).
export function pbr(set, {
  color = '#ffffff', roughness = 0.8, metalness = 0, env = 0.25, emissive = null, emissiveIntensity = 1,
  normalScale = 1, side = THREE.FrontSide, transparent = false, opacity = 1, name = '', worldUV = true, tile = null,
  castShadow = true, receiveShadow = true, flat = false,
} = {}) {
  const params = {
    name, color: new THREE.Color(color), roughness, metalness, envMapIntensity: env, side, transparent, opacity,
  };
  if (set) {
    if (set.map) params.map = set.map;
    if (set.normalMap) { params.normalMap = set.normalMap; params.normalScale = new THREE.Vector2(normalScale, normalScale); }
    if (set.roughnessMap) params.roughnessMap = set.roughnessMap;
    if (set.emissiveMap) params.emissiveMap = set.emissiveMap;
  }
  if (emissive) { params.emissive = new THREE.Color(emissive); params.emissiveIntensity = emissiveIntensity; }
  if (flat) params.flatShading = true;
  const m = new THREE.MeshStandardMaterial(params);
  if (transparent) m.depthWrite = false;
  m.userData.worldUV = worldUV && !!set;
  m.userData.tile = tile || (set ? set.tile : 1);
  m.userData.castShadow = castShadow;
  m.userData.receiveShadow = receiveShadow;
  return m;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

// Transform for a piece: position, then Y-rotation (radians), then optional full euler.
export function place(x, y, z, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
export function cyl(rTop, rBot, h, seg = 12, open = false) { return new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open); }
export function sphere(r, w = 12, h = 8) { return new THREE.SphereGeometry(r, w, h); }

// Lathe from [radius, y] pairs (bottom to top).
export function lathe(profile, segments = 16) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, segments);
}

// Collects geometry per material and merges it into one mesh per material.
export function createBuilder() {
  const buckets = new Map(); // material -> [geometry]
  const loose = [];          // meshes added as-is (unique textures, animated pieces)
  const colliders = [];

  function add(geometry, material, matrix, { uvScale = null } = {}) {
    const g = geometry.clone ? geometry : geometry;
    const gg = g.index ? g.toNonIndexed() : g.clone();
    if (matrix) gg.applyMatrix4(matrix);
    if (uvScale && gg.attributes.uv) {
      const uv = gg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale[0], uv.getY(i) * uvScale[1]);
    }
    if (!buckets.has(material)) buckets.set(material, []);
    buckets.get(material).push(gg);
    return gg;
  }

  function mesh(geometry, material, matrix) {
    const m = new THREE.Mesh(geometry, material);
    if (matrix) m.applyMatrix4(matrix);
    m.castShadow = material.userData.castShadow !== false;
    m.receiveShadow = material.userData.receiveShadow !== false;
    loose.push(m);
    return m;
  }

  // Any object built elsewhere (an InstancedMesh, a sub-group) that finish() should add.
  function object(o) { loose.push(o); return o; }

  // Axis-aligned collider from a centre and size (x, z).
  function collider(x, z, w, d) {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  function finish() {
    const group = new THREE.Group();
    for (const [material, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (material.userData.worldUV) applyWorldUV(merged, material.userData.tile);
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, material);
      m.name = material.name || 'batch';
      m.castShadow = material.userData.castShadow !== false;
      m.receiveShadow = material.userData.receiveShadow !== false;
      group.add(m);
    }
    for (const m of loose) group.add(m);
    return { group, colliders };
  }

  return { add, mesh, object, collider, colliders, finish };
}

// N copies of a finished batch group as one InstancedMesh per material (the endless
// trampoline park repeats one cell four times for one draw call per material).
export function repeat(group, matrices) {
  const out = new THREE.Group();
  for (const child of group.children) {
    if (!child.isMesh) continue;
    const im = new THREE.InstancedMesh(child.geometry, child.material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.castShadow = child.castShadow;
    im.receiveShadow = child.receiveShadow;
    im.name = child.name;
    out.add(im);
  }
  return out;
}

// A wet floor for a phone: the room drawn again upside down under a glossy, slightly
// transparent floor. One extra draw call per material, no render target, and it keeps the
// fog, tone mapping and lights of the real room (three.js flips the winding for the
// negative scale). Only plain meshes are cloned; geometry and materials are shared. An
// InstancedMesh is skipped: cloned as a plain mesh it would be one stray copy at the origin.
export function mirrorY(group, floorY = 0) {
  const m = new THREE.Group();
  for (const child of group.children) {
    if (!child.isMesh || child.isInstancedMesh) continue;
    const c = new THREE.Mesh(child.geometry, child.material);
    c.matrixAutoUpdate = false;
    c.matrix.copy(child.matrix);
    c.castShadow = false;
    c.receiveShadow = false;
    c.name = 'mirror_' + child.name;
    m.add(c);
  }
  m.position.y = floorY * 2;
  m.scale.y = -1;
  return m;
}

// Free everything a scene allocated.
export function disposeScene(root) {
  const seenMat = new Set();
  const seenGeo = new Set();
  root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.geometry && !seenGeo.has(o.geometry)) { seenGeo.add(o.geometry); o.geometry.dispose(); }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seenMat.has(m)) continue;
      seenMat.add(m);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'aoMap', 'alphaMap']) {
        if (m[k] && m[k].dispose) m[k].dispose();
      }
      m.dispose();
    }
  });
}

// --- deterministic animation helpers ---------------------------------------------------
// Every flicker in the rooms is driven by these rather than Math.random, so a walk looks the
// same on every run and the tests can sim it. `stutter` hashes a time bucket (`rate` buckets
// per second) with a seed into 0..1; `cycle` is the phase 0..1 of a looping event of `period`
// seconds (the room videos loop every five seconds; the rooms stretch that to 20–40 s).
export function stutter(seed, t, rate = 24) {
  const k = (Math.floor(t * rate) + seed * 7919) | 0;
  const h = (Math.imul(k, 2654435761) ^ (k >>> 15)) >>> 0;
  return (h % 1000) / 1000;
}

export function cycle(t, period) {
  return (((t % period) + period) % period) / period;
}
