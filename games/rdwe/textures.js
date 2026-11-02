// Procedural texture generation for the walk scenes. Nothing here is downloaded:
// every map (albedo, roughness, normal) is computed on the CPU from seeded value
// noise when a scene is prepared, so a phone on a slow connection pays nothing
// beyond three.js itself. Sizes are chosen per device in walk.js (`quality`).
import * as THREE from 'three';

// --- Seeded value noise ------------------------------------------------------
function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

// Tileable value noise on a `period` lattice: sampling x in [0, period) wraps.
export function noise2(x, y, period, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const ax = ((x0 % period) + period) % period, ay = ((y0 % period) + period) % period;
  const bx = (ax + 1) % period, by = (ay + 1) % period;
  const v00 = hash2(ax, ay, seed), v10 = hash2(bx, ay, seed);
  const v01 = hash2(ax, by, seed), v11 = hash2(bx, by, seed);
  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  return top + (bot - top) * fy;
}

// Fractal sum of tileable noise. u,v in [0,1); `scale` = lattice cells per tile at octave 0.
export function fbm(u, v, scale, octaves, seed, gain = 0.5, lacunarity = 2) {
  let amp = 1, sum = 0, norm = 0, freq = scale;
  for (let o = 0; o < octaves; o++) {
    const p = Math.max(1, Math.round(freq));
    sum += amp * noise2(u * p, v * p, p, seed + o * 17);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}
function mixRgb(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

// --- Texture packaging ---------------------------------------------------------
export function dataTexture(rgba, size, { srgb = false, aniso = 4, repeat = [1, 1] } = {}) {
  const tex = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

// Tangent-space normal map from a tileable height field (values 0..1).
export function heightToNormal(height, size, strength = 1) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size, yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const dx = (height[y * size + xp] - height[y * size + xm]) * strength;
      const dy = (height[yp * size + x] - height[ym * size + x]) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      out[i] = (nx * 0.5 + 0.5) * 255;
      out[i + 1] = (ny * 0.5 + 0.5) * 255;
      out[i + 2] = (nz * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

function writeRgb(out, i, r, g, b) {
  out[i] = clamp01(r) * 255;
  out[i + 1] = clamp01(g) * 255;
  out[i + 2] = clamp01(b) * 255;
  out[i + 3] = 255;
}

// A grey map (roughness / ao) from a float array.
function greyMap(values, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = clamp01(values[i]) * 255;
    out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
  }
  return out;
}

// --- Generators ------------------------------------------------------------------
// Each returns { map, normalMap?, roughnessMap?, tile: metres per repeat }.

// Deep-pile carpet: a dense high-frequency fibre field over slow tonal drift, with the
// pile direction brushed so it catches light in bands (the shag in the dining room).
export function carpet(size, { color = '#3f6b3a', shade = '#243f22', light = '#5a8a4f', seed = 1, tile = 1.2, flecks = null } = {}) {
  const base = hexToRgb(color), dark = hexToRgb(shade), lit = hexToRgb(light);
  const fl = flecks ? flecks.map(hexToRgb) : null;
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const drift = fbm(u, v, 3, 3, seed);                 // wear / vacuum bands
      const tufts = fbm(u, v, 96, 3, seed + 3, 0.55);      // fibre clumps
      const fibre = noise2(u * size * 0.9, v * size * 0.9, Math.round(size * 0.9), seed + 9); // per-texel sparkle
      const brush = 0.5 + 0.5 * Math.sin((u * 7 + drift * 2) * Math.PI * 2);
      let h = tufts * 0.7 + fibre * 0.3;
      height[y * size + x] = h;
      let t = clamp01(0.35 + (h - 0.5) * 1.3 + (drift - 0.5) * 0.35 + (brush - 0.5) * 0.12);
      let c = t < 0.5 ? mixRgb(dark, base, t * 2) : mixRgb(base, lit, (t - 0.5) * 2);
      if (fl) {
        // coarse flecked carpet: hard-edged specks of the fleck colours over the pile
        const cell = hash2(x >> 2, y >> 2, seed + 40);
        if (cell > 0.72) c = fl[Math.floor(hash2(x >> 2, y >> 2, seed + 41) * fl.length)];
      }
      rough[y * size + x] = 0.86 + (fibre - 0.5) * 0.15;
      writeRgb(rgba, (y * size + x) * 4, c[0], c[1], c[2]);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 90), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// Painted plaster: a faint orange-peel relief, small tonal clouds and a few thin hairline
// imperfections so the wall never reads as a flat colour.
export function plaster(size, { color = '#e8dcc3', seed = 2, tile = 2.0, relief = 1.0 } = {}) {
  const base = hexToRgb(color);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const peel = fbm(u, v, 64, 3, seed, 0.5);
      const cloud = fbm(u, v, 4, 3, seed + 5);
      const grime = fbm(u, v, 2, 2, seed + 11);
      height[y * size + x] = peel;
      const tone = 1 + (cloud - 0.5) * 0.08 - Math.max(0, grime - 0.6) * 0.18;
      writeRgb(rgba, (y * size + x) * 4, base[0] * tone, base[1] * tone, base[2] * tone);
      rough[y * size + x] = 0.82 + (peel - 0.5) * 0.2;
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, (size / 400) * relief), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// Wood: long grain along v with turbulence, ring banding and pores. `tone` selects the species.
export function wood(size, { color = '#8a5a2b', dark = '#4b2d12', seed = 3, tile = 1.0, rings = 14, gloss = 0.45 } = {}) {
  const base = hexToRgb(color), deep = hexToRgb(dark);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const warp = fbm(u, v, 3, 3, seed) - 0.5;
      const fine = fbm(u, v, 40, 2, seed + 4);
      // rings run along v (the long axis); u crosses the grain
      const ring = 0.5 + 0.5 * Math.sin((u + warp * 0.35 + fine * 0.02) * Math.PI * 2 * rings + v * 1.2);
      const streak = fbm(u * 40, v, 6, 2, seed + 8);
      // soften: most of the board sits in the mid tones, only the ring edges go dark
      const t = clamp01(0.35 + Math.pow(ring, 1.6) * 0.45 + (streak - 0.5) * 0.4);
      const c = mixRgb(deep, base, t);
      const pores = fine > 0.72 ? 0.9 : 1;
      height[y * size + x] = t * 0.6 + fine * 0.4;
      rough[y * size + x] = gloss + (1 - t) * 0.18 + (fine - 0.5) * 0.1;
      writeRgb(rgba, (y * size + x) * 4, c[0] * pores, c[1] * pores, c[2] * pores);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 900), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// Pleated sheer curtain: vertical folds (albedo shading + a strong normal) and a loose weave.
export function curtain(size, { color = '#efe9dc', seed = 4, pleats = 9 } = {}) {
  const base = hexToRgb(color);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const sway = (fbm(u, v, 2, 2, seed) - 0.5) * 0.08;
      const fold = 0.5 + 0.5 * Math.sin((u + sway) * Math.PI * 2 * pleats);
      const weave = noise2(u * size * 0.5, v * size * 0.5, Math.round(size * 0.5), seed + 2);
      const h = fold * 0.9 + weave * 0.1;
      height[y * size + x] = h;
      const tone = 0.72 + fold * 0.32 + (weave - 0.5) * 0.06;
      writeRgb(rgba, (y * size + x) * 4, base[0] * tone, base[1] * tone, base[2] * tone);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 40), size),
    tile: 1,
  };
}

