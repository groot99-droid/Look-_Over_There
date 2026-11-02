// The open-source prop library: assets/glb/library.glb, one file holding
// every catalog model the rooms place (tools/build_rooms.py's CATALOG),
// exported from the Higgsfield 3D scene builder's "Prop Library" project.
// Each model is a named node; props.js's `glb` builder asks for a clone by
// that name and falls back to its box builder when the file is missing or
// still loading, so a room never waits on the download to exist.
//
// Canon C1: company property is low-poly. Whatever shading the catalog
// shipped, the clone gets the same treatment as every other prop: flat
// shading, PS1 vertex snapping, the model's own flat colours and nothing
// else -- its vertex colours (the catalog models are vertex-painted:
// windows, tyres, rust, trim) and a palette texture are kept, since they
// read as flat colour; a photo texture is not.

import * as THREE from '../../vendor/three/three.module.js';
import { withVertexSnap } from '../walk/materials.js';

// Resolved against this module, not the page, so test/rooms.html finds it too.
const LIBRARY_URL = new URL('../../assets/glb/library.glb', import.meta.url).href;
const LOAD_TIMEOUT_MS = 12000;

// What a palette slot multiplied into a model turns its body paint into. A
// part built beside a catalog model to match it (props.js cardoor) takes
// catalogPaint(slot colour, that model's body paint): `paint` is an sRGB
// hex (build_rooms.py CAR_PAINT, e.g. the sedan's green), and without it
// the light grey the cruiser and the pastel car are painted.
const LIGHT_PAINT = new THREE.Color('#bdc0c4');
export function catalogPaint(tint, paint = null) {
  return (paint ? new THREE.Color(paint) : LIGHT_PAINT.clone()).multiply(tint);
}

export function createLibrary({ url = LIBRARY_URL } = {}) {
  let scene = null;
  let failed = false;
  const converted = new Map(); // source material uuid -> low-poly material

  const ready = (async () => {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) { failed = true; return false; }
      const { GLTFLoader } = await import('../../vendor/three/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await Promise.race([
        loader.loadAsync(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('library.glb: load timed out')), LOAD_TIMEOUT_MS))
      ]);
      scene = gltf.scene;
      return true;
    } catch (e) {
      console.warn('library.js: no prop library, box fallbacks only', e && e.message);
      failed = true;
      return false;
    }
  })();

  // `tint` is the room's palette colour for the prop (its `mat` slot). It
  // MULTIPLIES the model's own colour (base colour x vertex colours), so the
  // painted detail survives the recolouring: a white body takes the palette
  // colour, dark tyres and glass stay dark, rust stays rust (the garage's
  // cars under sodium, the street's taxi). A model with a palette texture
  // keeps its texture's colours unless the prop asks for `tintMapped: true`
  // (its texels are multiplied too). `colors`: the geometry carries vertex
  // colours (a material with vertexColors on a mesh without them is black).
  function lowPoly(src, tint, { tintMapped = false, colors = false } = {}) {
    const key = src.uuid + (tint ? '#' + tint.getHexString() : '') + (tintMapped ? 'm' : '') + (colors ? 'c' : '');
    if (converted.has(key)) return converted.get(key);
    const map = src.map && src.map.image && src.map.image.width <= 256 ? src.map : null; // palette textures only
    const color = src.color ? src.color.clone() : new THREE.Color('#8a8a86');
    if (tint && (!map || tintMapped)) color.multiply(tint);
    const mat = new THREE.MeshLambertMaterial({
      color,
      map,
      vertexColors: colors,
      flatShading: true,
      emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0),
      emissiveIntensity: src.emissiveIntensity !== undefined ? Math.min(1, src.emissiveIntensity) : 1,
      transparent: !!src.transparent && src.opacity < 1,
      opacity: src.opacity !== undefined ? src.opacity : 1,
      side: THREE.FrontSide
    });
    if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; }
    withVertexSnap(mat);
    mat.userData.catalog = true; // props.js palette repaints catalog surfaces
    converted.set(key, mat);
    return mat;
  }

  return {
    ready,
    loaded: () => !!scene,
    failed: () => failed,
    has(node) { return !!(scene && scene.getObjectByName(node)); },
    // A fresh clone of a named model, origin-centred on the floor, sharing
    // geometry with every other clone; `tint` is a THREE.Color multiplied
    // into its colours, `opts.tintMapped` lets it recolour a palette texture
    // too (see lowPoly). null when unavailable.
    instance(node, tint = null, { tintMapped = false } = {}) {
      if (!scene) return null;
      const src = scene.getObjectByName(node);
      if (!src) return null;
      const clone = src.clone(true);
      clone.position.set(0, 0, 0);
      clone.rotation.set(0, 0, 0);
      clone.scale.set(1, 1, 1);
      clone.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.userData.shared = true; // every clone shares it: rooms must not dispose it (room.js)
        const opts = { tintMapped, colors: !!o.geometry.attributes.color };
        o.material = Array.isArray(o.material) ? o.material.map((m) => lowPoly(m, tint, opts)) : lowPoly(o.material, tint, opts);
        o.castShadow = true;
        o.receiveShadow = true;
      });
      // Sit on the floor whatever the source's pivot was.
      const bb = new THREE.Box3().setFromObject(clone);
      if (Number.isFinite(bb.min.y)) clone.position.y = -bb.min.y;
      const wrap = new THREE.Group();
      wrap.add(clone);
      wrap.name = node;
      return wrap;
    }
  };
}
