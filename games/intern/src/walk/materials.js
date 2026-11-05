// Two-tier material library for the walkable rooms, mirroring the Blender
// pipeline's PhotorealArch_* / LowPolyProp_* split (blender/material_
// factories.py) and canon C1: the BUILDING (floors, walls, glass, water,
// fog, light) reads as real -- tiled, noisy, lit, shadowed, with a bump
// and roughness map under every surface; everything the COMPANY owns
// (chairs, desks, cars, signs, paper, people) is flat-shaded low-poly with
// PS1 vertex snapping and no texture at all.
//
// No image files: every "photoreal" surface is a procedurally drawn canvas
// (value-noise fBm + a per-slot pattern pass that also writes a height map
// and a roughness map), tiled in world units by applyWorldUV() below
// (ported from the Earth_Worldbuild museum's matlib.js) so a 30 m garage
// floor and a 3 m elevator floor share one grain. Nothing to download,
// nothing to license.
//
// Quality pass (post-launch): 256 px flat colour maps sampled with
// NearestFilter were the main reason the rooms read as "low quality" -- a
// smeared, filterless blur on every wall. The building now gets 512 px
// colour + bump + roughness at trilinear/anisotropic filtering; the PS1
// treatment is reserved for the company's props (C1), which is where the
// design puts it.

import * as THREE from '../../vendor/three/three.module.js';

// three's derivative bump mapping divides by the screen-space tangent frame:
// on a face seen edge-on (a kerb's side, a lane line's edge, fDet -> 0) the
// gradient blows up into white sparkles. Fade the bump out at grazing angles
// instead, for every material that uses one.
{
  const OLD = 'vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );\n\t\treturn normalize( abs( fDet ) * surf_norm - vGrad );';
  const NEW = 'vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );\n\t\tvec3 vB = abs( fDet ) * surf_norm - vGrad;\n\t\tfloat lB = length( vB );\n\t\tvec3 bumped = lB > 1e-6 ? vB / lB : surf_norm;\n\t\treturn normalize( mix( surf_norm, bumped, smoothstep( 0.02, 0.15, abs( fDet ) ) ) );';
  const chunk = THREE.ShaderChunk.bumpmap_pars_fragment;
  if (chunk.includes(OLD)) THREE.ShaderChunk.bumpmap_pars_fragment = chunk.replace(OLD, NEW);
  else console.warn('materials.js: bumpmap chunk changed; the grazing-angle guard is not applied');
}

const TEX_SIZE = 512;

// ---- tiny deterministic noise ------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(size, cells, rnd) {
  // Tileable value noise: a cells x cells lattice of random values,
  // bilinearly interpolated with a smoothstep, wrapping at the edges.
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy), y1 = (y0 + 1) % cells, ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx), x1 = (x0 + 1) % cells, tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const a = lat[y0 * cells + x0], b = lat[y0 * cells + x1];
      const c = lat[y1 * cells + x0], d = lat[y1 * cells + x1];
      out[y * size + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return out;
}

function fbm(size, seed, octaves = 5, base = 4) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, base * Math.pow(2, o), rnd);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) { return a + (b - a) * t; }
function clamp01(v) { return Math.min(1, Math.max(0, v)); }

