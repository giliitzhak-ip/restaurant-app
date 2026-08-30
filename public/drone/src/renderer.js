/**
 * renderer.js — software 3D renderer on a 2D canvas.
 *
 * Pipeline per frame:
 *   1. sky gradient, stars/aurora, sun, cloud layer
 *   2. terrain built as nested LOD rings (a clipmap) around the camera,
 *      shaded analytically and fogged
 *   3. props (trees, landmarks, wildlife, gates, the aircraft itself) emitted
 *      as polygons into the same list
 *   4. one depth sort, one flush
 *   5. post: sun bloom, lens flare, grade, grain, vignette
 *
 * The renderer owns no game state; everything arrives through render(state).
 */
'use strict';

import {
  clamp, clamp01, lerp, smoothstep, cachedRGB, rgba, hash3, TAU,
} from './math.js';
import { emitLandmark, emitDrone, emitGate, TREE_STYLES } from './props.js';

export const QUALITY = {
  low: { N: 16, base: 8, levels: 6, treeRange: 240, maxTrees: 320, maxDpr: 1.0, label: 'Low' },
  medium: { N: 22, base: 6, levels: 6, treeRange: 330, maxTrees: 620, maxDpr: 1.25, label: 'Medium' },
  high: { N: 28, base: 5, levels: 7, treeRange: 430, maxTrees: 1000, maxDpr: 1.5, label: 'High' },
};

/** Half-pixel overdraw that hides seams between adjacent terrain quads. */
const SEAM = 0.6;

