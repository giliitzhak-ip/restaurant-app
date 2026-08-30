/**
 * props.js — everything solid that stands on the terrain, plus the aircraft.
 *
 * Each emitter pushes polygons into the renderer's depth-sorted list through
 * the small emitter API (poly / disc / ring / sprite), so props interleave
 * correctly with the ground.
 */
'use strict';

import {
  clamp, clamp01, lerp, cachedRGB, rgba, hash3, bodyToWorld, TAU, DEG,
} from './math.js';

export const TREE_STYLES = {
  conifer: { shape: 'cone', height: 17, widthRatio: 0.42, color: [46, 74, 52] },
  redwood: { shape: 'cone', height: 30, widthRatio: 0.30, color: [36, 62, 44] },
  wind_pine: { shape: 'lean', height: 11, widthRatio: 0.55, color: [58, 78, 54] },
  juniper: { shape: 'round', height: 7, widthRatio: 0.72, color: [86, 96, 62] },
};

const _p = new Float32Array(36);

/** Lambert + ambient + fog, returned as a cached CSS colour. */
function lit(albedo, nx, ny, nz, atm, fog) {
  const s = atm.sunDir;
  let lam = nx * s.x + ny * s.y + nz * s.z;
  if (lam < 0) lam = 0;
  const wrap = lam * 0.88 + 0.12;
  const lc = atm.lightColor, ac = atm.ambientColor, fc = atm.fogColor;
  const gain = atm.exposureGain;
  const sunI = atm.sunIntensity * gain;
  const amb = atm.ambientIntensity * gain * (0.55 + 0.45 * clamp01(ny * 0.5 + 0.5));
  let r = albedo[0] * (lc[0] * sunI * wrap + ac[0] * amb) * 0.0039;
  let g = albedo[1] * (lc[1] * sunI * wrap + ac[1] * amb) * 0.0039;
  let b = albedo[2] * (lc[2] * sunI * wrap + ac[2] * amb) * 0.0039;
  r += (fc[0] - r) * fog; g += (fc[1] - g) * fog; b += (fc[2] - b) * fog;
  return cachedRGB(r, g, b);
}

function faceAwayFromCam(R, cx, cy, cz, nx, ny, nz) {
  const c = R.cam.pos;
  return (cx - c.x) * nx + (cy - c.y) * ny + (cz - c.z) * nz > 0;
}

/** Axis-aligned-in-local-space box, rotated about Y. */
function emitBox(R, atm, fog, cx, cy, cz, w, h, d, yaw, albedo, alpha) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const hw = w / 2, hd = d / 2;
  // Local corner offsets (x right, z forward)
  const cor = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const wx = [], wz = [];
  for (let i = 0; i < 4; i++) {
    wx.push(cx + cor[i][0] * c + cor[i][1] * s);
    wz.push(cz - cor[i][0] * s + cor[i][1] * c);
  }
  const y0 = cy, y1 = cy + h;

  // Top
  _p[0] = wx[0]; _p[1] = y1; _p[2] = wz[0];
  _p[3] = wx[1]; _p[4] = y1; _p[5] = wz[1];
  _p[6] = wx[2]; _p[7] = y1; _p[8] = wz[2];
  _p[9] = wx[3]; _p[10] = y1; _p[11] = wz[3];
  R.poly(_p.subarray(0, 12), lit(albedo, 0, 1, 0, atm, fog), alpha);

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const ex = wx[j] - wx[i], ez = wz[j] - wz[i];
    const len = Math.hypot(ex, ez) || 1;
    const nx = ez / len, nz = -ex / len;
    const mx = (wx[i] + wx[j]) / 2, mz = (wz[i] + wz[j]) / 2;
    if (faceAwayFromCam(R, mx, cy + h / 2, mz, nx, 0, nz)) continue;
    _p[0] = wx[i]; _p[1] = y0; _p[2] = wz[i];
    _p[3] = wx[j]; _p[4] = y0; _p[5] = wz[j];
    _p[6] = wx[j]; _p[7] = y1; _p[8] = wz[j];
    _p[9] = wx[i]; _p[10] = y1; _p[11] = wz[i];
    R.poly(_p.subarray(0, 12), lit(albedo, nx, 0.12, nz, atm, fog), alpha);
  }
}