// Slot recipes: base/alt colours, noise contrast, a pattern pass,
// roughness, bump strength (metres-ish, tiny), roughness variation.
const RECIPES = {
  marble:        { a: '#26241f', b: '#5a564c', seed: 11, contrast: 0.9, pattern: 'veins', rough: 0.22, metal: 0.05, bump: 0.004, roughVar: 0.5 },
  marble_light:  { a: '#9a958a', b: '#dcd7cb', seed: 12, contrast: 0.8, pattern: 'veins', rough: 0.28, bump: 0.004, roughVar: 0.4 },
  plaster:       { a: '#87847a', b: '#a9a599', seed: 21, contrast: 0.45, pattern: 'plaster', rough: 0.92, bump: 0.01, roughVar: 0.3 },
  plaster_blown: { a: '#d6d3ca', b: '#f1efe9', seed: 22, contrast: 0.3, pattern: 'plaster', rough: 0.95, bump: 0.006, roughVar: 0.2 },
  plaster_dark:  { a: '#46433e', b: '#5e5a53', seed: 23, contrast: 0.5, pattern: 'plaster', rough: 0.92, bump: 0.01, roughVar: 0.3 },
  concrete:      { a: '#5a5852', b: '#7b7872', seed: 31, contrast: 0.55, pattern: 'concrete', rough: 0.86, bump: 0.02, roughVar: 0.5, base: 8 },
  concrete_wet:  { a: '#36352f', b: '#585651', seed: 32, contrast: 0.9, pattern: 'stains', rough: 0.3, metal: 0.05, bump: 0.012, roughVar: 1.2 },
  garage_floor:  { a: '#413f3a', b: '#615e58', seed: 33, contrast: 0.85, pattern: 'parking', rough: 0.45, bump: 0.012, roughVar: 1.0 },
  paint_green:   { a: '#2f4a3c', b: '#3f5e4d', seed: 34, contrast: 0.5, pattern: 'concrete', rough: 0.6, bump: 0.012, roughVar: 0.5 },
  carpet:        { a: '#3a3b42', b: '#4e4f58', seed: 41, contrast: 0.6, pattern: 'weave', rough: 1.0, bump: 0.006, roughVar: 0.1 },
  carpet_red:    { a: '#471d1d', b: '#622c2c', seed: 42, contrast: 0.6, pattern: 'weave', rough: 1.0, bump: 0.006, roughVar: 0.1 },
  cinderblock:   { a: '#6a6864', b: '#8a877f', seed: 51, contrast: 0.6, pattern: 'blocks', rough: 0.9, bump: 0.03, roughVar: 0.3 },
  linoleum:      { a: '#b3ae9e', b: '#d4cfc1', seed: 61, contrast: 0.5, pattern: 'tiles', rough: 0.32, bump: 0.006, roughVar: 0.7 },
  ceiling_tile:  { a: '#c4c1b8', b: '#e0ddd5', seed: 71, contrast: 0.35, pattern: 'ceiling', rough: 0.95, bump: 0.015, roughVar: 0.2 },
  pool_tile:     { a: '#7d8f8e', b: '#b5c3c0', seed: 81, contrast: 0.6, pattern: 'tiles_small', rough: 0.18, bump: 0.02, roughVar: 0.4 },
  water:         { a: '#06232b', b: '#0e4a56', seed: 91, contrast: 0.9, pattern: 'caustic', rough: 0.04, metal: 0.15, opacity: 0.9, bump: 0.02, roughVar: 0.2, animate: true },
  cardboard:     { a: '#8a6a44', b: '#a68355', seed: 101, contrast: 0.5, pattern: 'cardboard', rough: 0.95, bump: 0.006, roughVar: 0.2 },
  rust:          { a: '#46291a', b: '#7c4c2b', seed: 111, contrast: 1.0, pattern: 'stains', rough: 0.8, metal: 0.3, bump: 0.02, roughVar: 0.8 },
  grate:         { a: '#2a2927', b: '#57544f', seed: 121, contrast: 0.9, pattern: 'grate', rough: 0.6, metal: 0.6, bump: 0.04, roughVar: 0.3 },
  void:          { a: '#050505', b: '#0a0a0a', seed: 131, contrast: 0.2, pattern: 'none', rough: 1.0, bump: 0 },
  asphalt:       { a: '#2a2928', b: '#3f3e3c', seed: 141, contrast: 0.8, pattern: 'concrete', rough: 0.9, bump: 0.015, roughVar: 0.4 },
  glass:         { a: '#9fb2b8', b: '#c8d6da', seed: 151, contrast: 0.1, pattern: 'none', rough: 0.05, metal: 0.2, opacity: 0.22, bump: 0 },
  glass_dark:    { a: '#1a2224', b: '#25302f', seed: 152, contrast: 0.1, pattern: 'none', rough: 0.05, metal: 0.4, opacity: 0.55, bump: 0 },
  // the street's brick and the apartment desk's wood: the building's, photoreal (C1)
  brick:         { a: '#5a3428', b: '#8a5a44', seed: 161, contrast: 0.75, pattern: 'blocks', rough: 0.9, bump: 0.025, roughVar: 0.4 },
  wood:          { a: '#3e2a1c', b: '#6a4a32', seed: 171, contrast: 0.35, pattern: 'grain', rough: 0.55, bump: 0.004, roughVar: 0.35 }
};

// ---- followup: s7 -- begin ----
// S7 C's cab (Doc 2 S7_C: "quilted steel wall padding, corroded diamond
// plate floor"), the building's, photoreal (C1). Their patterns are drawn by
// S7_PATTERNS below, dispatched from drawPattern's switch.
RECIPES.diamond_plate = { a: '#36332e', b: '#5f5a52', seed: 181, contrast: 0.85, pattern: 'diamond_plate', rough: 0.5, metal: 0.55, bump: 0.035, roughVar: 0.9 };
RECIPES.quilted_steel = { a: '#45443f', b: '#76746c', seed: 191, contrast: 0.55, pattern: 'quilted_steel', rough: 0.42, metal: 0.65, bump: 0.03, roughVar: 0.7 };
// the shaft the cab goes down: block gone dark with a century of grease
RECIPES.shaft_block = { a: '#2e2c29', b: '#47443e', seed: 201, contrast: 0.8, pattern: 'blocks', rough: 0.9, bump: 0.03, roughVar: 0.5 };
const S7_PATTERNS = {
  // tread lugs in alternating diagonals, their tops worn bright and glossy,
  // grime and rust bloom in the field between them, pitting everywhere
  diamond_plate(c, h, r, size, rnd) {
    const n = 24, cell = size / n;
    const blob = (ctx, x, y, rx, ry, color) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    };
    for (let i = 0; i < 7; i++) blob(c, rnd() * size, rnd() * size, 50 + rnd() * 110, 40 + rnd() * 90, `rgba(${80 + rnd() * 30},${42 + rnd() * 14},20,${0.16 + rnd() * 0.16})`); // rust bloom
    for (let i = 0; i < 6; i++) blob(c, rnd() * size, rnd() * size, 40 + rnd() * 80, 30 + rnd() * 70, 'rgba(0,0,0,0.35)'); // grease
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * cell, y = (j + 0.5) * cell, a = (i + j) % 2 ? Math.PI / 4 : -Math.PI / 4;
      const worn = rnd();
      for (const [ctx, fill] of [[h, 'rgba(255,255,255,0.95)'], [c, `rgba(${150 + worn * 60},${140 + worn * 55},${125 + worn * 50},${0.25 + worn * 0.3})`], [r, `rgba(0,0,0,${0.35 + worn * 0.35})`]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = fill;
        ctx.beginPath(); ctx.ellipse(0, 0, cell * 0.36, cell * 0.11, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      // the lug's shadowed flank
      c.save(); c.translate(x, y + 1.5); c.rotate(a); c.fillStyle = 'rgba(0,0,0,0.22)';
      c.beginPath(); c.ellipse(0, 0, cell * 0.36, cell * 0.08, 0, 0, Math.PI); c.fill(); c.restore();
    }
    for (let i = 0; i < 1400; i++) { const x = rnd() * size, y = rnd() * size; c.fillStyle = 'rgba(30,14,6,0.4)'; c.fillRect(x, y, 1.5, 1.5); h.fillStyle = 'rgba(0,0,0,0.4)'; h.fillRect(x, y, 1.5, 1.5); } // pitting
  },
  // brushed sheet steel embossed in a diamond quilt: each cell pillowed up,
  // the stitched seams pressed in and dark with grime, a dent or two
  quilted_steel(c, h, r, size, rnd) {
    for (let y = 0; y < size; y += 2) { c.fillStyle = `rgba(255,255,255,${0.015 + rnd() * 0.03})`; c.fillRect(0, y, size, 1); } // brushing
    const n = 4, cell = size / n;
    const hi = h.getImageData(0, 0, size, size), ci = c.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = ((x + y) / cell) % 1, v = (((x - y) / cell) % 1 + 1) % 1;
      const d = Math.min(u, 1 - u, v, 1 - v) * 2; // 0 on a seam, 1 at a cell's centre
      const pillow = Math.sqrt(Math.min(1, d * 1.6));
      const k = (y * size + x) * 4;
      const hv = hi.data[k] * 0.35 + 255 * 0.65 * pillow;
      hi.data[k] = hi.data[k + 1] = hi.data[k + 2] = hv;
      const shade = 0.72 + 0.28 * pillow;
      ci.data[k] *= shade; ci.data[k + 1] *= shade; ci.data[k + 2] *= shade;
    }
    h.putImageData(hi, 0, 0); c.putImageData(ci, 0, 0);
    // stitch dots along the seams
    c.fillStyle = 'rgba(0,0,0,0.45)'; h.fillStyle = 'rgba(0,0,0,0.8)';
    for (let s = -size; s < 2 * size; s += cell) {
      for (let t = 0; t < size; t += 9) {
        c.fillRect(s + t - 1, t - 1, 2, 2); h.fillRect(s + t - 1, t - 1, 2, 2);
        c.fillRect(s - t - 1 + size, t - 1, 2, 2); h.fillRect(s - t - 1 + size, t - 1, 2, 2);
      }
    }
    for (let i = 0; i < 5; i++) { // grime run down from the seams, glossy where wet
      const x = rnd() * size, y = rnd() * size;
      c.fillStyle = 'rgba(20,12,6,0.25)'; c.fillRect(x, y, 2 + rnd() * 3, 30 + rnd() * 90);
      r.fillStyle = 'rgba(0,0,0,0.4)'; r.fillRect(x - 2, y, 6, 40 + rnd() * 90);
    }
    for (let i = 0; i < 2; i++) { // a dent
      const x = rnd() * size, y = rnd() * size, rr = 14 + rnd() * 18;
      const g = h.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      h.fillStyle = g; h.beginPath(); h.arc(x, y, rr, 0, Math.PI * 2); h.fill();
    }
  }
};
// ---- followup: s7 -- end ----