// Ceiling tile grid (the hallway): 0.5 x 0.25 m tiles with a recessed grout and a pinhole
// speckle, matching the brick-texture set-up in the source .blend.
export function ceilingTile(size, { a = '#ebebe6', b = '#e1e1d9', mortar = '#999891', seed = 5, tile = 2.0 } = {}) {
  const ca = hexToRgb(a), cb = hexToRgb(b), cm = hexToRgb(mortar);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const cols = 4, rows = 8; // per 2 m tile
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const row = Math.floor(v * rows);
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const uu = u * cols + (row % 2 ? 0.5 : 0);
      const fu = uu - Math.floor(uu), fv = v * rows - row;
      const edge = Math.min(fu, 1 - fu, fv * 2, (1 - fv) * 2);
      const grout = edge < 0.03 ? 1 : edge < 0.06 ? (0.06 - edge) / 0.03 : 0;
      const which = hash2(Math.floor(uu), row, seed) > 0.5 ? ca : cb;
      const speckle = noise2(u * size * 0.6, v * size * 0.6, Math.round(size * 0.6), seed + 3) > 0.83 ? 0.82 : 1;
      const c = mixRgb(which, cm, grout);
      height[y * size + x] = (1 - grout) * 0.8 + speckle * 0.2;
      writeRgb(rgba, (y * size + x) * 4, c[0] * speckle, c[1] * speckle, c[2] * speckle);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 300), size),
    tile,
  };
}