/** Tapered prism — cylinders, cones, boulders, hoodoos. */
function emitPrism(R, atm, fog, cx, cy, cz, r0, r1, h, sides, yaw, albedo, jitter, seed) {
  const step = TAU / sides;
  for (let i = 0; i < sides; i++) {
    const a0 = yaw + i * step, a1 = yaw + (i + 1) * step;
    const j0 = jitter ? 0.72 + hash3(seed, i, 3) * 0.56 : 1;
    const j1 = jitter ? 0.72 + hash3(seed, (i + 1) % sides, 3) * 0.56 : 1;
    const x0 = cx + Math.cos(a0) * r0 * j0, z0 = cz + Math.sin(a0) * r0 * j0;
    const x1 = cx + Math.cos(a1) * r0 * j1, z1 = cz + Math.sin(a1) * r0 * j1;
    const x2 = cx + Math.cos(a1) * r1 * j1, z2 = cz + Math.sin(a1) * r1 * j1;
    const x3 = cx + Math.cos(a0) * r1 * j0, z3 = cz + Math.sin(a0) * r1 * j0;
    const na = a0 + step / 2;
    const nx = Math.cos(na), nz = Math.sin(na);
    const my = cy + h / 2;
    if (faceAwayFromCam(R, (x0 + x1) / 2, my, (z0 + z1) / 2, nx, 0.1, nz)) continue;
    _p[0] = x0; _p[1] = cy; _p[2] = z0;
    _p[3] = x1; _p[4] = cy; _p[5] = z1;
    _p[6] = x2; _p[7] = cy + h; _p[8] = z2;
    _p[9] = x3; _p[10] = cy + h; _p[11] = z3;
    R.poly(_p.subarray(0, 12), lit(albedo, nx, 0.22, nz, atm, fog), 1);
  }
  if (r1 > 0.2) {
    let k = 0;
    for (let i = 0; i < sides; i++) {
      const a = yaw + i * step;
      const j = jitter ? 0.72 + hash3(seed, i, 3) * 0.56 : 1;
      _p[k++] = cx + Math.cos(a) * r1 * j;
      _p[k++] = cy + h;
      _p[k++] = cz + Math.sin(a) * r1 * j;
    }
    R.poly(_p.subarray(0, k), lit(albedo, 0, 1, 0, atm, fog), 1);
  }
}

/** Pitched roof: two slopes plus gable ends. */
function emitRoof(R, atm, fog, cx, cy, cz, w, d, rise, yaw, albedo) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const hw = w / 2, hd = d / 2;
  const pt = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  const a = pt(-hw, -hd), b = pt(hw, -hd), cc = pt(hw, hd), d2 = pt(-hw, hd);
  const rA = pt(0, -hd), rB = pt(0, hd);
  const top = cy + rise;
  const nA = [-c, 0.6, s], nB = [c, 0.6, -s];
  _p[0] = a[0]; _p[1] = cy; _p[2] = a[1];
  _p[3] = d2[0]; _p[4] = cy; _p[5] = d2[1];
  _p[6] = rB[0]; _p[7] = top; _p[8] = rB[1];
  _p[9] = rA[0]; _p[10] = top; _p[11] = rA[1];
  R.poly(_p.subarray(0, 12), lit(albedo, nA[0], nA[1], nA[2], atm, fog), 1);
  _p[0] = b[0]; _p[1] = cy; _p[2] = b[1];
  _p[3] = cc[0]; _p[4] = cy; _p[5] = cc[1];
  _p[6] = rB[0]; _p[7] = top; _p[8] = rB[1];
  _p[9] = rA[0]; _p[10] = top; _p[11] = rA[1];
  R.poly(_p.subarray(0, 12), lit(albedo, nB[0], nB[1], nB[2], atm, fog), 1);
}

// ── Individual landmarks ────────────────────────────────────────────────────

const ROCK = [116, 112, 106];
const WOOD = [104, 74, 52];
const DARKWOOD = [72, 52, 38];
const WHITE = [232, 232, 228];

