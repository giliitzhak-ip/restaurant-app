/**
 * terrain.js — procedural heightfield + surface shading.
 *
 * One parametrised model drives every biome: continental mask, domain warp,
 * ridged mountains, rolling hills, carved river/canyon channels and optional
 * mesa terracing. Biome data lives in biomes.js.
 */
'use strict';

import { Noise } from './noise.js';
import { clamp, clamp01, lerp, smoothstep } from './math.js';

export class Terrain {
  constructor(def) {
    this.def = def;
    this.p = def.terrain;
    this.palette = def.palette;
    this.noise = new Noise(def.seed);
    this.waterLevel = this.p.waterLevel;
    this._n = { x: 0, y: 1, z: 0 };
    this._col = [0, 0, 0];
    this._tmp = [0, 0, 0];
  }

  /** Surface elevation in metres at world (x, z). */
  height(x, z) {
    const p = this.p, n = this.noise;

    // Domain warp keeps ridges from looking grid-aligned.
    const wxo = n.signed(x * p.warpFreq, z * p.warpFreq, 5) * p.warp;
    const wzo = n.signed(x * p.warpFreq + 53.13, z * p.warpFreq - 19.77, 6) * p.warp;
    const wx = x + wxo, wz = z + wzo;

    // Continental mask: 0 = ocean basin, 1 = full landmass.
    const cont = n.fbm(wx * p.contFreq, wz * p.contFreq, 3, 2.1, 0.5, 1);
    const land = smoothstep(p.contLo, p.contHi, cont);

    const hills = n.fbm(wx * p.hillFreq, wz * p.hillFreq, 4, 2.03, 0.5, 2) * 2 - 1;
    const ridge = n.ridged(wx * p.ridgeFreq, wz * p.ridgeFreq, p.ridgeOct, 2.07, 0.5, 3);

    let h = p.base + hills * p.hillAmp;
    h += Math.pow(ridge, p.ridgeSharp) * p.ridgeAmp * (p.ridgeMasked ? land : 1);
    h -= (1 - land) * p.oceanDepth;

    // Winding channel carved where a signed field crosses zero.
    if (p.carveAmp > 0) {
      const c = Math.abs(n.fbm(wx * p.carveFreq, wz * p.carveFreq, 3, 2.0, 0.5, 4) * 2 - 1);
      const channel = smoothstep(p.carveWidth, 0, c);
      h -= channel * p.carveAmp * (0.55 + 0.45 * land);
    }

    // Mesa terracing.
    if (p.terrace > 0) {
      const stepped = Math.round(h / p.terrace) * p.terrace;
      h = lerp(h, stepped, p.terraceMix);
    }

    h += (n.fbm(x * p.detFreq, z * p.detFreq, 3, 2.11, 0.5, 7) - 0.5) * p.detAmp;
    return h;
  }

  /** Elevation clamped at the water plane — what the camera actually sees. */
  surface(x, z) {
    const h = this.height(x, z);
    return h < this.waterLevel ? this.waterLevel : h;
  }

  /** Analytic-ish normal via central differences (stable under LOD changes). */
  normal(x, z, out) {
    const e = 2.5;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const nx = -hx, ny = 2 * e, nz = -hz;
    const l = Math.hypot(nx, ny, nz) || 1;
    out = out || this._n;
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }

  /** Steepness in 0 (flat) .. 1 (vertical). */
  slopeAt(x, z) {
    const n = this.normal(x, z, this._n);
    return clamp01(1 - n.y);
  }

  /**
   * Surface albedo for a point. `slope` is 1 - normal.y.
   * Writes into `out` ([r,g,b], 0..255) and returns it.
   */
  shade(x, z, h, slope, out) {
    const pal = this.palette, p = this.p;
    out = out || this._col;

    // Altitude ramp through the biome's three ground tones, biased by a
    // large-scale patch field so a whole hillside is not one flat tone.
    const patch = Math.sin(x * 0.0043 + z * 0.0021) * Math.sin(z * 0.0037 - x * 0.0015);
    const t = clamp01((h - p.colorLo) / (p.colorHi - p.colorLo || 1) + patch * 0.11);
    let a, b, k;
    if (t < 0.5) { a = pal.low; b = pal.mid; k = t * 2; }
    else { a = pal.mid; b = pal.high; k = (t - 0.5) * 2; }
    let r = a[0] + (b[0] - a[0]) * k;
    let g = a[1] + (b[1] - a[1]) * k;
    let bl = a[2] + (b[2] - a[2]) * k;

    // Exposed rock on steep faces.
    const rockK = smoothstep(p.rockSlopeLo, p.rockSlopeHi, slope);
    if (rockK > 0) {
      r += (pal.rock[0] - r) * rockK;
      g += (pal.rock[1] - g) * rockK;
      bl += (pal.rock[2] - bl) * rockK;
    }

    // Snow line — thins out on cliffs where it cannot settle.
    if (p.snowLo < 1e5) {
      const snowK = smoothstep(p.snowLo, p.snowHi, h) * (1 - clamp01(slope * 1.5));
      if (snowK > 0) {
        r += (pal.snow[0] - r) * snowK;
        g += (pal.snow[1] - g) * snowK;
        bl += (pal.snow[2] - bl) * snowK;
      }
    }

    // Beach / shoreline band.
    const beachK = smoothstep(this.waterLevel + p.beachWidth, this.waterLevel - 1, h) *
      (1 - clamp01(slope * 2.2));
    if (beachK > 0) {
      r += (pal.sand[0] - r) * beachK;
      g += (pal.sand[1] - g) * beachK;
      bl += (pal.sand[2] - bl) * beachK;
    }

    // Coherent mottling. A per-cell hash would shimmer and checkerboard as the
    // LOD rings move, so this is a smooth function of world position instead.
    const v = 0.955 + 0.09 * (Math.sin(x * 0.019 + 1.7) * Math.sin(z * 0.023 - 0.6) * 0.5 + 0.5);
    out[0] = r * v; out[1] = g * v; out[2] = bl * v;
    return out;
  }

  /** True where the map should sprout vegetation. */
  vegetationDensity(x, z, h, slope) {
    const p = this.p;
    if (p.treeDensity <= 0) return 0;
    if (h < this.waterLevel + 1.5) return 0;
    let d = p.treeDensity;
    d *= smoothstep(p.treeLo, p.treeLo + 40, h);
    d *= 1 - smoothstep(p.treeHi - 60, p.treeHi, h);
    d *= 1 - smoothstep(0.45, 0.72, slope);
    // Patchiness
    const patch = this.noise.fbm(x * 0.0055, z * 0.0055, 3, 2.0, 0.5, 21);
    d *= smoothstep(0.34, 0.62, patch) * 0.85 + 0.15;
    return clamp(d, 0, 1);
  }

  /** Find a flyable spawn: reasonably flat, above water, near the map centre. */
  findSpawn(rand) {
    let best = null;
    for (let i = 0; i < 260; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 120 + rand() * 700;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const h = this.height(x, z);
      if (h < this.waterLevel + 4) continue;
      const slope = this.slopeAt(x, z);
      const score = -slope * 100 - Math.abs(h - (this.waterLevel + 40)) * 0.05;
      if (!best || score > best.score) best = { x, z, h, score };
    }
    if (!best) best = { x: 0, z: 0, h: Math.max(this.waterLevel + 10, this.height(0, 0)) };
    return { x: best.x, y: best.h + 3, z: best.z };
  }
}