// The hallway's painted wall from the .blend: two mustard tones blended by a slow noise,
// multiplied by a faint fine grain and a hairline crack ramp.
export function backroomsWall(size, { seed = 6, tile = 3.0 } = {}) {
  const c0 = [0.82, 0.68, 0.12], c1 = [0.92, 0.79, 0.2];
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const slow = fbm(u, v, 10, 2, seed);
      const fine = fbm(u, v, 20, 2, seed + 7);
      const paper = fbm(u, v, 160, 3, seed + 3, 0.6);          // the wallpaper's tooth
      const stripe = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * 18); // faint printed stripe
      const streak = fbm(u, v * 0.25, 1, 2, seed + 13);         // vertical drips
      const c = mixRgb(c0, c1, slow);
      const grime = 0.55 + fine * 0.45;
      const drip = 1 - Math.max(0, streak - 0.62) * 0.35;
      const tooth = 0.9 + paper * 0.16 + (stripe - 0.5) * 0.05;
      height[y * size + x] = paper * 0.7 + fine * 0.3;
      rough[y * size + x] = 0.78 + (paper - 0.5) * 0.2;
      const k = grime * drip * tooth;
      writeRgb(rgba, (y * size + x) * 4, c[0] * k, c[1] * k, c[2] * k);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 500), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// The hallway's wall from the room clip: pale grey-beige plaster with a faint printed plaid
// (thin lines on a 10 cm grid, a heavier one every fifth) under grime clouds and a few drips.
export function plaidWall(size, { color = '#d3cbb9', line = '#b9b09e', seed = 66, tile = 1.5 } = {}) {
  const base = hexToRgb(color), ln = hexToRgb(line);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const cells = 15; // 10 cm lines on a 1.5 m tile
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const fu = (u * cells) % 1, fv = (v * cells) % 1;
      const cu = Math.floor(u * cells), cv = Math.floor(v * cells);
      const w = 0.03;
      const thin = Math.min(fu, 1 - fu) < w || Math.min(fv, 1 - fv) < w ? 0.4 : 0;
      const heavy = ((cu % 5 === 0) && Math.min(fu, 1 - fu) < w * 1.5) || ((cv % 5 === 0) && Math.min(fv, 1 - fv) < w * 1.5) ? 1 : 0;
      const l = Math.max(thin, heavy);
      const peel = fbm(u, v, 48, 3, seed, 0.5);
      const cloud = fbm(u, v, 3, 3, seed + 5);
      const grime = fbm(u, v, 2, 3, seed + 11);
      const streak = fbm(u, v * 0.2, 1, 2, seed + 13);
      const tone = (1 + (cloud - 0.5) * 0.1 - Math.max(0, grime - 0.5) * 0.3) * (1 - Math.max(0, streak - 0.65) * 0.25);
      const c = mixRgb(base, ln, l * 0.35);
      height[y * size + x] = peel * 0.9 + (1 - l) * 0.1;
      rough[y * size + x] = 0.85 + (peel - 0.5) * 0.15;
      writeRgb(rgba, (y * size + x) * 4, c[0] * tone, c[1] * tone, c[2] * tone);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 500), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// The hallway's carpet from the clip: a worn tan pile with a lattice of small dark diamonds.