function drawWaterfall(R, p, atm, fog, state) {
  const w = p.wide * 0.5;
  const top = p.y;
  const drop = p.dropHeight;
  const fx = p.faceX || 1, fz = p.faceZ || 0;
  const len = Math.hypot(fx, fz) || 1;
  const dirX = fx / len, dirZ = fz / len;
  const px = -dirZ, pz = dirX;
  const segs = 7;
  const t = state.elapsed;
  for (let i = 0; i < segs; i++) {
    const f0 = i / segs, f1 = (i + 1) / segs;
    const y0 = top - drop * f0, y1 = top - drop * f1;
    const spread = 1 + f0 * 0.5;
    const sway = Math.sin(t * 1.7 + i) * 0.5;
    const cx = p.x + dirX * (1.4 + f0 * 3.2), cz = p.z + dirZ * (1.4 + f0 * 3.2);
    const cx2 = p.x + dirX * (1.4 + f1 * 3.2), cz2 = p.z + dirZ * (1.4 + f1 * 3.2);
    _p[0] = cx - px * w * spread + sway; _p[1] = y0; _p[2] = cz - pz * w * spread;
    _p[3] = cx + px * w * spread + sway; _p[4] = y0; _p[5] = cz + pz * w * spread;
    _p[6] = cx2 + px * w * spread * 1.1; _p[7] = y1; _p[8] = cz2 + pz * w * spread * 1.1;
    _p[9] = cx2 - px * w * spread * 1.1; _p[10] = y1; _p[11] = cz2 - pz * w * spread * 1.1;
    const b = 218 + Math.sin(t * 3 + i * 1.3) * 12;
    const col = cachedRGB(
      lerp(b, atm.fogColor[0], fog), lerp(b + 6, atm.fogColor[1], fog),
      lerp(b + 14, atm.fogColor[2], fog),
    );
    R.poly(_p.subarray(0, 12), col, 0.55 + f0 * 0.35);
  }
  // Plunge mist
  const mistKey = 'rgba(226,236,242,ALPHA)';
  const base = top - drop;
  for (let i = 0; i < 3; i++) {
    const s = Math.sin(t * 0.9 + i * 2.1) * 0.2 + 1;
    R.disc(p.x + dirX * 5, base + 4 + i * 5, p.z + dirZ * 5,
      (w * 2.4 + i * 4) * s, mistKey, (0.34 - i * 0.08) * (1 - fog * 0.6));
  }
}

function drawLighthouse(R, p, atm, fog, state) {
  const h = p.tall;
  emitPrism(R, atm, fog, p.x, p.y, p.z, 5.2, 4.4, 3, 10, 0, [186, 182, 174], false, 0);
  emitPrism(R, atm, fog, p.x, p.y + 3, p.z, 3.4, 2.2, h * 0.72, 12, 0, WHITE, false, 0);
  emitPrism(R, atm, fog, p.x, p.y + 3 + h * 0.30, p.z, 3.05, 2.75, h * 0.13, 12, 0,
    [186, 62, 54], false, 0);
  emitPrism(R, atm, fog, p.x, p.y + 3 + h * 0.72, p.z, 2.6, 2.4, 3.2, 10, 0,
    [56, 62, 72], false, 0);
  emitPrism(R, atm, fog, p.x, p.y + 3 + h * 0.72 + 3.2, p.z, 2.9, 0.4, 2.4, 10, 0,
    [40, 44, 52], false, 0);
  // Rotating beacon
  const beam = 0.55 + 0.45 * Math.sin(state.elapsed * 1.6);
  R.disc(p.x, p.y + 3 + h * 0.72 + 1.6, p.z, 7 + beam * 6,
    'rgba(255,226,150,ALPHA)', (0.5 + beam * 0.5) * (1 - fog * 0.5));
}

function drawCottage(R, p, atm, fog, wide, tall, albedo) {
  emitBox(R, atm, fog, p.x, p.y, p.z, wide, tall, wide * 0.78, p.rot, albedo, 1);
  emitRoof(R, atm, fog, p.x, p.y + tall, p.z, wide * 1.14, wide * 0.9, tall * 0.62,
    p.rot, [122, 74, 62]);
}

function drawVillage(R, p, atm, fog) {
  const n = p.houses || 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + p.rot;
    const rad = 12 + hash3(p.id, i, 3) * 26;
    const q = {
      x: p.x + Math.cos(a) * rad,
      z: p.z + Math.sin(a) * rad,
      y: p.groundY,
      rot: hash3(p.id, i, 5) * TAU,
      id: p.id,
    };
    const c = hash3(p.id, i, 7);
    const albedo = c < 0.4 ? [176, 66, 58] : c < 0.7 ? [222, 214, 200] : [92, 106, 118];
    drawCottage(R, q, atm, fog, 6 + c * 3, 5 + c * 2.5, albedo);
  }
  emitBox(R, atm, fog, p.x, p.y, p.z, 3, 1.2, 22, p.rot + 0.6, [92, 78, 64], 1);
}

