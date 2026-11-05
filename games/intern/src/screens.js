// What the building's screens say, drawn into the screen of a monitor prop
// (props.js `monitor`, the mesh tagged userData.screen) as a canvas
// texture: the apartment's job posting and its ACCEPTED, the Harlowe
// desktop, the requisition, the cab's floor indicator. A screen is part of
// the room, so what it says stays in the world -- the window cannot be
// closed -- and the canvas is freed with the room (room.js dispose()).

import * as THREE from '../vendor/three/three.module.js';

const W = 512, H = 384;

function screenMesh(inst, propName) {
  const prop = inst && inst.room.named.get(propName);
  if (!prop) return null;
  let mesh = null;
  prop.traverse((o) => { if (!mesh && o.isMesh && o.userData.screen) mesh = o; });
  return mesh;
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

// page: { bg, fg, font, size, lines: [string | {text, size, color, align, gap}], cursor }
export function drawScreen(inst, propName, page) {
  const mesh = screenMesh(inst, propName);
  if (!mesh) return null;
  let tex = mesh.userData.canvasTex;
  if (!tex) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mat.userData.owned = true;
    mesh.material = mat;
    mesh.userData.canvasTex = tex;
  }
  const ctx = tex.image.getContext('2d');
  ctx.fillStyle = page.bg || '#0a0f0c';
  ctx.fillRect(0, 0, W, H);
  const pad = page.pad || 26;
  let y = pad;
  for (const item of page.lines || []) {
    const it = typeof item === 'string' ? { text: item } : item;
    const size = it.size || page.size || 22;
    ctx.font = `${it.bold ? 'bold ' : ''}${size}px ${it.font || page.font || '"Courier New", monospace'}`;
    ctx.fillStyle = it.color || page.fg || '#9fe8bf';
    ctx.textBaseline = 'top';
    for (const line of wrap(ctx, it.text, W - pad * 2)) {
      const x = it.align === 'center' ? (W - ctx.measureText(line).width) / 2 : pad;
      ctx.fillText(line, x, y);
      y += size * 1.25;
    }
    y += it.gap === undefined ? size * 0.35 : it.gap;
  }
  if (page.bar !== undefined) {
    ctx.strokeStyle = page.fg || '#9fe8bf';
    ctx.strokeRect(pad, H - pad - 24, W - pad * 2, 18);
    ctx.fillStyle = page.fg || '#9fe8bf';
    ctx.fillRect(pad + 3, H - pad - 21, (W - pad * 2 - 6) * page.bar, 12);
  }
  // scanlines: it is a CRT
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let sy = 0; sy < H; sy += 3) ctx.fillRect(0, sy, W, 1);
  tex.needsUpdate = true;
  return tex;
}

// Back to the plain lit / dark phosphor of props.js.
export function screenPower(inst, propName, on, mats) {
  const mesh = screenMesh(inst, propName);
  if (!mesh) return;
  if (mesh.userData.canvasTex) { mesh.material.dispose(); mesh.userData.canvasTex.dispose(); mesh.userData.canvasTex = null; }
  mesh.material = mats.get(on ? 'lp_screen' : 'lp_screen_off');
}