// ---- followup: look -- begin ----
// Slots the polish passes asked for (all the building's, photoreal, C1):
//   glass_clear    a pane you see through (S3 H's front doors onto the dead
//                  street): 7 % tint, glossy, but with no specular lobe -- a
//                  ceiling lamp's highlight on it read as a lamp lit in the
//                  street beyond (the S3 review). door(..., glass='glass_clear').
//   velvet         the S3 curtain's deep red velvet, a MeshPhysicalMaterial
//                  with sheen and a vertical pile (`physical` below), hung
//                  both sides (`double`). doors.js gives a kind 'curtain'
//                  doorway in it smooth pleated halves.
//   cardboard_wet  the soaked-cardboard blotch S8 C's package used to borrow
//                  from 'wood' (dark, glossy where wet), now that 'wood' has
//                  a grain.
// Extra recipe keys read by createMaterialLibrary().get(): `physical`
// {sheen, sheenRoughness, sheenColor, specularIntensity} builds a
// MeshPhysicalMaterial with those set, and `double` renders both faces.
Object.assign(RECIPES, {
  glass_clear:   { a: '#c4d2d6', b: '#cfdbde', seed: 153, contrast: 0.05, pattern: 'none', rough: 0.04, opacity: 0.07, bump: 0,
                   physical: { specularIntensity: 0 } },
  velvet:        { a: '#560a15', b: '#6c1221', seed: 181, contrast: 0.45, pattern: 'pile', rough: 0.88, bump: 0, roughVar: 0.1, double: true,
                   physical: { sheen: 0.75, sheenRoughness: 0.5, sheenColor: '#b8344c' } },
  cardboard_wet: { a: '#3e2a1c', b: '#6a4a32', seed: 171, contrast: 0.7, pattern: 'stains', rough: 0.55, bump: 0.006, roughVar: 0.5 }
});