function drawArch(R, p, atm, fog) {
  const span = p.wide, h = p.tall;
  const yaw = p.rot;
  const dx = Math.cos(yaw), dz = Math.sin(yaw);
  emitPrism(R, atm, fog, p.x - dx * span * 0.42, p.y, p.z - dz * span * 0.42,
    span * 0.17, span * 0.12, h * 0.62, 7, yaw, ROCK, true, p.id);
  emitPrism(R, atm, fog, p.x + dx * span * 0.42, p.y, p.z + dz * span * 0.42,
    span * 0.17, span * 0.12, h * 0.62, 7, yaw + 1, ROCK, true, p.id + 3);
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const a0 = Math.PI * (i / segs), a1 = Math.PI * ((i + 1) / segs);
    const r = span * 0.42;
    const x0 = p.x - dx * Math.cos(a0) * r, z0 = p.z - dz * Math.cos(a0) * r;
    const y0 = p.y + h * 0.62 + Math.sin(a0) * h * 0.34;
    const x1 = p.x - dx * Math.cos(a1) * r, z1 = p.z - dz * Math.cos(a1) * r;
    const y1 = p.y + h * 0.62 + Math.sin(a1) * h * 0.34;
    const w = span * 0.13;
    const px = -dz * w, pz = dx * w;
    _p[0] = x0 - px; _p[1] = y0; _p[2] = z0 - pz;
    _p[3] = x1 - px; _p[4] = y1; _p[5] = z1 - pz;
    _p[6] = x1 + px; _p[7] = y1; _p[8] = z1 + pz;
    _p[9] = x0 + px; _p[10] = y0; _p[11] = z0 + pz;
    R.poly(_p.subarray(0, 12), lit(ROCK, 0, 0.85, 0.2, atm, fog), 1);
    _p[0] = x0 - px; _p[1] = y0; _p[2] = z0 - pz;
    _p[3] = x1 - px; _p[4] = y1; _p[5] = z1 - pz;
    _p[6] = x1 - px; _p[7] = y1 - span * 0.1; _p[8] = z1 - pz;
    _p[9] = x0 - px; _p[10] = y0 - span * 0.1; _p[11] = z0 - pz;
    R.poly(_p.subarray(0, 12), lit(ROCK, -dz, 0.1, dx, atm, fog), 1);
  }
}

function drawRuins(R, p, atm, fog) {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + p.rot;
    const rad = p.wide * 0.42;
    const hh = p.tall * (0.4 + hash3(p.id, i, 3) * 0.9);
    emitPrism(R, atm, fog, p.x + Math.cos(a) * rad, p.y, p.z + Math.sin(a) * rad,
      1.5, 1.3, hh, 8, 0, [178, 168, 148], false, 0);
  }
  emitBox(R, atm, fog, p.x, p.y, p.z, p.wide * 0.9, 1.4, p.wide * 0.9, p.rot,
    [166, 156, 138], 1);
  emitBox(R, atm, fog, p.x + Math.cos(p.rot) * p.wide * 0.42, p.y,
    p.z + Math.sin(p.rot) * p.wide * 0.42, p.wide * 0.7, p.tall * 0.7, 1.6,
    p.rot + Math.PI / 2, [172, 162, 142], 1);
}

function drawTower(R, p, atm, fog, cabinCol) {
  const legs = 4, spread = p.wide * 0.42, h = p.tall * 0.78;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * TAU + Math.PI / 4 + p.rot;
    emitPrism(R, atm, fog, p.x + Math.cos(a) * spread, p.y, p.z + Math.sin(a) * spread,
      0.5, 0.35, h, 4, 0, DARKWOOD, false, 0);
  }
  emitBox(R, atm, fog, p.x, p.y + h, p.z, p.wide * 1.05, p.tall * 0.2, p.wide * 1.05,
    p.rot, cabinCol, 1);
  emitRoof(R, atm, fog, p.x, p.y + h + p.tall * 0.2, p.z, p.wide * 1.2, p.wide * 1.2,
    p.tall * 0.16, p.rot, [86, 78, 70]);
}

function drawWindmill(R, p, atm, fog, state) {
  const h = p.tall;
  emitPrism(R, atm, fog, p.x, p.y, p.z, 1.5, 0.8, h, 8, 0, [212, 210, 204], false, 0);
  emitBox(R, atm, fog, p.x, p.y + h, p.z, 2.2, 1.8, 3.4, p.rot, [198, 196, 190], 1);
  const spin = state.elapsed * 0.9 + p.phase;
  const yaw = p.rot;
  const dx = Math.cos(yaw), dz = Math.sin(yaw);
  const px = -dz, pz = dx;
  const hubY = p.y + h + 0.9;
  const hubX = p.x + dx * 2, hubZ = p.z + dz * 2;
  for (let i = 0; i < 3; i++) {
    const a = spin + (i / 3) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const bl = p.wide * 0.5;
    const tipX = hubX + px * ca * bl, tipY = hubY + sa * bl, tipZ = hubZ + pz * ca * bl;
    const wpar = 1.1;
    _p[0] = hubX - px * ca * 0.4 - px * sa * wpar;
    _p[1] = hubY - sa * 0.4 + ca * wpar;
    _p[2] = hubZ - pz * ca * 0.4 - pz * sa * wpar;
    _p[3] = hubX - px * ca * 0.4 + px * sa * wpar;
    _p[4] = hubY - sa * 0.4 - ca * wpar;
    _p[5] = hubZ - pz * ca * 0.4 + pz * sa * wpar;
    _p[6] = tipX + px * sa * 0.25; _p[7] = tipY - ca * 0.25; _p[8] = tipZ + pz * sa * 0.25;
    _p[9] = tipX - px * sa * 0.25; _p[10] = tipY + ca * 0.25; _p[11] = tipZ - pz * sa * 0.25;
    R.poly(_p.subarray(0, 12), lit([236, 236, 232], dx, 0.2, dz, atm, fog), 0.95);
  }
}