export function diamondCarpet(size, { color = '#b9a47a', dark = '#6f5c3e', shade = '#8f7c58', seed = 67, tile = 1.0 } = {}) {
  const base = hexToRgb(color), deep = hexToRgb(dark), sh = hexToRgb(shade);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const n = 12; // diamonds per metre
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const fu = (u * n) % 1 - 0.5, fv = (v * n) % 1 - 0.5;
      const d = Math.abs(fu) + Math.abs(fv);
      const dot = d < 0.22 ? 1 : d < 0.3 ? (0.3 - d) / 0.08 : 0;
      const tufts = fbm(u, v, 80, 3, seed + 3, 0.55);
      const fibre = noise2(u * size * 0.8, v * size * 0.8, Math.round(size * 0.8), seed + 9);
      const wear = fbm(u, v, 3, 3, seed);
      let c = mixRgb(base, sh, Math.max(0, wear - 0.45) * 1.2 + (tufts - 0.5) * 0.5);
      c = mixRgb(c, deep, dot * 0.85);
      const h = tufts * 0.6 + fibre * 0.25 + (1 - dot) * 0.15;
      height[y * size + x] = h;
      rough[y * size + x] = 0.88 + (fibre - 0.5) * 0.1;
      writeRgb(rgba, (y * size + x) * 4, c[0], c[1], c[2]);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 110), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// Faded family photo: a warm sepia print with soft, unreadable figures in the middle
// distance. Every frame on the wall gets a different seed, so no two are alike.
export function photo(size, { seed = 7, warm = true } = {}) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const tint = warm ? [0.93, 0.82, 0.66] : [0.8, 0.82, 0.86];
  const figures = 1 + Math.floor(hash2(seed, 1, 3) * 3);
  const fig = [];
  for (let i = 0; i < figures; i++) {
    fig.push({
      x: 0.25 + hash2(seed, i + 2, 5) * 0.5,
      y: 0.62 - hash2(seed, i + 9, 5) * 0.1,
      w: 0.08 + hash2(seed, i + 4, 7) * 0.06,
      h: 0.22 + hash2(seed, i + 6, 7) * 0.16,
      tone: 0.22 + hash2(seed, i + 8, 9) * 0.3,
    });
  }
  const skyDark = hash2(seed, 3, 11) > 0.5;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const grain = noise2(u * size, v * size, size, seed + 21);
      const bg = skyDark ? 0.42 + v * 0.25 : 0.78 - v * 0.3;
      let l = bg + (fbm(u, v, 3, 3, seed) - 0.5) * 0.25;
      for (const f of fig) {
        const headY = f.y - f.h * 0.95;
        const head = Math.hypot((u - f.x) / (f.w * 0.42), (v - headY) / (f.h * 0.2));
        const shoulders = Math.hypot((u - f.x) / (f.w * 1.15), (v - (f.y - f.h * 0.35)) / (f.h * 0.45));
        const torso = Math.max(Math.abs(u - f.x) / (f.w * 0.95), (v - (f.y - f.h * 0.35)) / (f.h * 0.75));
        const inside = Math.min(head, v > headY + f.h * 0.15 ? Math.min(shoulders, torso) : 9);
        if (inside < 1.1) {
          const face = head < 0.9 ? 0.25 : 0;   // faces a shade lighter than clothes
          l = lerp(l, f.tone + face, clamp01((1.1 - inside) / 0.22));
        }
      }
      // a soft horizon behind them
      if (Math.abs(v - 0.58) < 0.012) l *= 0.9;
      const vignette = 1 - Math.pow(Math.hypot(u - 0.5, v - 0.5) * 1.35, 2.2) * 0.6;
      l = clamp01(l * vignette + (grain - 0.5) * 0.08);
      // rows are painted top-down; a DataTexture's first row is the bottom of the image
      writeRgb(rgba, ((size - 1 - y) * size + x) * 4, l * tint[0], l * tint[1], l * tint[2]);
    }
  }
  const tex = dataTexture(rgba, size, { srgb: true });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return { map: tex, tile: 1 };
}