// Pattern passes for these slots (drawPattern hands over anything it does
// not draw itself).
function drawPatternLook(c, h, r, size, pattern, rnd) {
  switch (pattern) {
    case 'grain': {
      // flat-sawn wood: long sinuous grain lines along u (world x on a desk
      // top, horizontal on its sides), darker late-wood bands, fine pores,
      // one knot the lines bend round. Every wave is a whole number of
      // periods across the tile, so it repeats without a seam.
      const TAU = Math.PI * 2;
      const knot = { x: size * (0.25 + rnd() * 0.5), y: size * (0.3 + rnd() * 0.4), r: size * 0.035 };
      const lines = 46;
      for (let k = 0; k < lines; k++) {
        const y0 = (k + rnd() * 0.6) * size / lines;
        const a1 = 2 + rnd() * 5, f1 = 1 + Math.floor(rnd() * 2), p1 = rnd() * TAU;
        const a2 = 0.6 + rnd() * 1.6, f2 = 3 + Math.floor(rnd() * 4), p2 = rnd() * TAU;
        const late = rnd() < 0.35;
        const alpha = late ? 0.22 + rnd() * 0.18 : 0.06 + rnd() * 0.1;
        const width = late ? 1.6 + rnd() * 2.4 : 0.6 + rnd() * 1.0;
        for (const wrap of [-size, 0, size]) {
          c.beginPath(); h.beginPath();
          for (let x = 0; x <= size; x += 4) {
            let y = y0 + wrap + a1 * Math.sin(x / size * TAU * f1 + p1) + a2 * Math.sin(x / size * TAU * f2 + p2);
            const dx = x - knot.x, dy = y - knot.y, d = Math.hypot(dx, dy * 2.2);
            if (d < knot.r * 6) y += Math.sign(dy || 1) * knot.r * 2.2 * Math.pow(1 - d / (knot.r * 6), 2); // round the knot
            if (x === 0) { c.moveTo(x, y); h.moveTo(x, y); } else { c.lineTo(x, y); h.lineTo(x, y); }
          }
          c.strokeStyle = `rgba(28,14,6,${alpha})`; c.lineWidth = width; c.stroke();
          h.strokeStyle = `rgba(0,0,0,${alpha * 0.8})`; h.lineWidth = width; h.stroke();
        }
      }
      // the knot itself: dark rings, a little raised and glossier
      for (let i = 5; i >= 1; i--) {
        c.strokeStyle = `rgba(30,14,5,${0.12 + 0.06 * (5 - i)})`; c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(knot.x, knot.y, knot.r * i * 0.5, knot.r * i * 0.22, 0, 0, TAU); c.stroke();
      }
      c.fillStyle = 'rgba(25,12,4,0.55)'; c.beginPath(); c.ellipse(knot.x, knot.y, knot.r * 0.45, knot.r * 0.2, 0, 0, TAU); c.fill();
      r.fillStyle = 'rgba(0,0,0,0.25)'; r.beginPath(); r.ellipse(knot.x, knot.y, knot.r * 1.6, knot.r * 0.8, 0, 0, TAU); r.fill();
      // pores: short dark dashes along the grain
      for (let i = 0; i < 1400; i++) {
        c.fillStyle = `rgba(20,10,4,${0.08 + rnd() * 0.12})`;
        c.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 6, 1);
      }
      // a few broad colour streaks along the grain (heartwood / sapwood)
      for (let i = 0; i < 5; i++) {
        const y = rnd() * size, hh = 8 + rnd() * 30;
        c.fillStyle = rnd() > 0.5 ? `rgba(255,220,170,${0.03 + rnd() * 0.04})` : `rgba(20,8,2,${0.05 + rnd() * 0.06})`;
        c.fillRect(0, y, size, hh);
        if (y + hh > size) c.fillRect(0, y - size, size, hh);
      }
      // wear where hands rest: a faint glossier band
      for (let i = 0; i < 3; i++) blobLook(r, rnd() * size, rnd() * size, 60 + rnd() * 90, 20 + rnd() * 30, 0, 'rgba(0,0,0,0.18)');
      break;
    }
    case 'pile': {
      // velvet pile: every column of the nap catches the light a little
      // differently (dark and pale streaks running the length of the drop)
      for (let x = 0; x < size; x++) {
        const v = rnd();
        c.fillStyle = v < 0.5 ? `rgba(20,0,6,${(0.5 - v) * 0.26})` : `rgba(255,140,150,${(v - 0.5) * 0.06})`;
        c.fillRect(x, 0, 1, size);
        r.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},0.06)`;
        r.fillRect(x, 0, 1, size);
      }
      break;
    }
    default: break;
  }
}
function blobLook(ctx, x, y, rx, ry, rot, color) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx, ry);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
// ---- followup: look -- end ----

// Pattern pass. `c` draws colour, `h` draws height (white = raised,
// black = recessed; grout, seams, cracks go dark), `r` draws roughness
// (white = rough, black = glossy; wet and worn spots go dark).
function drawPattern(c, h, r, size, pattern, rnd) {
  // per-tile / per-block value variation: grey only, never a hue shift
  const greyTint = (alpha) => () => { const v = rnd() > 0.5 ? 255 : 0; return `rgba(${v},${v},${v},${alpha})`; };
  const polyline = (ctx, n, step) => {
    let x = rnd() * size, y = rnd() * size;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < n; k++) { x += (rnd() - 0.5) * step; y += (rnd() - 0.5) * step; ctx.lineTo(x, y); }
    ctx.stroke();
  };
  const blob = (ctx, x, y, rx, ry, rot, color) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx, ry);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  };
  const grid = (n, grout, groutColor, heightColor, tileTint) => {
    const cell = size / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (tileTint) { c.fillStyle = tileTint(); c.fillRect(i * cell, j * cell, cell, cell); }
    }
    c.fillStyle = groutColor; h.fillStyle = heightColor;
    for (let i = 0; i <= n; i++) {
      c.fillRect(0, i * cell - grout / 2, size, grout); c.fillRect(i * cell - grout / 2, 0, grout, size);
      h.fillRect(0, i * cell - grout / 2, size, grout); h.fillRect(i * cell - grout / 2, 0, grout, size);
    }
  };
  switch (pattern) {
    case 'veins': {
      for (let i = 0; i < 18; i++) {
        const light = rnd() > 0.4;
        c.strokeStyle = light ? `rgba(255,255,255,${0.05 + rnd() * 0.12})` : `rgba(0,0,0,${0.1 + rnd() * 0.2})`;
        c.lineWidth = 0.6 + rnd() * 2.2;
        h.strokeStyle = 'rgba(0,0,0,0.12)'; h.lineWidth = c.lineWidth;
        let x = rnd() * size, y = rnd() * size;
        c.beginPath(); c.moveTo(x, y); h.beginPath(); h.moveTo(x, y);
        for (let k = 0; k < 10; k++) {
          const cx = x + (rnd() - 0.5) * 90, cy = y + (rnd() - 0.5) * 90;
          x += (rnd() - 0.5) * 120; y += (rnd() - 0.5) * 120;
          c.quadraticCurveTo(cx, cy, x, y); h.quadraticCurveTo(cx, cy, x, y);
        }
        c.stroke(); h.stroke();
      }
      for (let i = 0; i < 6; i++) blob(r, rnd() * size, rnd() * size, 30 + rnd() * 80, 30 + rnd() * 80, rnd() * 3, 'rgba(0,0,0,0.25)');
      break;
    }
    case 'concrete': {
      // formwork seams (one per tile, top edge), aggregate speckle, a
      // couple of hairline cracks, soft water stains
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)';
        const s = rnd() > 0.85 ? 2 : 1;
        c.fillRect(rnd() * size, rnd() * size, s, s);
      }
      for (let i = 0; i < 40; i++) { const x = rnd() * size, y = rnd() * size; blob(c, x, y, 3 + rnd() * 5, 3 + rnd() * 5, 0, 'rgba(0,0,0,0.35)'); blob(h, x, y, 3 + rnd() * 5, 3 + rnd() * 5, 0, 'rgba(0,0,0,0.5)'); }
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(0, 0, size, 3); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, 3, size, 2);
      h.fillStyle = 'rgba(0,0,0,0.6)'; h.fillRect(0, 0, size, 4);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; h.strokeStyle = 'rgba(0,0,0,0.5)'; h.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const n = 8 + Math.floor(rnd() * 6); const x0 = rnd() * size, y0 = rnd() * size; let x = x0, y = y0; c.beginPath(); h.beginPath(); c.moveTo(x, y); h.moveTo(x, y); for (let k = 0; k < n; k++) { x += (rnd() - 0.5) * 40; y += rnd() * 30; c.lineTo(x, y); h.lineTo(x, y); } c.stroke(); h.stroke(); }
      for (let i = 0; i < 5; i++) blob(c, rnd() * size, rnd() * size, 40 + rnd() * 90, 20 + rnd() * 60, rnd() * 3, 'rgba(20,15,10,0.18)');
      for (let i = 0; i < 5; i++) blob(r, rnd() * size, rnd() * size, 40 + rnd() * 90, 30 + rnd() * 60, rnd() * 3, 'rgba(0,0,0,0.3)');
      break;
    }
    case 'plaster': {
      // a wall: faint roller streaks, a few scuffs low on the tile, one seam
      for (let i = 0; i < 24; i++) {
        c.strokeStyle = `rgba(0,0,0,${0.02 + rnd() * 0.05})`; c.lineWidth = 6 + rnd() * 20;
        const x = rnd() * size; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (rnd() - 0.5) * 20, size); c.stroke();
      }
      for (let i = 0; i < 6; i++) blob(c, rnd() * size, size * (0.6 + rnd() * 0.4), 20 + rnd() * 60, 8 + rnd() * 20, rnd() * 0.6 - 0.3, 'rgba(30,25,20,0.16)');
      for (let i = 0; i < 4; i++) blob(r, rnd() * size, rnd() * size, 60 + rnd() * 100, 60 + rnd() * 100, 0, 'rgba(0,0,0,0.12)');
      break;
    }
    case 'stains': {
      for (let i = 0; i < 12; i++) {
        const x = rnd() * size, y = rnd() * size, rx = 15 + rnd() * 70, ry = rx * (0.4 + rnd() * 0.8), rot = rnd() * Math.PI;
        blob(c, x, y, rx, ry, rot, `rgba(0,0,0,${0.25 + rnd() * 0.35})`);
        blob(r, x, y, rx * 1.1, ry * 1.1, rot, 'rgba(0,0,0,0.7)'); // wet = glossy
      }
      for (let i = 0; i < 8; i++) { // drips
        c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1 + rnd() * 2;
        const x = rnd() * size, y = rnd() * size; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 6, y + 30 + rnd() * 120); c.stroke();
      }
      for (let i = 0; i < 1200; i++) { c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; c.fillRect(rnd() * size, rnd() * size, 1, 1); }
      break;
    }
    case 'parking': {
      // one bay per tile: a worn white line down the left edge, an oil
      // stain, tyre scuffs, expansion joint across the top
      for (let i = 0; i < 2000; i++) { c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.14)'; c.fillRect(rnd() * size, rnd() * size, 1, 1); }
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, size, 3); h.fillStyle = 'rgba(0,0,0,0.8)'; h.fillRect(0, 0, size, 4);
      for (let y = 0; y < size; y += 6) { c.fillStyle = `rgba(232,228,214,${0.45 + rnd() * 0.35})`; c.fillRect(0, y, 9 + rnd() * 2, 6); }
      r.fillStyle = 'rgba(0,0,0,0.3)'; r.fillRect(0, 0, 11, size);
      const ox = size * (0.45 + rnd() * 0.2), oy = size * (0.4 + rnd() * 0.2);
      blob(c, ox, oy, 40 + rnd() * 30, 26 + rnd() * 20, 0.4, 'rgba(10,8,5,0.6)');
      blob(r, ox, oy, 50 + rnd() * 30, 34 + rnd() * 20, 0.4, 'rgba(0,0,0,0.85)');
      for (let i = 0; i < 4; i++) { c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 6 + rnd() * 6; c.beginPath(); c.arc(rnd() * size, rnd() * size, 120 + rnd() * 200, rnd() * 6, rnd() * 6); c.stroke(); }
      for (let i = 0; i < 6; i++) blob(c, rnd() * size, rnd() * size, 30 + rnd() * 60, 20 + rnd() * 40, rnd() * 3, 'rgba(0,0,0,0.2)');
      break;
    }
    case 'weave': {
      for (let y = 0; y < size; y += 3) { c.fillStyle = `rgba(0,0,0,${0.08 + rnd() * 0.06})`; c.fillRect(0, y, size, 1); }
      for (let x = 0; x < size; x += 3) { c.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.04})`; c.fillRect(x, 0, 1, size); }
      for (let i = 0; i < 6; i++) blob(c, rnd() * size, rnd() * size, 40 + rnd() * 90, 40 + rnd() * 90, 0, 'rgba(0,0,0,0.12)');
      for (let i = 0; i < 3; i++) blob(c, rnd() * size, rnd() * size, 30 + rnd() * 40, 10 + rnd() * 20, rnd() * 3, 'rgba(0,0,0,0.18)'); // worn track
      break;
    }
    case 'blocks': {
      const bh = size / 4, bw = size / 2, mortar = 4;
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let col = -1; col < 3; col++) {
          c.fillStyle = greyTint(0.05)();
          c.fillRect(col * bw + off, row * bh, bw, bh);
          for (let k = 0; k < 60; k++) { c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(col * bw + off + rnd() * bw, row * bh + rnd() * bh, 1, 1); }
        }
        c.fillStyle = 'rgba(30,28,25,0.55)'; h.fillStyle = 'rgba(0,0,0,0.85)';
        c.fillRect(0, row * bh - mortar / 2, size, mortar); h.fillRect(0, row * bh - mortar / 2, size, mortar);
        for (let col = -1; col < 3; col++) { c.fillRect(col * bw + off - mortar / 2, row * bh, mortar, bh); h.fillRect(col * bw + off - mortar / 2, row * bh, mortar, bh); }
      }
      break;
    }
    case 'tiles': {
      grid(2, 3, 'rgba(20,18,15,0.55)', 'rgba(0,0,0,0.8)', greyTint(0.04));
      for (let i = 0; i < 10; i++) { c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1 + rnd() * 2; c.beginPath(); c.arc(rnd() * size, rnd() * size, 20 + rnd() * 60, rnd() * 6, rnd() * 6); c.stroke(); } // scuffs
      for (let i = 0; i < 4; i++) blob(r, rnd() * size, rnd() * size, 40 + rnd() * 60, 40 + rnd() * 60, 0, 'rgba(0,0,0,0.35)');
      break;
    }
    case 'ceiling': {
      grid(2, 5, 'rgba(70,68,62,0.7)', 'rgba(0,0,0,0.9)', greyTint(0.03));
      for (let i = 0; i < 1800; i++) { c.fillStyle = 'rgba(0,0,0,0.18)'; const x = rnd() * size, y = rnd() * size; c.fillRect(x, y, 2, 2); h.fillStyle = 'rgba(0,0,0,0.3)'; h.fillRect(x, y, 2, 2); } // pinholes
      blob(c, rnd() * size, rnd() * size, 60 + rnd() * 60, 50 + rnd() * 50, 0, 'rgba(120,90,40,0.2)'); // one water stain
      break;
    }
    case 'tiles_small': {
      grid(8, 2, 'rgba(25,30,32,0.6)', 'rgba(0,0,0,0.85)', greyTint(0.06));
      for (let i = 0; i < 5; i++) blob(c, rnd() * size, rnd() * size, 30 + rnd() * 60, 30 + rnd() * 60, 0, 'rgba(60,90,80,0.2)'); // algae
      break;
    }
    case 'grate': {
      c.fillStyle = 'rgba(0,0,0,0.75)'; h.fillStyle = 'rgba(0,0,0,0.95)';
      const n = 12;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if ((x + y) % 2 === 0) { c.fillRect((x * size) / n + 3, (y * size) / n + 3, size / n - 6, size / n - 6); h.fillRect((x * size) / n + 3, (y * size) / n + 3, size / n - 6, size / n - 6); }
      }
      for (let i = 0; i < 6; i++) blob(c, rnd() * size, rnd() * size, 20 + rnd() * 40, 20 + rnd() * 40, 0, 'rgba(120,60,20,0.35)'); // rust bloom
      break;
    }
    case 'caustic': {
      for (let i = 0; i < 40; i++) {
        c.strokeStyle = `rgba(160,220,235,${0.08 + rnd() * 0.14})`; c.lineWidth = 1.5 + rnd() * 2.5;
        h.strokeStyle = 'rgba(255,255,255,0.35)'; h.lineWidth = c.lineWidth;
        const cx = rnd() * size, cy = rnd() * size, rr = 12 + rnd() * 40, a0 = rnd() * 6, a1 = a0 + 1 + rnd() * 3;
        c.beginPath(); c.arc(cx, cy, rr, a0, a1); c.stroke(); h.beginPath(); h.arc(cx, cy, rr, a0, a1); h.stroke();
      }
      for (let i = 0; i < 8; i++) blob(c, rnd() * size, rnd() * size, 40 + rnd() * 80, 20 + rnd() * 40, rnd() * 3, 'rgba(0,0,0,0.25)');
      break;
    }
    case 'cardboard': {
      for (let y = 0; y < size; y += 4) { c.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; c.fillRect(0, y, size, 1); }
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, size / 2 - 2, size, 4); h.fillStyle = 'rgba(0,0,0,0.6)'; h.fillRect(0, size / 2 - 2, size, 4);
      break;
    }
    // ---- followup: s7 -- begin ----
    case 'diamond_plate': case 'quilted_steel': S7_PATTERNS[pattern](c, h, r, size, rnd); break;
    // ---- followup: s7 -- end ----
    default: drawPatternLook(c, h, r, size, pattern, rnd); break;
  }
}