function drawShipwreck(R, p, atm, fog) {
  const yaw = p.rot;
  emitPrism(R, atm, fog, p.x, p.y - 1.5, p.z, p.wide * 0.34, p.wide * 0.26, p.tall * 0.7,
    7, yaw, [82, 64, 54], true, p.id);
  emitBox(R, atm, fog, p.x, p.y + p.tall * 0.2, p.z, p.wide * 0.3, 2.2, p.wide * 0.18,
    yaw + 0.4, [98, 78, 62], 1);
  emitPrism(R, atm, fog, p.x + Math.cos(yaw) * 3, p.y + p.tall * 0.2,
    p.z + Math.sin(yaw) * 3, 0.5, 0.25, p.tall * 1.5, 5, yaw + 0.35, DARKWOOD, false, 0);
}

function drawCross(R, p, atm, fog) {
  emitPrism(R, atm, fog, p.x, p.y, p.z, 2.6, 2.2, 1.2, 7, 0, ROCK, true, p.id);
  emitBox(R, atm, fog, p.x, p.y + 1.2, p.z, 0.5, p.tall, 0.5, p.rot, [72, 68, 64], 1);
  emitBox(R, atm, fog, p.x, p.y + 1.2 + p.tall * 0.68, p.z, 3.2, 0.45, 0.45, p.rot,
    [72, 68, 64], 1);
}

function drawTarn(R, p, atm, fog) {
  for (let i = 0; i < 7; i++) {
    const a = hash3(p.id, i, 3) * TAU;
    const rad = p.wide * (0.35 + hash3(p.id, i, 5) * 0.5);
    const s = 1.4 + hash3(p.id, i, 7) * 2.6;
    emitPrism(R, atm, fog, p.x + Math.cos(a) * rad, p.groundY - 0.4,
      p.z + Math.sin(a) * rad, s, s * 0.6, s * 0.8, 6, a, ROCK, true, p.id + i);
  }
}

function drawPad(R, p, atm, fog) {
  const r = 6;
  let k = 0;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    _p[k++] = p.x + Math.cos(a) * r;
    _p[k++] = p.y + 0.12;
    _p[k++] = p.z + Math.sin(a) * r;
  }
  R.poly(_p.subarray(0, k), lit([44, 48, 54], 0, 1, 0, atm, fog), 0.92);
  k = 0;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    _p[k++] = p.x + Math.cos(a) * r * 0.72;
    _p[k++] = p.y + 0.16;
    _p[k++] = p.z + Math.sin(a) * r * 0.72;
  }
  R.poly(_p.subarray(0, k), lit([228, 214, 96], 0, 1, 0, atm, fog), 0.95);
  emitBox(R, atm, fog, p.x, p.y + 0.17, p.z, 1.0, 0.03, 5.2, p.rot, [30, 32, 36], 1);
  emitBox(R, atm, fog, p.x, p.y + 0.17, p.z, 4.0, 0.03, 1.0, p.rot, [30, 32, 36], 1);
}

function drawVista(R, p, atm, fog, state) {
  if (!p.discovered) return;
  for (let i = 0; i < 5; i++) {
    const s = 1.6 - i * 0.26;
    emitPrism(R, atm, fog, p.x, p.groundY + i * 0.8, p.z, s, s * 0.8, 0.85, 6,
      i * 0.7, ROCK, true, p.id + i);
  }
  const pulse = 0.5 + 0.5 * Math.sin(state.elapsed * 2);
  R.disc(p.x, p.groundY + 5, p.z, 5 + pulse * 3, 'rgba(255,214,120,ALPHA)',
    (0.35 + pulse * 0.3) * (p.photographed ? 0.25 : 1));
}