// Soft blotchy shade for the lamp: warm paper with a slightly translucent look.
export function lampshade(size, { seed = 8 } = {}) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const fibre = fbm(u, v, 30, 3, seed);
      const l = 0.86 + (fibre - 0.5) * 0.14;
      writeRgb(rgba, (y * size + x) * 4, l, l * 0.94, l * 0.82);
    }
  }
  return { map: dataTexture(rgba, size, { srgb: true }), tile: 1 };
}

// Mossy pixel-block stone (the stairwell under THE END, after loading clip c.MP4): a 2 m
// tile of 0.5 m blocks, each block a 16 x 16 grid of hard-edged "pixels" in greys and greens,
// with a dark mortar seam and a slow moss drift across the whole wall.
export function mossBlock(size, { seed = 71, tile = 2.0 } = {}) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const blocks = 4, px = 16;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const bu = Math.floor(u * blocks), bv = Math.floor(v * blocks);
      const fu = u * blocks - bu, fv = v * blocks - bv;
      const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
      const seam = edge < 0.035 ? 1 : 0;
      const pu = Math.floor(fu * px), pv = Math.floor(fv * px);
      const cell = hash2(bu * px + pu, bv * px + pv, seed);
      const moss = fbm(u, v, 3, 3, seed + 5);
      const stone = 0.32 + cell * 0.22;
      const m = clamp01((moss - 0.42) * 2.2) * (0.5 + cell * 0.5);
      let r = stone * (1 - m * 0.6), g = stone * (1 - m * 0.1) + m * 0.22, b = stone * (1 - m * 0.75);
      if (seam) { r *= 0.35; g *= 0.4; b *= 0.35; }
      height[y * size + x] = seam ? 0.2 : 0.6 + cell * 0.4;
      writeRgb(rgba, (y * size + x) * 4, r, g, b);
    }
  }
  const map = dataTexture(rgba, size, { srgb: true });
  map.magFilter = THREE.NearestFilter; // keep the pixels hard-edged up close
  return { map, normalMap: dataTexture(heightToNormal(height, size, size / 260), size), tile };
}

// Leather: a pebbled grain (ridged noise) under slow creases, with a satin roughness.
export function leather(size, { color = '#d9641e', dark = '#8a3a0c', seed = 81, tile = 0.6, gloss = 0.42 } = {}) {
  const base = hexToRgb(color), deep = hexToRgb(dark);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const grain = 1 - Math.abs(fbm(u, v, 48, 3, seed, 0.55) - 0.5) * 2;   // ridged pebble
      const crease = fbm(u, v, 3, 3, seed + 4);
      const wear = fbm(u, v, 1, 2, seed + 9);
      const t = clamp01(0.55 + (grain - 0.5) * 0.5 + (crease - 0.5) * 0.35);
      const c = mixRgb(deep, base, t);
      const shine = 1 + Math.max(0, wear - 0.55) * 0.5;
      height[y * size + x] = grain * 0.8 + crease * 0.2;
      rough[y * size + x] = gloss + (1 - grain) * 0.25 - Math.max(0, wear - 0.55) * 0.3;
      writeRgb(rgba, (y * size + x) * 4, c[0] * shine, c[1] * shine, c[2] * shine);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 500), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// Glowing green wireframe grid on black (what is under the wallpaper in the mutated room).
