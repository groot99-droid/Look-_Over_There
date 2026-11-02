// Shared pieces of the two teal rooms (chapters C and D): the palette, the carpet, the
// leather, the plants and the light-swallowing doorway.
import * as THREE from 'three';
import * as T from '../textures.js';
import { pbr, place, box, cyl, lathe, createBuilder } from '../build.js';

export async function tealMaterials({ quality, yieldFrame, variant = 'c' }) {
  const S = quality.texSize;
  const s = Math.max(256, S / 2);
  const d = variant === 'd';
  const carpet = T.carpet(S, {
    color: d ? '#5a3f28' : '#6b4b30', shade: d ? '#2c1d12' : '#3a2718', light: d ? '#7d5d3f' : '#8f6d4a',
    seed: d ? 112 : 111, tile: 0.6, flecks: ['#cdb48c', '#17110b', '#a87d55', '#3d2a1a'],
  });
  await yieldFrame();
  const paint = T.plaster(S, { color: d ? '#1c7f82' : '#27a3a4', seed: d ? 122 : 121, tile: 2.4, relief: 0.25 });
  await yieldFrame();
  const ceiling = T.plaster(s, { color: d ? '#e8dfcc' : '#f0e8d6', seed: 123, tile: 2.6, relief: 0.15 });
  await yieldFrame();
  const leather = T.leather(S, d
    ? { color: '#c06a2c', dark: '#6a3412', seed: 132, tile: 0.7, gloss: 0.38 }
    : { color: '#ea9a42', dark: '#a8611e', seed: 131, tile: 0.6, gloss: 0.36 });
  await yieldFrame();

  return {
    carpet: pbr(carpet, { name: 'carpet', roughness: 1, env: 0.12, normalScale: 0.8, castShadow: false }),
    wall: pbr(paint, { name: 'wall', roughness: 0.92, env: 0.25, normalScale: 0.3 }),
    ceiling: pbr(ceiling, { name: 'ceiling', roughness: 1, env: 0.15, normalScale: 0.1, castShadow: false }),
    leather: pbr(leather, { name: 'leather', roughness: 0.42, env: 0.8, normalScale: 0.9, worldUV: true, tile: 0.7 }),
    leatherTurned: pbr(leather, { name: 'leather_turned', roughness: 0.45, env: 0.7, normalScale: 0.6, worldUV: false }),
    foot: pbr(null, { name: 'sofa_foot', color: '#151210', roughness: 0.5, env: 0.3 }),
    terracotta: pbr(null, { name: 'terracotta', color: '#b8683a', roughness: 0.85, env: 0.2 }),
    soil: pbr(null, { name: 'soil', color: '#2a1f14', roughness: 1, env: 0 }),
    leaf: pbr(null, { name: 'leaf', color: d ? '#3f7d3a' : '#4d8f45', roughness: 0.6, env: 0.3, side: THREE.DoubleSide, flat: true }),
    trim: pbr(null, { name: 'trim', color: '#efe7d6', roughness: 0.55, env: 0.3 }),
    void: pbr(null, { name: 'void', color: '#000000', roughness: 1, env: 0, castShadow: false }),
    // the doorway's face has its own material so the dark can lift and settle (teal.js)
    voidFace: pbr(null, { name: 'void_face', color: '#000000', roughness: 1, env: 0, castShadow: false }),
    domeLight: pbr(null, { name: 'dome_light', color: '#fff8ea', roughness: 0.6, env: 0.2, emissive: '#fff1d6', emissiveIntensity: 1.2, castShadow: false }),
  };
}

// The blocky little plant of the first teal room: a stone planter and a few pixel leaves.
export function plantSmall(B, M, x, z) {
  B.add(box(0.34, 0.3, 0.34), M.terracotta, place(x, 0.15, z));
  B.add(box(0.28, 0.02, 0.28), M.soil, place(x, 0.31, z));
  B.add(cyl(0.012, 0.02, 0.55, 5), M.soil, place(x, 0.55, z));
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.4;
    const r = 0.1 + (i % 3) * 0.08;
    B.add(box(0.2, 0.02, 0.12), M.leaf, place(x + Math.cos(a) * r, 0.62 + (i % 2) * 0.16, z + Math.sin(a) * r, -a, 0.15 * ((i % 2) ? 1 : -1)));
  }
  B.collider(x, z, 0.45, 0.45);
}

// The tall spiky plant of the mutated room: a terracotta pot and long tilted leaves. The
// leaves come back in three clusters (loose groups pivoted on the stem) so the scene can let
// them sway: three extra draw calls, not fourteen.
export function plantTall(B, M, x, z) {
  B.add(lathe([[0.16, 0], [0.19, 0.02], [0.24, 0.36], [0.26, 0.38], [0.24, 0.4], [0.21, 0.4], [0.22, 0.34], [0.15, 0.03], [0, 0.03]], 18), M.terracotta, place(x, 0, z));
  B.add(cyl(0.2, 0.2, 0.03, 18), M.soil, place(x, 0.36, z));
  B.add(cyl(0.02, 0.035, 0.9, 6), M.soil, place(x, 0.8, z));
  const PIVOT_Y = 0.9;
  const clusters = [createBuilder(), createBuilder(), createBuilder()];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    const tilt = 0.35 + (i % 4) * 0.22;
    const len = 0.55 + (i % 3) * 0.2;
    const h = 0.95 + (i % 5) * 0.09 - PIVOT_Y;
    clusters[i % 3].add(new THREE.ConeGeometry(0.045, len, 4), M.leaf,
      place(Math.cos(a) * 0.05, h, Math.sin(a) * 0.05, -a, 0, 0).multiply(place(Math.sin(tilt) * len * 0.45, Math.cos(tilt) * len * 0.45, 0, 0, 0, -tilt)));
  }
  const leaves = clusters.map((c, i) => {
    const g = c.finish().group;
    g.position.set(x, PIVOT_Y, z);
    g.userData.phase = i * 2.1;
    B.object(g);
    return g;
  });
  B.collider(x, z, 0.55, 0.55);
  return leaves;
}

// A doorway filled with nothing: a black slab flush with the wall face (its own material,
// `voidFace`, so the scene can let the dark breathe), a black box behind it, and a collider
// so the player bounces off the dark. "It just swallows it."
export function voidDoor(B, M, { x, z, w, h, depth = 0.6, facing = -1, arch = false }) {
  const zc = z + facing * -(depth / 2 + 0.02);
  B.add(box(w + 0.3, h + 0.3, depth), M.void, place(x, h / 2, zc));
  B.add(box(w - 0.02, h - 0.02, 0.01), M.voidFace || M.void, place(x, h / 2, z + facing * 0.012));
  B.collider(x, z + facing * -0.05, w + 0.1, 0.3);
}