/** Birds and deer: cheap animated sprites drawn in depth order. */
function drawWildlife(R, p, atm, fog, state) {
  const flock = p.flock || 1;
  const flap = state.elapsed * (p.flying ? 7 : 2) + p.phase;
  const albedo = p.flying ? [46, 42, 40] : [128, 88, 58];
  const fc = atm.fogColor;
  const shade = clamp01(atm.sunIntensity * 0.5 + atm.ambientIntensity * 0.6);
  const col = cachedRGB(
    lerp(albedo[0] * shade, fc[0], fog),
    lerp(albedo[1] * shade, fc[1], fog),
    lerp(albedo[2] * shade, fc[2], fog),
  );
  for (let i = 0; i < flock; i++) {
    const ox = (hash3(p.id, i, 3) - 0.5) * (p.flying ? 26 : 12);
    const oz = (hash3(p.id, i, 5) - 0.5) * (p.flying ? 26 : 12);
    const oy = (hash3(p.id, i, 7) - 0.5) * (p.flying ? 12 : 0);
    const size = p.flying ? 2.6 : 2.0;
    R.sprite(p.x + ox, p.y + oy, p.z + oz, size, p.flying ? drawBirdSprite : drawDeerSprite,
      { col, phase: flap + i * 1.7 });
  }
}

function drawBirdSprite(ctx, it) {
  const s = it.c;
  if (s < 0.8) return;
  const x = it.a, y = it.b;
  const f = Math.sin(it.data.phase);
  ctx.strokeStyle = it.data.col;
  ctx.lineWidth = Math.max(0.8, s * 0.16);
  ctx.beginPath();
  ctx.moveTo(x - s, y + f * s * 0.42);
  ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.28, x, y);
  ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.28, x + s, y + f * s * 0.42);
  ctx.stroke();
}

function drawDeerSprite(ctx, it) {
  const s = it.c;
  if (s < 1.2) return;
  const x = it.a, y = it.b;
  ctx.fillStyle = it.data.col;
  ctx.fillRect(x - s * 0.5, y - s * 0.72, s, s * 0.42);
  ctx.fillRect(x - s * 0.42, y - s * 0.34, s * 0.14, s * 0.34);
  ctx.fillRect(x + s * 0.3, y - s * 0.34, s * 0.14, s * 0.34);
  ctx.fillRect(x + s * 0.34, y - s * 1.05, s * 0.2, s * 0.4);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.4, y - s * 1.05);
  ctx.lineTo(x + s * 0.62, y - s * 1.42);
  ctx.moveTo(x + s * 0.4, y - s * 1.05);
  ctx.lineTo(x + s * 0.18, y - s * 1.4);
  ctx.strokeStyle = it.data.col;
  ctx.lineWidth = Math.max(0.7, s * 0.1);
  ctx.stroke();
}

export function emitLandmark(R, p, atm, state) {
  const cam = R.cam;
  const dist = Math.hypot(p.x - cam.pos.x, p.y - cam.pos.y, p.z - cam.pos.z);
  const fog = atm.fogAmount(dist);
  if (fog > 0.985) return;
  switch (p.kind) {
    case 'waterfall': drawWaterfall(R, p, atm, fog, state); break;
    case 'lighthouse': drawLighthouse(R, p, atm, fog, state); break;
    case 'cottage': drawCottage(R, p, atm, fog, 8, 5.5, [216, 206, 190]); break;
    case 'alpine_hut': drawCottage(R, p, atm, fog, 10, 5, [140, 100, 72]); break;
    case 'village': drawVillage(R, p, atm, fog); break;
    case 'arch': drawArch(R, p, atm, fog); break;
    case 'ruins': drawRuins(R, p, atm, fog); break;
    case 'fire_tower': drawTower(R, p, atm, fog, [128, 96, 70]); break;
    case 'cable_tower': drawTower(R, p, atm, fog, [92, 96, 102]); break;
    case 'windmill': drawWindmill(R, p, atm, fog, state); break;
    case 'shipwreck': drawShipwreck(R, p, atm, fog); break;
    case 'summit_cross': drawCross(R, p, atm, fog); break;
    case 'tarn': drawTarn(R, p, atm, fog); break;
    case 'pad': drawPad(R, p, atm, fog); break;
    case 'vista': drawVista(R, p, atm, fog, state); break;
    case 'sea_stack':
      emitPrism(R, atm, fog, p.x, p.y - 2, p.z, p.wide * 0.5, p.wide * 0.22,
        p.tall, 7, p.rot, ROCK, true, p.id);
      break;
    case 'hoodoo':
      emitPrism(R, atm, fog, p.x, p.y, p.z, p.wide * 0.36, p.wide * 0.18,
        p.tall * 0.6, 6, p.rot, [162, 104, 70], true, p.id);
      emitPrism(R, atm, fog, p.x, p.y + p.tall * 0.6, p.z, p.wide * 0.30,
        p.wide * 0.42, p.tall * 0.4, 6, p.rot + 0.7, [186, 126, 84], true, p.id + 1);
      break;
    default:
      if (p.category === 'wildlife') drawWildlife(R, p, atm, fog, state);
      break;
  }
}