export function wireGrid(size, { cells = 8, color = '#39ff6a', width = 0.045, seed = 91 } = {}) {
  const c = hexToRgb(color);
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const fu = (u * cells) % 1, fv = (v * cells) % 1;
      const d = Math.min(fu, 1 - fu, fv, 1 - fv);
      const line = d < width ? 1 - (d / width) * 0.6 : 0;
      const dot = (fu < width * 1.6 || fu > 1 - width * 1.6) && (fv < width * 1.6 || fv > 1 - width * 1.6) ? 1 : 0;
      const l = Math.max(line, dot * 1.2) * (0.85 + hash2(x, y, seed) * 0.15);
      writeRgb(rgba, (y * size + x) * 4, c[0] * l * 0.9, c[1] * l, c[2] * l * 0.9);
    }
  }
  const tex = dataTexture(rgba, size, { srgb: true });
  return { map: tex, emissiveMap: tex, tile: 1 };
}

// 2D-canvas painted textures (sky mural, fake window, caution tape, signs).
export function canvasTexture(w, h, paint, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// The teal room's "fake window": a flat painted sky with a sun that never moves.
export function fakeWindow(size = 512) {
  const tex = canvasTexture(size, size, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#5f9fe8'); sky.addColorStop(0.7, '#a9d2f2'); sky.addColorStop(1, '#d9e9d0');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const sun = g.createRadialGradient(w * 0.68, h * 0.28, 0, w * 0.68, h * 0.28, w * 0.22);
    sun.addColorStop(0, '#fffbe6'); sun.addColorStop(0.18, '#fff3b0'); sun.addColorStop(0.5, 'rgba(255,240,200,0.35)'); sun.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = sun; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fffbe6'; g.beginPath(); g.arc(w * 0.68, h * 0.28, w * 0.07, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#6f9a4a'; g.fillRect(0, h * 0.82, w, h * 0.18);
    g.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i = 0; i < 5; i++) { const cx = w * (0.1 + i * 0.2), cy = h * (0.45 + (i % 2) * 0.12); for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx + k * w * 0.035, cy - (k % 2) * h * 0.02, w * 0.04, 0, Math.PI * 2); g.fill(); } }
  });
  return { map: tex, emissiveMap: tex, tile: 1 };
}

// A grid of tiles: ceramic wall tile, floor tile, acoustic ceiling, riveted steel panels.
// `cols` x `rows` tiles per texture tile, two alternating face tones, a grout colour.
export function tiles(size, {
  cols = 8, rows = 8, a = '#f4f4f0', b = '#ecece6', grout = '#b9b9b0', groutW = 0.035, offset = false,
  seed = 141, tile = 1.2, gloss = 0.35, speckle = 0, rivets = false, relief = 1.0,
} = {}) {
  const ca = hexToRgb(a), cb = hexToRgb(b), cg = hexToRgb(grout);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const row = Math.floor(v * rows);
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const uu = u * cols + (offset && row % 2 ? 0.5 : 0);
      const col = Math.floor(uu);
      const fu = uu - col, fv = v * rows - row;
      const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
      const g = edge < groutW ? 1 : edge < groutW * 1.6 ? (groutW * 1.6 - edge) / (groutW * 0.6) : 0;
      const face = hash2(col, row, seed) > 0.5 ? ca : cb;
      const wobble = 1 + (fbm(u, v, 24, 2, seed + 3) - 0.5) * 0.08;
      let c = mixRgb(face, cg, g);
      let h = (1 - g) * 0.8 + fbm(u, v, 64, 2, seed + 7) * 0.2;
      let r = gloss + g * 0.5 + (wobble - 1) * 0.5;
      if (speckle > 0) {
        const sp = hash2(x, y, seed + 11);
        if (sp > 1 - speckle) { c = mixRgb(c, [0.15, 0.13, 0.11], 0.6); }
      }
      if (rivets) {
        // a rivet just inside each corner and along the seams
        const ru = Math.min(fu, 1 - fu) - 0.06, rv = Math.min(fv, 1 - fv) - 0.06;
        const along = Math.abs(ru) < 0.02 && ((fv * 6) % 1) < 0.25;
        const across = Math.abs(rv) < 0.02 && ((fu * 6) % 1) < 0.25;
        if (along || across) { c = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55]; h += 0.5; r -= 0.2; }
      }
      height[y * size + x] = h;
      rough[y * size + x] = r;
      writeRgb(rgba, (y * size + x) * 4, c[0] * wobble, c[1] * wobble, c[2] * wobble);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, (size / 300) * relief), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// The yellow tactile guide strip: a lattice of raised domes.