// Colour + height + roughness canvases for a slot.
export function makeCanvasTextures(slot) {
  const recipe = RECIPES[slot] || RECIPES.plaster;
  const size = TEX_SIZE;
  const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = size; return cv; };
  const colorCv = mk(), heightCv = mk(), roughCv = mk();
  const c = colorCv.getContext('2d'), h = heightCv.getContext('2d'), r = roughCv.getContext('2d');
  const img = c.createImageData(size, size), himg = h.createImageData(size, size), rimg = r.createImageData(size, size);
  const noise = fbm(size, recipe.seed, 5, recipe.base || 4);
  const fine = fbm(size, recipe.seed + 101, 3, 32);
  const A = hexToRgb(recipe.a), B = hexToRgb(recipe.b);
  const roughVar = recipe.roughVar || 0;
  for (let i = 0; i < size * size; i++) {
    const t = clamp01(0.5 + (noise[i] - 0.5) * recipe.contrast * 2);
    img.data[i * 4] = mix(A[0], B[0], t);
    img.data[i * 4 + 1] = mix(A[1], B[1], t);
    img.data[i * 4 + 2] = mix(A[2], B[2], t);
    img.data[i * 4 + 3] = 255;
    const hv = Math.round(255 * clamp01(0.5 + (noise[i] - 0.5) * 0.9 + (fine[i] - 0.5) * 0.5));
    himg.data[i * 4] = himg.data[i * 4 + 1] = himg.data[i * 4 + 2] = hv; himg.data[i * 4 + 3] = 255;
    const rv = Math.round(255 * clamp01(1 - (noise[i] - 0.5) * roughVar - (fine[i] - 0.5) * roughVar * 0.4));
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = rv; rimg.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0); h.putImageData(himg, 0, 0); r.putImageData(rimg, 0, 0);
  drawPattern(c, h, r, size, recipe.pattern, mulberry32(recipe.seed * 7 + 3));
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = ANISO.value;
    return t;
  };
  return { map: tex(colorCv, true), bumpMap: tex(heightCv, false), roughnessMap: tex(roughCv, false) };
}