// ── Aircraft ────────────────────────────────────────────────────────────────
/** Airframe scale in metres per model unit — an Inspire-class cinema drone. */
const AIRFRAME = 1.7;

const _bv = { x: 0, y: 0, z: 0 };
const _bo = { x: 0, y: 0, z: 0 };

/** Body-space point → world. */
function xf(d, lx, ly, lz, out) {
  _bv.x = lx * AIRFRAME; _bv.y = ly * AIRFRAME; _bv.z = lz * AIRFRAME;
  bodyToWorld(out, _bv, d.yaw, d.pitch, d.roll);
  out.x += d.pos.x; out.y += d.pos.y; out.z += d.pos.z;
  return out;
}

/** Body-space direction → world (no translation). */
function xfDir(d, lx, ly, lz, out) {
  _bv.x = lx; _bv.y = ly; _bv.z = lz;
  return bodyToWorld(out, _bv, d.yaw, d.pitch, d.roll);
}

const BOX_FACES = [
  { n: [1, 0, 0], c: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, -1, 0], c: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]] },
];

/**
 * A body-space box, optionally spun about the airframe's own Y axis, shaded
 * with real per-face normals so the aircraft reads as a solid object.
 */
function boxLocal(R, d, atm, fog, cx, cy, cz, hx, hy, hz, spin, albedo, alpha) {
  const cs = Math.cos(spin || 0), sn = Math.sin(spin || 0);
  for (const f of BOX_FACES) {
    // Face normal, spun then transformed to world.
    const lnx = f.n[0] * cs + f.n[2] * sn;
    const lnz = -f.n[0] * sn + f.n[2] * cs;
    xfDir(d, lnx, f.n[1], lnz, _bo);
    const wnx = _bo.x, wny = _bo.y, wnz = _bo.z;

    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < 4; i++) {
      const ox = f.c[i][0] * hx, oy = f.c[i][1] * hy, oz = f.c[i][2] * hz;
      const rx = ox * cs + oz * sn;
      const rz = -ox * sn + oz * cs;
      xf(d, cx + rx, cy + oy, cz + rz, _a);
      _p[i * 3] = _a.x; _p[i * 3 + 1] = _a.y; _p[i * 3 + 2] = _a.z;
      mx += _a.x; my += _a.y; mz += _a.z;
    }
    mx /= 4; my /= 4; mz /= 4;
    if ((mx - R.cam.pos.x) * wnx + (my - R.cam.pos.y) * wny + (mz - R.cam.pos.z) * wnz > 0) continue;
    R.poly(_p.subarray(0, 12), lit(albedo, wnx, wny, wnz, atm, fog), alpha === undefined ? 1 : alpha);
  }
}

const _a = { x: 0, y: 0, z: 0 };

