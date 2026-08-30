/**
 * noise.js — seeded gradient/value noise used for terrain, clouds and wind.
 * Hash-based (no permutation tables) so any seed is instantly available.
 */
'use strict';

function ihash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const INV32 = 1 / 4294967296;

/** Quintic fade — C2 continuous, avoids the creased look of linear noise. */
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export class Noise {
  constructor(seed = 1) {
    this.seed = seed | 0;
  }

  /** 2D value noise in [0,1]. */
  value(x, y, salt = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const s = this.seed + salt * 7919;
    const a = ihash(xi, yi, s) * INV32;
    const b = ihash(xi + 1, yi, s) * INV32;
    const c = ihash(xi, yi + 1, s) * INV32;
    const d = ihash(xi + 1, yi + 1, s) * INV32;
    const u = fade(xf), v = fade(yf);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }

  /** Signed value noise in [-1,1]. */
  signed(x, y, salt = 0) {
    return this.value(x, y, salt) * 2 - 1;
  }

  /** Fractional Brownian motion in [0,1]. */
  fbm(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5, salt = 0) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.value(x * freq, y * freq, salt + i);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal in [0,1] — sharp crests, good for mountain spines. */
  ridged(x, y, octaves = 5, lacunarity = 2.07, gain = 0.5, salt = 0) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0, weight = 1;
    for (let i = 0; i < octaves; i++) {
      let n = 1 - Math.abs(this.signed(x * freq, y * freq, salt + i * 31));
      n *= n;
      n *= weight;
      weight = Math.min(1, n * 2.2);
      sum += amp * n;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /**
   * Billow noise in [0,1] — rounded lumps, used for rolling hills and cloud
   * bodies.
   */
  billow(x, y, octaves = 4, salt = 0) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * Math.abs(this.signed(x * freq, y * freq, salt + i * 17));
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  }
}