// Back-compat single-texture entry point (tests, blender mirrors).
export function makeCanvasTexture(slot) { return makeCanvasTextures(slot).map; }

// World-space planar UVs so tiling is continuous across every box in a
// room (ported from the museum's matlib.applyWorldUV). tile = metres per
// texture repeat.
export function applyWorldUV(geometry, tile = 1, offset = [0, 0, 0]) {
  const pos = geometry.attributes.position;
  let nor = geometry.attributes.normal;
  if (!nor) { geometry.computeVertexNormals(); nor = geometry.attributes.normal; }
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i) + offset[0], y = pos.getY(i) + offset[1], z = pos.getZ(i) + offset[2];
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[2 * i] = u / tile;
    uv[2 * i + 1] = v / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// PS1 vertex snapping: quantise clip-space positions to a coarse grid so
// low-poly props wobble as the camera moves (blender/material_factories.py's
// apply_vertex_snap, in shader form). Applied only to company-owned
// materials; the building never wobbles (C1).
const SNAP = { value: 160.0 };
const ANISO = { value: 1 };
export function setSnapResolution(px) { SNAP.value = px; }
export function setAnisotropy(n) { ANISO.value = Math.max(1, n | 0); }
export function withVertexSnap(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = SNAP;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSnap;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 p = gl_Position;
          vec2 grid = vec2(uSnap, uSnap * 0.5625);
          p.xy = floor(p.xy / p.w * grid) / grid * p.w;
          gl_Position = p;
        }`);
  };
  material.customProgramCacheKey = () => 'snap';
  return material;
}

// Low-poly prop palette (LowPolyProp_*): flat, un-textured, band-lit.
const LOWPOLY = {
  lp_red:    { color: '#7a2634' },
  lp_wood:   { color: '#8c6a3f' },
  lp_grey:   { color: '#8a8a86' },
  lp_dark:   { color: '#2b2b2b' },
  lp_black:  { color: '#101010' },
  lp_beige:  { color: '#b9ad93' },
  lp_paper:  { color: '#e8e2d0' },
  lp_skin:   { color: '#c9a887' },
  lp_suit:   { color: '#3a3a44' },
  lp_rust:   { color: '#6b3f26' },
  lp_car:    { color: '#5a3f2e' },
  lp_car2:   { color: '#3f4a52' },
  lp_car3:   { color: '#6a5a2a' },
  lp_car4:   { color: '#2e2e30' },
  lp_car5:   { color: '#5a2a26' },
  lp_car6:   { color: '#7a7566' },
  lp_blue:   { color: '#2e4a6b' },
  lp_curtain:{ color: '#6a1420' },
  lp_brass:  { color: '#a8863c' },
  lp_chrome: { color: '#9a9a96' },
  lp_glass:  { color: '#8fb0b8', opacity: 0.35 },
  lp_sign:   { color: '#1e7a3a', emissive: '#22ff66', emissiveIntensity: 1.2 },
  lp_screen: { color: '#0a0a0a', emissive: '#7ad9a0', emissiveIntensity: 0.9 },
  lp_screen_off: { color: '#0a0a0a', emissive: '#111111', emissiveIntensity: 0.2 },
  lp_fluoro: { color: '#e8e8e0', emissive: '#f4f2e8', emissiveIntensity: 1.6 },
  lp_sodium: { color: '#e0a040', emissive: '#ffb04a', emissiveIntensity: 1.8 },
  lp_taillight: { color: '#6a1a10', emissive: '#ff5a2a', emissiveIntensity: 0.6 },
  lp_headlight: { color: '#d8d0b0', emissive: '#fff4d0', emissiveIntensity: 0.3 },
  lp_white:  { color: '#e6e6e0' }
};

// Additive, depth-less glow sprites for light fixtures (the building's
// light, C1 -- so these are not vertex-snapped).
const GLOWS = {
  glow_sodium: { color: '#ff9a3a', opacity: 0.35 },
  glow_fluoro: { color: '#e8f0ff', opacity: 0.22 },
  glow_water:  { color: '#3ab8d0', opacity: 0.35 },
  glow_green:  { color: '#33ff77', opacity: 0.3 }
};

// ---- followup: s4 -- begin ----
// S4 THE FLOOR's own slots (Doc 2 S4_C / S4_H).
//   cinderblock_beige  the corridor's walls: "cinderblock walls in
//                      institutional beige" -- the building's, photoreal
//   lp_fluoro_green,   the cubicle floor's troffers: "the real quality of
//   glow_fluoro_green  fluorescent light including its slight green cast"
//                      (glow_fluoro leans blue)
//   lp_cubicle         "every cubicle partition, desk, chair and monitor,
//                      identical, blocky, one repeated warped texture":
//                      company property, so low-poly (C1) -- flat-shaded and
//                      vertex-snapped like every lp_ slot, with one tiny
//                      skewed fabric texture, nearest-filtered, that each
//                      face stretches once across itself (box UVs run 0..1
//                      per face), so a 2 m panel and a 6 cm rail warp the
//                      same weave differently
Object.assign(RECIPES, {
  cinderblock_beige: { a: '#857d6d', b: '#a69d88', seed: 52, contrast: 0.5, pattern: 'blocks', rough: 0.9, bump: 0.03, roughVar: 0.3 }
});
Object.assign(LOWPOLY, {
  lp_fluoro_green: { color: '#e2eadb', emissive: '#eef6e0', emissiveIntensity: 1.6 },
  lp_cubicle: { color: '#ffffff', map: cubicleTexture }
});
Object.assign(GLOWS, {
  glow_fluoro_green: { color: '#e6f4d6', opacity: 0.22 }
});
function cubicleTexture() {
  const S = 32;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const rnd = mulberry32(1999);
  c.fillStyle = '#8e8f86';
  c.fillRect(0, 0, S, S);
  // the weave, drawn sheared and wrapped round the tile: a coarse fleck of
  // lighter and darker threads leaning the same way on every panel
  c.setTransform(1, 0.22, -0.3, 1, 0, 0);
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S);
    c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,240,0.09)' : 'rgba(20,22,16,0.11)';
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) c.fillRect(x + ox, y + oy, 2, 1);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  // a darker seam a third of the way across, and grime toward one edge
  c.fillStyle = 'rgba(30,32,26,0.16)';
  c.fillRect(11, 0, 1, S);
  c.fillStyle = 'rgba(40,36,24,0.1)';
  c.fillRect(0, S - 6, S, 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // blocky up close and from mip to mip, never smoothed (PS1); the mips
  // keep a far panel from crawling
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  return t;
}
// ---- followup: s4 -- end ----

export function createMaterialLibrary({ anisotropy = 1 } = {}) {
  const cache = new Map();
  const textureSets = new Map();
  const animated = []; // { set, recipe }
  setAnisotropy(anisotropy);

  function textures(slot) {
    if (!textureSets.has(slot)) {
      const set = makeCanvasTextures(slot);
      textureSets.set(slot, set);
      const recipe = RECIPES[slot];
      if (recipe && recipe.animate) animated.push({ set, recipe });
    }
    return textureSets.get(slot);
  }

  function get(slot) {
    if (cache.has(slot)) return cache.get(slot);
    let mat;
    if (LOWPOLY[slot]) {
      const lp = LOWPOLY[slot];
      mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(lp.color),
        flatShading: true,
        emissive: lp.emissive ? new THREE.Color(lp.emissive) : new THREE.Color(0x000000),
        emissiveIntensity: lp.emissiveIntensity || 1,
        transparent: lp.opacity !== undefined,
        opacity: lp.opacity !== undefined ? lp.opacity : 1
      });
      if (lp.map) { mat.map = lp.map(); mat.userData.ownMap = true; } // a slot's own tiny texture (lp_cubicle)
      withVertexSnap(mat);
    } else if (GLOWS[slot]) {
      const g = GLOWS[slot];
      mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(g.color),
        transparent: true,
        opacity: g.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false
      });
    } else {
      const r = RECIPES[slot] || RECIPES.plaster;
      const set = textures(slot);
      const Mat = r.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
      mat = new Mat({
        map: set.map,
        bumpMap: r.bump ? set.bumpMap : null,
        bumpScale: r.bump || 0,
        roughnessMap: r.roughVar ? set.roughnessMap : null,
        roughness: r.rough,
        metalness: r.metal || 0,
        transparent: r.opacity !== undefined,
        opacity: r.opacity !== undefined ? r.opacity : 1,
        side: slot === 'water' || r.double ? THREE.DoubleSide : THREE.FrontSide
      });
      if (r.physical) {
        // velvet: a sheen lobe at grazing angles (the nap lit from behind);
        // clear glass: no specular lobe at all
        const ph = r.physical;
        mat.sheen = ph.sheen || 0;
        mat.sheenRoughness = ph.sheenRoughness === undefined ? 1 : ph.sheenRoughness;
        if (ph.sheenColor) mat.sheenColor = new THREE.Color(ph.sheenColor);
        if (ph.specularIntensity !== undefined) mat.specularIntensity = ph.specularIntensity;
      }
      if (r.opacity !== undefined) mat.depthWrite = slot === 'water';
    }
    cache.set(slot, mat);
    return mat;
  }

  let t = 0;
  return {
    get,
    isLowPoly: (slot) => !!LOWPOLY[slot],
    isGlow: (slot) => !!GLOWS[slot],
    slots: () => Object.keys(RECIPES).concat(Object.keys(LOWPOLY), Object.keys(GLOWS)),
    // Per-frame: the water drifts (colour one way, caustics the other).
    update(dt) {
      t += dt;
      for (const { set } of animated) {
        set.map.offset.set(t * 0.012, t * 0.007);
        set.bumpMap.offset.set(-t * 0.02, t * 0.011);
      }
    },
    dispose() {
      for (const m of cache.values()) { if (m.userData.ownMap) m.map.dispose(); m.dispose(); }
      for (const set of textureSets.values()) { set.map.dispose(); set.bumpMap.dispose(); set.roughnessMap.dispose(); }
      cache.clear();
      textureSets.clear();
      animated.length = 0;
    }
  };
}