export function emitDrone(R, d, atm, state) {
  const dist = Math.hypot(d.pos.x - R.cam.pos.x, d.pos.y - R.cam.pos.y, d.pos.z - R.cam.pos.z);
  const fog = atm.fogAmount(dist);
  const SHELL = [176, 180, 188];
  const DARK = [46, 50, 58];
  const ARM = [96, 100, 110];

  // Fuselage, with a darker nose cowl.
  boxLocal(R, d, atm, fog, 0, 0, -0.02, 0.17, 0.085, 0.30, 0, SHELL);
  boxLocal(R, d, atm, fog, 0, 0.005, 0.26, 0.12, 0.065, 0.10, 0, DARK);
  // Battery hump
  boxLocal(R, d, atm, fog, 0, 0.10, -0.06, 0.12, 0.045, 0.18, 0, DARK);

  // Arms, motors and blurred propeller discs.
  const arms = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const reach = 0.40;
  for (const [sx, sz] of arms) {
    const ax = sx * reach, az = sz * reach;
    const spin = Math.atan2(sx, sz);
    boxLocal(R, d, atm, fog, ax * 0.55, 0.01, az * 0.55, 0.035, 0.030,
      reach * 0.62, spin, ARM);
    boxLocal(R, d, atm, fog, ax, 0.055, az, 0.055, 0.055, 0.055, 0, DARK);

    const seg = 12, r = 0.30;
    let k = 0;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU;
      xf(d, ax + Math.cos(a) * r, 0.115, az + Math.sin(a) * r, _a);
      _p[k++] = _a.x; _p[k++] = _a.y; _p[k++] = _a.z;
    }
    xfDir(d, 0, 1, 0, _bo);
    R.poly(_p.subarray(0, k), lit([228, 234, 244], _bo.x, _bo.y, _bo.z, atm, fog), 0.16);
    // A brighter arc suggests the blade sweep.
    k = 0;
    const phase = state.elapsed * 22 + sx * 1.7 + sz * 0.9;
    for (let i = 0; i < 5; i++) {
      const a = phase + (i / 12) * TAU;
      xf(d, ax + Math.cos(a) * r * 0.96, 0.12, az + Math.sin(a) * r * 0.96, _a);
      _p[k++] = _a.x; _p[k++] = _a.y; _p[k++] = _a.z;
    }
    for (let i = 4; i >= 0; i--) {
      const a = phase + (i / 12) * TAU;
      xf(d, ax + Math.cos(a) * r * 0.42, 0.12, az + Math.sin(a) * r * 0.42, _a);
      _p[k++] = _a.x; _p[k++] = _a.y; _p[k++] = _a.z;
    }
    R.poly(_p.subarray(0, k), 'rgba(236,242,252,0.20)', 1);
  }

  // Landing skids.
  boxLocal(R, d, atm, fog, -0.20, -0.17, 0, 0.022, 0.022, 0.26, 0, DARK);
  boxLocal(R, d, atm, fog, 0.20, -0.17, 0, 0.022, 0.022, 0.26, 0, DARK);
  boxLocal(R, d, atm, fog, -0.13, -0.10, 0.10, 0.016, 0.075, 0.016, 0, DARK);
  boxLocal(R, d, atm, fog, 0.13, -0.10, 0.10, 0.016, 0.075, 0.016, 0, DARK);
  boxLocal(R, d, atm, fog, -0.13, -0.10, -0.10, 0.016, 0.075, 0.016, 0, DARK);
  boxLocal(R, d, atm, fog, 0.13, -0.10, -0.10, 0.016, 0.075, 0.016, 0, DARK);

  // Gimbal head, pitched by the actual gimbal angle.
  const gp = d.gimbalPitch;
  const gy = -0.155 + Math.sin(gp) * 0.02;
  boxLocal(R, d, atm, fog, 0, -0.115, 0.20, 0.035, 0.045, 0.035, 0, DARK);
  boxLocal(R, d, atm, fog, 0, gy, 0.235, 0.075, 0.062, 0.075, 0, [136, 142, 152]);
  boxLocal(R, d, atm, fog, 0, gy + Math.sin(gp) * 0.05, 0.235 + 0.055,
    0.045, 0.045, 0.028, 0, [14, 18, 26]);

  // Navigation lights.
  const blink = (state.elapsed * 2) % 1 < 0.55 ? 1 : 0.22;
  // Port red, starboard green, as on any aircraft.
  boxLocal(R, d, atm, fog, -0.155, -0.02, -0.30, 0.028, 0.018, 0.028, 0,
    [255, 60, 60], 0.35 + blink * 0.65);
  boxLocal(R, d, atm, fog, 0.155, -0.02, -0.30, 0.028, 0.018, 0.028, 0,
    [40, 255, 130], 0.35 + blink * 0.65);
  boxLocal(R, d, atm, fog, 0, -0.02, 0.30, 0.024, 0.016, 0.024, 0,
    [255, 255, 255], 0.3 + blink * 0.5);
}

export function emitGate(R, g, isNext, state) {
  const segs = 30;
  const pts = new Float32Array((segs + 1) * 3);
  const rx = Math.cos(g.yaw), rz = -Math.sin(g.yaw);
  const pulse = 0.5 + 0.5 * Math.sin(state.elapsed * 2.4 + g.phase);
  const r = g.radius * (isNext ? 1 + pulse * 0.02 : 1);
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * TAU;
    pts[i * 3] = g.x + rx * Math.cos(a) * r;
    pts[i * 3 + 1] = g.y + Math.sin(a) * r;
    pts[i * 3 + 2] = g.z + rz * Math.cos(a) * r;
  }
  const dist = Math.hypot(g.x - R.cam.pos.x, g.y - R.cam.pos.y, g.z - R.cam.pos.z);
  const lw = clamp(220 / Math.max(12, dist), 1.2, 9);
  const color = g.passed
    ? 'rgba(96,220,140,0.5)'
    : isNext
      ? 'rgba(120,226,255,' + (0.7 + pulse * 0.3).toFixed(2) + ')'
      : 'rgba(200,214,230,0.42)';
  R.ring(pts, color, lw, 1);
  if (isNext && !g.passed) {
    R.disc(g.x, g.y, g.z, g.radius * 0.5, 'rgba(120,226,255,ALPHA)', 0.10 + pulse * 0.08);
  }
}