export function tactile(size = 256, { color = '#d9c26a', seed = 151 } = {}) {
  const base = hexToRgb(color);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const n = 4;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const fu = (u * n) % 1 - 0.5, fv = (v * n) % 1 - 0.5;
      const d = Math.hypot(fu, fv);
      const dome = d < 0.3 ? Math.sqrt(1 - Math.pow(d / 0.3, 2)) : 0;
      const dirt = fbm(u, v, 6, 2, seed);
      const l = 0.82 + dome * 0.18 - Math.max(0, dirt - 0.55) * 0.35;
      height[y * size + x] = dome;
      writeRgb(rgba, (y * size + x) * 4, base[0] * l, base[1] * l, base[2] * l);
    }
  }
  return { map: dataTexture(rgba, size, { srgb: true }), normalMap: dataTexture(heightToNormal(height, size, size / 40), size), tile: 0.3 };
}

// Rippling water: a tileable normal map of overlapping soft waves, scrolled at runtime.
export function ripple(size = 256, { seed = 161 } = {}) {
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      height[y * size + x] = fbm(u, v, 5, 3, seed, 0.5) * 0.6 + Math.sin((u * 7 + v * 3) * Math.PI * 2) * 0.05 + Math.sin((u * 2 - v * 9) * Math.PI * 2) * 0.05;
    }
  }
  return dataTexture(heightToNormal(height, size, size / 120), size);
}

// The corridor's painted sky: a brushy blue gradient, cumulus blobs and a green hill line.
export function skyMural(w, h, { seed = 171 } = {}) {
  const tex = canvasTexture(w, h, (g, W, H) => {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2f7fd6'); sky.addColorStop(0.55, '#7fb8ec'); sky.addColorStop(0.78, '#b9dbf4');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // brush strokes
    for (let i = 0; i < 260; i++) {
      const y = hash2(i, 1, seed) * H * 0.78, x = hash2(i, 2, seed) * W;
      g.fillStyle = `rgba(255,255,255,${0.03 + hash2(i, 3, seed) * 0.06})`;
      g.fillRect(x, y, 30 + hash2(i, 4, seed) * 140, 3 + hash2(i, 5, seed) * 6);
    }
    // clouds
    for (let c = 0; c < 14; c++) {
      const cx = hash2(c, 7, seed) * W, cy = H * (0.12 + hash2(c, 8, seed) * 0.5), s = H * (0.05 + hash2(c, 9, seed) * 0.07);
      for (let k = 0; k < 9; k++) {
        const ox = (hash2(c, 20 + k, seed) - 0.5) * s * 4.5, oy = (hash2(c, 40 + k, seed) - 0.6) * s * 1.6;
        const r = s * (0.6 + hash2(c, 60 + k, seed) * 0.8);
        const grd = g.createRadialGradient(cx + ox, cy + oy, r * 0.2, cx + ox, cy + oy, r);
        grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.7, 'rgba(245,248,255,0.8)'); grd.addColorStop(1, 'rgba(230,238,250,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(cx + ox, cy + oy, r, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(170,190,215,0.35)';
      g.fillRect(cx - s * 2.2, cy + s * 0.55, s * 4.4, s * 0.25);
    }
    // hills
    g.fillStyle = '#5f9a3e';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, H * 0.84 + Math.sin(x / W * 9) * H * 0.03 + Math.sin(x / W * 23 + 1) * H * 0.015);
    g.lineTo(W, H); g.closePath(); g.fill();
    g.fillStyle = 'rgba(40,90,30,0.35)';
    for (let i = 0; i < 60; i++) g.fillRect(hash2(i, 90, seed) * W, H * (0.88 + hash2(i, 91, seed) * 0.1), 20 + hash2(i, 92, seed) * 80, 2);
  }, { repeat: true });
  return { map: tex, tile: 1 };
}