const T_POLY = 0;
const T_DISC = 1;
const T_RING = 2;
const T_SPRITE = 3;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.w = 1; this.h = 1;

    this.pool = [];
    this.poolIdx = 0;
    this.items = [];

    this.quality = QUALITY.medium;

    // Scratch buffers for LOD levels.
    this.grids = [];
    this._vx = new Float32Array(16);
    this._vy = new Float32Array(16);
    this._vz = new Float32Array(16);
    this._cx = new Float32Array(16);
    this._cy = new Float32Array(16);
    this._cz = new Float32Array(16);

    this._gradCache = new Map();
    this._stars = this._makeStars(220);
    this._grain = this._makeGrain();
    this._col = [0, 0, 0];
    this.stats = { quads: 0, props: 0, items: 0 };
  }

  setQuality(q) {
    this.quality = QUALITY[q] || QUALITY.medium;
    this.grids = [];
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  _makeStars(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = hash3(i, 1, 3) * 2 - 1;
      const a = hash3(i, 2, 5) * TAU;
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      const y = Math.abs(u) * 0.98 + 0.02;
      out.push({
        x: Math.cos(a) * r, y, z: Math.sin(a) * r,
        m: 0.35 + hash3(i, 3, 7) * 0.65,
        tw: hash3(i, 4, 11) * TAU,
      });
    }
    return out;
  }

  _makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Radial gradient cached at the origin; drawn via transform. */
  _softGrad(color) {
    let g = this._gradCache.get(color);
    if (!g) {
      const ctx = this.ctx;
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, color.replace('ALPHA', '0.95'));
      g.addColorStop(0.45, color.replace('ALPHA', '0.55'));
      g.addColorStop(0.78, color.replace('ALPHA', '0.16'));
      g.addColorStop(1, color.replace('ALPHA', '0'));
      this._gradCache.set(color, g);
    }
    return g;
  }

  softDisc(x, y, r, color, alpha) {
    if (r < 0.5 || alpha <= 0.004) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(r, r);
    ctx.fillStyle = this._softGrad(color);
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  // ── Draw-item pool ────────────────────────────────────────────────────────
  _item() {
    let it = this.pool[this.poolIdx];
    if (!it) {
      it = {
        d: 0, t: T_POLY, n: 0,
        xs: new Float32Array(14), ys: new Float32Array(14),
        fill: '#000', stroke: null, lw: 1, alpha: 1,
        a: 0, b: 0, c: 0, e: 0, data: null,
      };
      this.pool.push(it);
    }
    this.poolIdx++;
    it.stroke = null; it.alpha = 1; it.data = null;
    this.items.push(it);
    return it;
  }

  // ── Emitter API used by props.js ──────────────────────────────────────────
  /** pts: flat [x,y,z, ...] in world space. Returns the item or null. */
  poly(pts, color, alpha = 1, stroke = null, lw = 1) {
    const cam = this.cam;
    const n = pts.length / 3;
    if (n < 3 || n > 12) return null;
    const vx = this._vx, vy = this._vy, vz = this._vz;
    let behind = 0, sum = 0;
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 3] - cam.pos.x;
      const dy = pts[i * 3 + 1] - cam.pos.y;
      const dz = pts[i * 3 + 2] - cam.pos.z;
      vx[i] = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
      vy[i] = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
      vz[i] = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
      if (vz[i] <= cam.near) behind++;
      sum += vz[i];
    }
    if (behind === n) return null;
    let count = n;
    let sx = vx, sy = vy, sz = vz;
    if (behind > 0) {
      count = this._clipNear(vx, vy, vz, n);
      if (count < 3) return null;
      sx = this._cx; sy = this._cy; sz = this._cz;
    }
    const it = this._item();
    it.t = T_POLY;
    it.n = count;
    it.fill = color;
    it.alpha = alpha;
    it.stroke = stroke;
    it.lw = lw;
    let minZ = 1e9, mx = 0, my = 0;
    for (let i = 0; i < count; i++) {
      const inv = cam.scale / sz[i];
      const px2 = cam.cx + sx[i] * inv;
      const py2 = cam.cy - sy[i] * inv;
      it.xs[i] = px2; it.ys[i] = py2;
      mx += px2; my += py2;
      if (sz[i] < minZ) minZ = sz[i];
    }
    mx /= count; my /= count;
    for (let i = 0; i < count; i++) {
      const ex = it.xs[i] - mx, ey = it.ys[i] - my;
      const l = Math.sqrt(ex * ex + ey * ey);
      if (l > 0.001) {
        const k = 0.4 / l;
        it.xs[i] += ex * k;
        it.ys[i] += ey * k;
      }
    }
    it.d = sum / n;
    if (it.d < minZ) it.d = minZ;
    return it;
  }

  /** World-space soft sphere (mist, glow, cloud puff). */
  disc(x, y, z, radius, color, alpha = 1) {
    const cam = this.cam;
    const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
    const vz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
    if (vz <= cam.near) return null;
    const vx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
    const vy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
    const inv = cam.scale / vz;
    const it = this._item();
    it.t = T_DISC;
    it.a = cam.cx + vx * inv;
    it.b = cam.cy - vy * inv;
    it.c = radius * inv;
    it.fill = color;
    it.alpha = alpha;
    it.d = vz;
    if (it.c < 0.4) { this.items.pop(); this.poolIdx--; return null; }
    return it;
  }

  /** Screen-space sprite callback drawn in depth order (birds, small props). */
  sprite(x, y, z, scale, drawFn, data) {
    const cam = this.cam;
    const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
    const vz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
    if (vz <= cam.near) return null;
    const vx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
    const vy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
    const inv = cam.scale / vz;
    const it = this._item();
    it.t = T_SPRITE;
    it.a = cam.cx + vx * inv;
    it.b = cam.cy - vy * inv;
    it.c = scale * inv;
    it.d = vz;
    it.data = data;
    it.fill = drawFn;
    return it;
  }

  /** Depth-sorted polyline (gates). pts is flat world-space. */
  ring(pts, color, lw, alpha) {
    const cam = this.cam;
    const n = pts.length / 3;
    const it = this._item();
    it.t = T_RING;
    it.fill = color;
    it.alpha = alpha;
    it.lw = lw;
    let k = 0, sum = 0, ok = 0;
    const xs = [], ys = [];
    for (let i = 0; i < n; i++) {
      const dx = pts[i * 3] - cam.pos.x;
      const dy = pts[i * 3 + 1] - cam.pos.y;
      const dz = pts[i * 3 + 2] - cam.pos.z;
      const vz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
      if (vz <= cam.near) { xs.push(NaN); ys.push(NaN); continue; }
      const vx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
      const vy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
      const inv = cam.scale / vz;
      xs.push(cam.cx + vx * inv);
      ys.push(cam.cy - vy * inv);
      sum += vz; ok++;
    }
    if (!ok) { this.items.pop(); this.poolIdx--; return null; }
    it.data = { xs, ys };
    it.d = sum / ok;
    it.n = n;
    return it;
  }

  /** Sutherland–Hodgman against the single near plane, in view space. */
  _clipNear(vx, vy, vz, n) {
    const near = this.cam.near;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const zi = vz[i], zj = vz[j];
      const ini = zi > near, inj = zj > near;
      if (ini) {
        this._cx[count] = vx[i]; this._cy[count] = vy[i]; this._cz[count] = zi; count++;
      }
      if (ini !== inj) {
        const t = (near - zi) / (zj - zi);
        this._cx[count] = vx[i] + (vx[j] - vx[i]) * t;
        this._cy[count] = vy[i] + (vy[j] - vy[i]) * t;
        this._cz[count] = near;
        count++;
      }
      if (count > 13) break;
    }
    return count;
  }

  // ── Frame ────────────────────────────────────────────────────────────────
  render(state) {
    const ctx = this.ctx;
    this.cam = state.camera;
    this.atm = state.atmosphere;
    this.world = state.world;
    this.state = state;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineJoin = 'round';

    this.poolIdx = 0;
    this.items.length = 0;

    this._drawSky();
    this._buildTerrain();
    this._buildProps();
    this._flush();
    this._post();

    this.stats.items = this.items.length;
  }

  // ── Sky ──────────────────────────────────────────────────────────────────
  _horizonY() {
    const cam = this.cam;
    return cam.cy + Math.tan(cam.pitch) * cam.scale;
  }

  _drawSky() {
    const ctx = this.ctx, cam = this.cam, atm = this.atm;
    const w = this.w, h = this.h;
    const diag = Math.hypot(w, h) * 1.2;
    const hy = this._horizonY();

    ctx.save();
    ctx.translate(cam.cx, cam.cy);
    ctx.rotate(-cam.roll);
    ctx.translate(-cam.cx, -cam.cy);

    const top = hy - diag;
    const g = ctx.createLinearGradient(0, top, 0, hy + diag * 0.35);
    const z = atm.zenith, ho = atm.horizon, bd = atm.band, fg = atm.fogColor;
    g.addColorStop(0, cachedRGB(z[0] * 0.72, z[1] * 0.75, z[2] * 0.86));
    g.addColorStop(0.5, cachedRGB(z[0], z[1], z[2]));
    g.addColorStop(0.72, cachedRGB(lerp(z[0], ho[0], 0.55), lerp(z[1], ho[1], 0.55), lerp(z[2], ho[2], 0.55)));
    g.addColorStop(0.735, cachedRGB(bd[0], bd[1], bd[2]));
    g.addColorStop(0.7405, cachedRGB(ho[0], ho[1], ho[2]));
    g.addColorStop(0.75, cachedRGB(fg[0], fg[1], fg[2]));
    g.addColorStop(1, cachedRGB(fg[0] * 0.72, fg[1] * 0.74, fg[2] * 0.8));
    ctx.fillStyle = g;
    ctx.fillRect(cam.cx - diag, top, diag * 2, diag * 1.35 + (hy - top));
    ctx.restore();

    if (atm.starStrength > 0.02) this._drawStars();
    if (atm.auroraStrength > 0.02) this._drawAurora();
    this._drawSun();
    this._drawClouds();
  }

  _drawStars() {
    const ctx = this.ctx, cam = this.cam, atm = this.atm;
    const t = this.state.elapsed || 0;
    ctx.save();
    for (const s of this._stars) {
      const vz = s.x * cam.fwd.x + s.y * cam.fwd.y + s.z * cam.fwd.z;
      if (vz <= 0.05) continue;
      const vx = s.x * cam.right.x + s.y * cam.right.y + s.z * cam.right.z;
      const vy = s.x * cam.up.x + s.y * cam.up.y + s.z * cam.up.z;
      const inv = cam.scale / vz;
      const px = cam.cx + vx * inv, py = cam.cy - vy * inv;
      if (px < -20 || py < -20 || px > this.w + 20 || py > this.h + 20) continue;
      const tw = 0.75 + 0.25 * Math.sin(t * 2.2 + s.tw);
      const a = atm.starStrength * s.m * tw;
      const r = s.m * 1.5;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#eaf2ff';
      ctx.fillRect(px - r / 2, py - r / 2, r, r);
    }
    ctx.restore();
  }

  _drawAurora() {
    const ctx = this.ctx, cam = this.cam, atm = this.atm;
    const t = this.state.elapsed || 0;
    const hy = this._horizonY();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cam.cx, cam.cy);
    ctx.rotate(-cam.roll);
    ctx.translate(-cam.cx, -cam.cy);
    const bands = 4;
    for (let b = 0; b < bands; b++) {
      const phase = t * (0.09 + b * 0.03) + b * 2.1;
      const baseY = hy - this.h * (0.22 + b * 0.11);
      const g = ctx.createLinearGradient(0, baseY - this.h * 0.3, 0, baseY + this.h * 0.16);
      const hue = b % 2 === 0 ? [110, 240, 180] : [130, 170, 250];
      g.addColorStop(0, rgba(hue[0], hue[1], hue[2], 0));
      g.addColorStop(0.55, rgba(hue[0], hue[1], hue[2], 0.10 * atm.auroraStrength));
      g.addColorStop(1, rgba(hue[0], hue[1], hue[2], 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      const steps = 26;
      ctx.moveTo(-this.w * 0.4, baseY + this.h * 0.16);
      for (let i = 0; i <= steps; i++) {
        const x = -this.w * 0.4 + (this.w * 1.8 * i) / steps;
        const y = baseY + Math.sin(i * 0.5 + phase) * this.h * 0.045 +
          Math.sin(i * 0.17 - phase * 1.7) * this.h * 0.03;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(this.w * 1.4, baseY + this.h * 0.16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _sunScreen() {
    const cam = this.cam, s = this.atm.sunDir;
    const vz = s.x * cam.fwd.x + s.y * cam.fwd.y + s.z * cam.fwd.z;
    if (vz <= 0.02) return null;
    const vx = s.x * cam.right.x + s.y * cam.right.y + s.z * cam.right.z;
    const vy = s.x * cam.up.x + s.y * cam.up.y + s.z * cam.up.z;
    const inv = cam.scale / vz;
    return { x: cam.cx + vx * inv, y: cam.cy - vy * inv, z: vz };
  }

  _drawSun() {
    const p = this._sunScreen();
    this._sunPos = p;
    if (!p) return;
    const atm = this.atm;
    if (atm.night > 0.75) {
      // Moon
      const c = 'rgba(226,232,246,ALPHA)';
      this.softDisc(p.x, p.y, 44, c, 0.5);
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#e8eefc';
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    const s = atm.sunColor;
    const key = 'rgba(' + (s[0] | 0) + ',' + (s[1] | 0) + ',' + (s[2] | 0) + ',ALPHA)';
    const haze = 1 - clamp01(atm.weather.cloudCover * 0.7 + smoothstep(0.8, 2.2, atm.fogDensity) * 0.5);
    const size = lerp(120, 320, clamp01(1 - atm.time.elev / 40));
    this.softDisc(p.x, p.y, size, key, 0.30 * haze + 0.08);
    this.softDisc(p.x, p.y, size * 0.34, key, 0.42 * haze + 0.08);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8 * haze;
    ctx.fillStyle = cachedRGB(255, lerp(240, 255, clamp01(atm.time.elev / 30)), 235);
    ctx.beginPath();
    ctx.arc(p.x, p.y, lerp(16, 9, clamp01(atm.time.elev / 40)), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  _drawClouds() {
    const world = this.world, atm = this.atm;
    if (!world) return;
    const lit = [
      lerp(250, atm.sunColor[0], 0.45),
      lerp(250, atm.sunColor[1], 0.45),
      lerp(252, atm.sunColor[2], 0.45),
    ];
    const shade = [
      lerp(atm.zenith[0], atm.fogColor[0], 0.5) * 0.9,
      lerp(atm.zenith[1], atm.fogColor[1], 0.5) * 0.9,
      lerp(atm.zenith[2], atm.fogColor[2], 0.5) * 0.95,
    ];
    const cam = this.cam;
    // Cloud puffs are large alpha fills; keep the per-frame budget bounded.
    let budget = this.quality === QUALITY.low ? 90 : this.quality === QUALITY.medium ? 170 : 260;
    for (const c of world.clouds) {
      if (budget <= 0) break;
      const dx = c.x - cam.pos.x, dz = c.z - cam.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 6400) continue;
      const dy = c.y - cam.pos.y;
      const vz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
      if (vz <= 8) continue;
      const vx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
      const vy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
      const inv = cam.scale / vz;
      const sx = cam.cx + vx * inv, sy = cam.cy - vy * inv;
      const r = c.r * inv;
      if (r < 3) continue;
      if (sx < -r * 3 || sx > this.w + r * 3 || sy < -r * 3 || sy > this.h + r * 3) continue;
      const fade = 1 - smoothstep(4200, 6400, dist);
      for (let p = 0; p < c.puffs; p++) {
        const hx = hash3(c.seed, p, 1) - 0.5;
        const hy2 = hash3(c.seed, p, 2) - 0.5;
        const hr = 0.45 + hash3(c.seed, p, 3) * 0.75;
        const t = p / Math.max(1, c.puffs - 1);
        const col = [
          lerp(shade[0], lit[0], 0.35 + t * 0.65),
          lerp(shade[1], lit[1], 0.35 + t * 0.65),
          lerp(shade[2], lit[2], 0.35 + t * 0.65),
        ];
        const key = 'rgba(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ',ALPHA)';
        this.softDisc(
          sx + hx * r * 1.5, sy + hy2 * r * 0.55,
          r * hr, key, c.alpha * fade * 0.85,
        );
        budget--;
      }
    }
  }

  // ── Terrain clipmap ──────────────────────────────────────────────────────
  _grid(level, n) {
    let g = this.grids[level];
    const need = (n + 1) * (n + 1);
    if (!g || g.h.length < need) {
      g = { h: new Float32Array(need) };
      this.grids[level] = g;
    }
    return g;
  }

  _buildTerrain() {
    const cam = this.cam, atm = this.atm, world = this.world;
    if (!world) return;
    const terrain = world.terrain;
    const q = this.quality;
    const N = q.N;
    const water = terrain.waterLevel;
    const sun = atm.sunDir;
    const gain = atm.exposureGain;
    const sunI = atm.sunIntensity * gain;
    const ambI = atm.ambientIntensity * gain;
    const lc = atm.lightColor, ac = atm.ambientColor, fc = atm.fogColor;
    const pal = terrain.palette;
    const alb = this._col;
    let quads = 0;

    const tanH = Math.tan(cam.hfov * 0.5) * 1.25 + 0.25;
    const tanV = Math.tan(cam.vfov * 0.5) * 1.35 + 0.3;
    const maxDist = atm.visibility * 1.35;

    let prevMinX = 0, prevMaxX = 0, prevMinZ = 0, prevMaxZ = 0, hasPrev = false;

    for (let level = 0; level < q.levels; level++) {
      const step = q.base * Math.pow(2, level);
      const snap = step * 2;
      const ox = Math.round(cam.pos.x / snap) * snap - (N / 2) * step;
      const oz = Math.round(cam.pos.z / snap) * snap - (N / 2) * step;
      const half = (N / 2) * step;
      const cxc = ox + half, czc = oz + half;

      if (Math.hypot(cxc - cam.pos.x, czc - cam.pos.z) - half * 1.45 > maxDist) {
        hasPrev = true;
        prevMinX = ox; prevMaxX = ox + N * step;
        prevMinZ = oz; prevMaxZ = oz + N * step;
        continue;
      }

      const grid = this._grid(level, N).h;
      for (let j = 0; j <= N; j++) {
        const z = oz + j * step;
        const row = j * (N + 1);
        for (let i = 0; i <= N; i++) {
          grid[row + i] = terrain.height(ox + i * step, z);
        }
      }

      const inv2step = 1 / (2 * step);
      for (let j = 0; j < N; j++) {
        const z0 = oz + j * step, z1 = z0 + step;
        const r0 = j * (N + 1), r1 = r0 + (N + 1);
        for (let i = 0; i < N; i++) {
          const x0 = ox + i * step, x1 = x0 + step;
          if (hasPrev && x0 >= prevMinX - 0.01 && x1 <= prevMaxX + 0.01 &&
              z0 >= prevMinZ - 0.01 && z1 <= prevMaxZ + 0.01) continue;

          const h00 = grid[r0 + i], h10 = grid[r0 + i + 1];
          const h01 = grid[r1 + i], h11 = grid[r1 + i + 1];
          const hAvg = (h00 + h10 + h01 + h11) * 0.25;
          const hMin = Math.min(h00, h10, h01, h11);
          const hMax = Math.max(h00, h10, h01, h11);

          const mx = x0 + step * 0.5, mz = z0 + step * 0.5;
          const dx = mx - cam.pos.x, dz = mz - cam.pos.z;
          const dy = Math.max(water, hAvg) - cam.pos.y;
          const dist = Math.hypot(dx, dz);
          if (dist > maxDist) continue;

          const vzc = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
          const rad = step * 0.95 + (hMax - hMin) * 0.6;
          if (vzc < -rad) continue;
          const vxc = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
          if (Math.abs(vxc) > vzc * tanH + rad * 1.6) continue;
          const vyc = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
          if (Math.abs(vyc) > vzc * tanV + rad * 1.8 + (hMax - hMin)) continue;

          const submerged = hMax < water;
          const fogH = Math.exp(-Math.max(0, hAvg - water) / 340);
          let fog = atm.fogAmount(Math.hypot(dist, dy)) * (0.42 + 0.58 * fogH);
          if (fog > 0.965) fog = 0.965;

          if (!submerged) {
            // Surface normal straight from the cell's own corners.
            const nx = (h00 + h01 - h10 - h11) * inv2step;
            const nz = (h00 + h10 - h01 - h11) * inv2step;
            let nl = Math.sqrt(nx * nx + nz * nz + 1);
            const nX = nx / nl, nY = 1 / nl, nZ = nz / nl;
            const slope = 1 - nY;

            terrain.shade(mx, mz, hAvg, slope, alb);

            let lambert = nX * sun.x + nY * sun.y + nZ * sun.z;
            lambert = lambert < 0 ? 0 : lambert;
            const wrap = (lambert * 0.86 + 0.14);

            // Cheap curvature AO from neighbouring grid samples.
            let ao = 1;
            if (i > 0 && i < N - 1 && j > 0 && j < N - 1) {
              const lap = (grid[r0 + i - 1] + grid[r0 + i + 2] +
                grid[j > 0 ? (j - 1) * (N + 1) + i : r0 + i] +
                grid[(j + 2) * (N + 1) + i]) * 0.25 - hAvg;
              ao = clamp(1 - (lap / (step * 2.2)) * 0.35, 0.62, 1.14);
            }

            const sr = (lc[0] * sunI * wrap + ac[0] * ambI * (0.40 + 0.60 * nY)) * 0.0039 * ao;
            const sg = (lc[1] * sunI * wrap + ac[1] * ambI * (0.40 + 0.60 * nY)) * 0.0039 * ao;
            const sb = (lc[2] * sunI * wrap + ac[2] * ambI * (0.40 + 0.60 * nY)) * 0.0039 * ao;
            let r = alb[0] * sr, g = alb[1] * sg, b = alb[2] * sb;
            r += (fc[0] - r) * fog; g += (fc[1] - g) * fog; b += (fc[2] - b) * fog;

            this._quad(x0, h00, z0, x1, h10, z0, x1, h11, z1, x0, h01, z1,
              cachedRGB(r, g, b), vzc);
            quads++;
          }

          if (hMin < water) {
            const depth = water - Math.min(hMin, water);
            const t = clamp01(depth / 26);
            const wgain = lerp(1, gain, 0.65) * (0.42 + atm.ambientIntensity * 0.5);
            let wr = lerp(pal.shallow[0], pal.deep[0], t) * wgain;
            let wg = lerp(pal.shallow[1], pal.deep[1], t) * wgain;
            let wb = lerp(pal.shallow[2], pal.deep[2], t) * wgain;

            // Sky reflection + sun glitter on the flat plane.
            const ws = atm.waterSky;
            const vlen = Math.hypot(dx, dy, dz) || 1;
            const rxv = dx / vlen, ryv = -dy / vlen, rzv = dz / vlen;
            let spec = rxv * sun.x + ryv * sun.y + rzv * sun.z;
            spec = spec < 0 ? 0 : Math.pow(spec, 42);
            const ripple = 0.5 + 0.5 * Math.sin(mx * 0.035 + this.state.elapsed * 1.6) *
              Math.sin(mz * 0.028 - this.state.elapsed * 1.1);
            const fres = clamp01(0.22 + 0.78 * (1 - Math.abs(dy) / (dist + Math.abs(dy) + 1)));
            wr = lerp(wr, ws[0], fres * 0.72);
            wg = lerp(wg, ws[1], fres * 0.72);
            wb = lerp(wb, ws[2], fres * 0.72);
            // Wave banding so open water is not a flat slab of colour.
            const wave = 0.90 + 0.20 * ripple;
            wr *= wave; wg *= wave; wb *= wave * 1.02;
            const gl = spec * (0.6 + 0.5 * ripple) * 260 * sunI;
            wr += atm.sunColor[0] * gl * 0.004;
            wg += atm.sunColor[1] * gl * 0.004;
            wb += atm.sunColor[2] * gl * 0.004;

            // Shore foam.
            if (depth < 4.5 && hMax > water - 6) {
              const f = (1 - depth / 4.5) * (0.45 + 0.55 * ripple);
              wr = lerp(wr, pal.foam[0], f * 0.7);
              wg = lerp(wg, pal.foam[1], f * 0.7);
              wb = lerp(wb, pal.foam[2], f * 0.7);
            }
            wr += (fc[0] - wr) * fog; wg += (fc[1] - wg) * fog; wb += (fc[2] - wb) * fog;

            const it = this._quad(x0, water, z0, x1, water, z0, x1, water, z1, x0, water, z1,
              cachedRGB(wr, wg, wb), vzc + (submerged ? 0 : 0.6));
            if (it) quads++;
          }
        }
      }

      hasPrev = true;
      prevMinX = ox; prevMaxX = ox + N * step;
      prevMinZ = oz; prevMaxZ = oz + N * step;
    }
    this.stats.quads = quads;
  }

  /** Fast path quad emitter (already have world coords). */
  _quad(ax, ay, az, bx, by, bz, cx2, cy2, cz2, dx2, dy2, dz2, color, depth) {
    const cam = this.cam;
    const vx = this._vx, vy = this._vy, vz = this._vz;
    const px = [ax, bx, cx2, dx2], py = [ay, by, cy2, dy2], pz = [az, bz, cz2, dz2];
    let behind = 0;
    for (let i = 0; i < 4; i++) {
      const ddx = px[i] - cam.pos.x, ddy = py[i] - cam.pos.y, ddz = pz[i] - cam.pos.z;
      vx[i] = ddx * cam.right.x + ddy * cam.right.y + ddz * cam.right.z;
      vy[i] = ddx * cam.up.x + ddy * cam.up.y + ddz * cam.up.z;
      vz[i] = ddx * cam.fwd.x + ddy * cam.fwd.y + ddz * cam.fwd.z;
      if (vz[i] <= cam.near) behind++;
    }
    if (behind === 4) return null;
    let n = 4, sx = vx, sy = vy, sz = vz;
    if (behind) {
      n = this._clipNear(vx, vy, vz, 4);
      if (n < 3) return null;
      sx = this._cx; sy = this._cy; sz = this._cz;
    }
    const it = this._item();
    it.t = T_POLY;
    it.n = n;
    it.fill = color;
    it.alpha = 1;
    it.d = depth;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) {
      const inv = cam.scale / sz[i];
      const px2 = cam.cx + sx[i] * inv;
      const py2 = cam.cy - sy[i] * inv;
      it.xs[i] = px2; it.ys[i] = py2;
      mx += px2; my += py2;
    }
    // Grow the quad by half a pixel so neighbours overlap instead of leaving
    // an antialiased hairline of background between them.
    mx /= n; my /= n;
    for (let i = 0; i < n; i++) {
      const ex = it.xs[i] - mx, ey = it.ys[i] - my;
      const l = Math.sqrt(ex * ex + ey * ey);
      if (l > 0.001) {
        const k = SEAM / l;
        it.xs[i] += ex * k;
        it.ys[i] += ey * k;
      }
    }
    return it;
  }

  // ── Props ────────────────────────────────────────────────────────────────
  _buildProps() {
    const world = this.world, cam = this.cam, atm = this.atm, q = this.quality;
    if (!world) return;
    const state = this.state;
    let props = 0;

    // Trees
    const style = TREE_STYLES[world.def.terrain.treeKind] || TREE_STYLES.conifer;
    const fogC = atm.fogColor;
    const light = clamp01(atm.sunIntensity * 0.6 + atm.ambientIntensity * 0.55);
    let treeCount = 0;
    const maxTrees = q.maxTrees;
    // Which way the key light falls in screen space, for the canopy highlight.
    const sunSide = this._sunPos
      ? clamp((this._sunPos.x - cam.cx) / (this.w * 0.5), -1, 1) * (1 - atm.night * 0.7)
      : 0;
    const tanH = Math.tan(cam.hfov * 0.5) * 1.2 + 0.35;
    world.forEachTree(cam.pos.x, cam.pos.z, q.treeRange, (x, y, z, scale, variant, dist) => {
      if (treeCount >= maxTrees) return;
      const dx = x - cam.pos.x, dy = y - cam.pos.y, dz = z - cam.pos.z;
      const vz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
      if (vz <= cam.near) return;
      const vx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
      if (Math.abs(vx) > vz * tanH + 20) return;
      const vy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
      const inv = cam.scale / vz;
      const sx = cam.cx + vx * inv, sy = cam.cy - vy * inv;
      const hpx = style.height * scale * inv;
      if (hpx < 1.2) return;
      if (sy < -hpx * 2 || sy - hpx > this.h + 40) return;
      treeCount++;
      const fog = atm.fogAmount(vz);
      const it = this._item();
      it.t = T_SPRITE;
      it.a = sx; it.b = sy; it.c = hpx; it.d = vz;
      it.fill = 'tree';
      it.e = variant;
      it.data = {
        style, fog, light, fogC, sunSide,
        sway: Math.sin(state.elapsed * 1.3 + variant * 9),
      };
    });
    props += treeCount;

    // Landmarks & wildlife
    for (const p of world.pois) {
      const dx = p.x - cam.pos.x, dz = p.z - cam.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 2600 * 2600) continue;
      const dist = Math.sqrt(d2);
      if (dist > atm.visibility * 1.2) continue;
      const dy = p.y - cam.pos.y;
      const vz = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
      if (vz < -80) continue;
      const vx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
      if (Math.abs(vx) > vz * tanH + p.wide * 2 + 40) continue;
      emitLandmark(this, p, atm, state);
      props++;
    }

    // Gates
    for (const g of world.gates) {
      const dx = g.x - cam.pos.x, dz = g.z - cam.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1600) continue;
      emitGate(this, g, world.nextGate === g.index, state);
    }

    // The aircraft itself, when it can be seen.
    if (cam.mode === 'chase' && state.drone) {
      emitDrone(this, state.drone, atm, state);
    }
    this.stats.props = props;
  }

  // ── Flush ────────────────────────────────────────────────────────────────
  _flush() {
    const ctx = this.ctx;
    const items = this.items;
    items.sort(sortByDepth);
    let prevFill = null;
    let prevAlpha = 1;
    ctx.globalAlpha = 1;
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it.t === T_POLY) {
        if (it.alpha !== prevAlpha) { ctx.globalAlpha = it.alpha; prevAlpha = it.alpha; }
        if (it.fill !== prevFill) { ctx.fillStyle = it.fill; prevFill = it.fill; }
        ctx.beginPath();
        ctx.moveTo(it.xs[0], it.ys[0]);
        for (let i = 1; i < it.n; i++) ctx.lineTo(it.xs[i], it.ys[i]);
        ctx.closePath();
        ctx.fill();
        if (it.stroke) {
          ctx.strokeStyle = it.stroke;
          ctx.lineWidth = it.lw;
          ctx.stroke();
          prevFill = null;
        }
      } else if (it.t === T_DISC) {
        this.softDisc(it.a, it.b, it.c, it.fill, it.alpha);
        prevFill = null; prevAlpha = 1; ctx.globalAlpha = 1;
      } else if (it.t === T_RING) {
        const d = it.data;
        ctx.globalAlpha = it.alpha; prevAlpha = it.alpha;
        ctx.strokeStyle = it.fill;
        ctx.lineWidth = it.lw;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < d.xs.length; i++) {
          if (isNaN(d.xs[i])) { started = false; continue; }
          if (!started) { ctx.moveTo(d.xs[i], d.ys[i]); started = true; }
          else ctx.lineTo(d.xs[i], d.ys[i]);
        }
        ctx.stroke();
        prevFill = null;
      } else if (it.t === T_SPRITE) {
        ctx.globalAlpha = 1; prevAlpha = 1;
        if (it.fill === 'tree') drawTree(ctx, it);
        else if (typeof it.fill === 'function') it.fill(ctx, it);
        prevFill = null;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Post ─────────────────────────────────────────────────────────────────
  _post() {
    const ctx = this.ctx, atm = this.atm, cam = this.cam, state = this.state;
    const w = this.w, h = this.h;
    const sun = this._sunPos;

    // Atmospheric scatter + bloom around the sun.
    if (sun && sun.x > -w * 0.6 && sun.x < w * 1.6 && atm.night < 0.8) {
      const s = atm.sunColor;
      const key = 'rgba(' + (s[0] | 0) + ',' + (s[1] | 0) + ',' + (s[2] | 0) + ',ALPHA)';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const strength = 0.30 * (1 - atm.weather.cloudCover * 0.55) * (1 - atm.night);
      this.softDisc(sun.x, sun.y, Math.max(w, h) * 0.55, key, strength * 0.5);
      // Lens flare ghosts along the sun→centre axis.
      const dx = cam.cx - sun.x, dy = cam.cy - sun.y;
      const ghosts = [
        [0.35, 0.045, 0.22], [0.62, 0.028, 0.16], [0.95, 0.06, 0.13],
        [1.35, 0.035, 0.16], [1.75, 0.09, 0.09],
      ];
      for (const [t, r, a] of ghosts) {
        this.softDisc(sun.x + dx * t, sun.y + dy * t, Math.min(w, h) * r,
          key, a * strength * 2.2);
      }
      ctx.restore();
    }

    // Colour grade — a gentle push toward the light colour, lifted shadows.
    const grade = atm.lightColor;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = cachedRGB(grade[0], grade[1], grade[2]);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Speed streaks when moving fast in FPV.
    const drone = state.drone;
    if (drone && cam.mode === 'fpv' && drone.speed > 12) {
      const a = clamp01((drone.speed - 12) / 18) * 0.28;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.5).toFixed(3) + ')';
      ctx.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        const ang = hash3(i, 7, 3) * TAU;
        const r0 = Math.min(w, h) * (0.2 + hash3(i, 8, 5) * 0.4);
        const len = 40 + hash3(i, 9, 7) * 120;
        ctx.beginPath();
        ctx.moveTo(cam.cx + Math.cos(ang) * r0, cam.cy + Math.sin(ang) * r0);
        ctx.lineTo(cam.cx + Math.cos(ang) * (r0 + len), cam.cy + Math.sin(ang) * (r0 + len));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Film grain.
    if (state.grain !== false) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.05 + atm.night * 0.06;
      const ox = -Math.random() * 128, oy = -Math.random() * 128;
      if (!this._grainPattern) this._grainPattern = ctx.createPattern(this._grain, 'repeat');
      ctx.translate(ox, oy);
      ctx.fillStyle = this._grainPattern;
      ctx.fillRect(0, 0, w + 128, h + 128);
      ctx.restore();
    }

    // Vignette.
    ctx.save();
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32,
      w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function sortByDepth(a, b) { return b.d - a.d; }

/** Trees are drawn as depth-sorted screen sprites — cheap and dense. */
function drawTree(ctx, it) {
  const s = it.data.style;
  const hpx = it.c;
  const x = it.a, y = it.b;
  const fog = it.data.fog;
  const light = it.data.light;
  const fc = it.data.fogC;
  const v = it.e;
  const wpx = hpx * s.widthRatio * (0.8 + v * 0.4);
  const sway = it.data.sway * Math.min(4, hpx * 0.02);

  let r = s.color[0] * light, g = s.color[1] * light, b = s.color[2] * light;
  const tint = 0.85 + v * 0.3;
  r *= tint; g *= tint; b *= tint;
  r += (fc[0] - r) * fog; g += (fc[1] - g) * fog; b += (fc[2] - b) * fog;
  ctx.fillStyle = cachedRGB(r, g, b);

  if (hpx < 4) {
    ctx.fillRect(x - wpx * 0.4, y - hpx, wpx * 0.8, hpx);
    return;
  }

  if (s.shape === 'cone') {
    const tiers = hpx > 30 ? 3 : hpx > 12 ? 2 : 1;
    const trunkTop = y - hpx * 0.24;
    ctx.fillStyle = cachedRGB(r * 0.52, g * 0.44, b * 0.40);
    ctx.fillRect(x - wpx * 0.06, trunkTop, Math.max(1, wpx * 0.12), y - trunkTop);
    ctx.fillStyle = cachedRGB(r, g, b);
    for (let t = 0; t < tiers; t++) {
      const f = t / tiers;
      const apex = y - hpx * (0.52 + 0.48 * ((t + 1) / tiers));
      const base = y - hpx * (0.16 + 0.46 * f);
      const hw = wpx * (0.62 - 0.30 * f);
      ctx.beginPath();
      ctx.moveTo(x + sway * (0.4 + f), apex);
      ctx.lineTo(x + hw, base);
      ctx.lineTo(x - hw, base);
      ctx.closePath();
      ctx.fill();
    }
    // Lit side of the canopy.
    const ss = it.data.sunSide;
    if (hpx > 9 && Math.abs(ss) > 0.05) {
      ctx.fillStyle = cachedRGB(r * 1.3 + 12, g * 1.28 + 12, b * 1.24 + 10);
      const apex = y - hpx;
      const base = y - hpx * 0.18;
      const hw = wpx * 0.62;
      ctx.beginPath();
      ctx.moveTo(x + sway * 1.4, apex);
      ctx.lineTo(x + hw * ss, base);
      ctx.lineTo(x + hw * ss * 0.34, base);
      ctx.closePath();
      ctx.fill();
    }
  } else if (s.shape === 'round') {
    const trunkTop = y - hpx * 0.42;
    ctx.fillStyle = cachedRGB(r * 0.5, g * 0.44, b * 0.40);
    ctx.fillRect(x - wpx * 0.07, trunkTop, Math.max(1, wpx * 0.14), y - trunkTop);
    ctx.fillStyle = cachedRGB(r, g, b);
    ctx.beginPath();
    ctx.ellipse(x + sway * 0.5, y - hpx * 0.64, wpx * 0.60, hpx * 0.40, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = cachedRGB(r * 1.22 + 8, g * 1.2 + 8, b * 1.16 + 6);
    ctx.beginPath();
    ctx.ellipse(x + wpx * 0.24 * it.data.sunSide + sway * 0.5, y - hpx * 0.80,
      wpx * 0.34, hpx * 0.22, 0, 0, TAU);
    ctx.fill();
  } else {
    // Windswept: a bare leaning trunk under a flattened, wind-combed canopy.
    const ss = it.data.sunSide;
    const lean = wpx * 0.38;
    const trunkH = hpx * 0.46;
    ctx.fillStyle = cachedRGB(r * 0.5, g * 0.46, b * 0.44);
    ctx.beginPath();
    ctx.moveTo(x - wpx * 0.08, y);
    ctx.lineTo(x + lean - wpx * 0.05, y - trunkH);
    ctx.lineTo(x + lean + wpx * 0.05, y - trunkH);
    ctx.lineTo(x + wpx * 0.08, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = cachedRGB(r, g, b);
    ctx.beginPath();
    ctx.ellipse(x + lean + sway, y - hpx * 0.66, wpx * 0.72, hpx * 0.36, -0.18, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + lean * 1.7 + sway, y - hpx * 0.5, wpx * 0.42, hpx * 0.20, -0.3, 0, TAU);
    ctx.fill();
    if (hpx > 9) {
      ctx.fillStyle = cachedRGB(r * 1.28 + 10, g * 1.24 + 10, b * 1.2 + 8);
      ctx.beginPath();
      ctx.ellipse(x + lean + sway + wpx * 0.24 * ss, y - hpx * 0.78,
        wpx * 0.38, hpx * 0.16, -0.18, 0, TAU);
      ctx.fill();
    }
  }
}