// Trampoline bed: a tight black weave with a faint sheen where the threads cross.
export function weave(size = 256, { color = '#141416', seed = 181, tile = 0.5, lines = 40 } = {}) {
  const base = hexToRgb(color);
  const rgba = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const a = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * lines);
      const b = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * lines);
      const cross = Math.max(a, b);
      const wear = fbm(u, v, 3, 2, seed);
      const l = 0.75 + cross * 0.45 + (wear - 0.5) * 0.3;
      height[y * size + x] = cross;
      rough[y * size + x] = 0.55 + (1 - cross) * 0.35;
      writeRgb(rgba, (y * size + x) * 4, base[0] * l, base[1] * l, base[2] * l);
    }
  }
  return {
    map: dataTexture(rgba, size, { srgb: true }),
    normalMap: dataTexture(heightToNormal(height, size, size / 200), size),
    roughnessMap: dataTexture(greyMap(rough, size), size),
    tile,
  };
}

// A soft radial glow (sprite) for the red light on the horizon.
export function glowSprite(size = 128, color = '#ff2020') {
  return canvasTexture(size, size, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, color); grd.addColorStop(0.25, color.replace(')', '') + ''); grd.addColorStop(0.3, 'rgba(255,32,32,0.55)'); grd.addColorStop(1, 'rgba(255,32,32,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

// A dark scuff mark (alpha decal).
export function scuff(size = 128, { seed = 191 } = {}) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.strokeStyle = 'rgba(20,16,12,0.7)';
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    g.lineWidth = 2 + hash2(i, 1, seed) * 5;
    g.beginPath();
    g.moveTo(size * (0.2 + hash2(i, 2, seed) * 0.6), size * (0.25 + hash2(i, 3, seed) * 0.5));
    g.quadraticCurveTo(size * hash2(i, 4, seed), size * hash2(i, 5, seed), size * (0.2 + hash2(i, 6, seed) * 0.6), size * (0.25 + hash2(i, 7, seed) * 0.5));
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Yellow / black caution tape with the word on it.
export function cautionTape(w = 1024, h = 96) {
  return canvasTexture(w, h, (g, W, H) => {
    g.fillStyle = '#f2c81c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#111';
    for (let x = -H; x < W + H; x += H * 1.2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H * 0.5, 0); g.lineTo(x + H * 0.5 - H, H); g.lineTo(x - H, H); g.closePath(); g.fill(); }
    g.fillStyle = '#f2c81c'; g.fillRect(0, H * 0.25, W, H * 0.5);
    g.fillStyle = '#111'; g.font = `bold ${Math.round(H * 0.44)}px "Arial Narrow", Impact, sans-serif`; g.textBaseline = 'middle';
    for (let x = 20; x < W; x += 300) g.fillText('CAUTION', x, H / 2 + 2);
  }, { repeat: true });
}

// A lit EXIT sign.
export function exitSign(w = 256, h = 96) {
  return canvasTexture(w, h, (g, W, H) => {
    g.fillStyle = '#0b1f10'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3cff6a'; g.font = `bold ${Math.round(H * 0.72)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('EXIT', W / 2, H / 2 + 4);
    g.strokeStyle = '#3cff6a'; g.lineWidth = 4; g.strokeRect(6, 6, W - 12, H - 12);
  });
}
