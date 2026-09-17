/** Deterministic PRNG so every regeneration produces identical assets. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (v: number, m: number) => ((v % m) + m) % m;

export type Noise2D = (
  x: number,
  y: number,
  periodX: number,
  periodY: number,
) => number;

/**
 * Tileable value noise. Lattice lookups wrap on (periodX, periodY), so any
 * field sampled with `x = u * periodX` is seamless on both axes — which is
 * what makes the generated textures tile without a visible seam.
 */
export function makeNoise2D(seed: number): Noise2D {
  const salt = seed >>> 0;

  /** Well-distributed 2D integer hash — avoids the aliasing a small lookup
   * table produces, which otherwise washes the fractal sum out to flat grey. */
  const lattice = (xi: number, yi: number, px: number, py: number) => {
    const x = wrap(xi, Math.max(1, Math.round(px)));
    const y = wrap(yi, Math.max(1, Math.round(py)));
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + salt) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  return (x, y, periodX, periodY) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const v00 = lattice(x0, y0, periodX, periodY);
    const v10 = lattice(x0 + 1, y0, periodX, periodY);
    const v01 = lattice(x0, y0 + 1, periodX, periodY);
    const v11 = lattice(x0 + 1, y0 + 1, periodX, periodY);
    const top = v00 * (1 - tx) + v10 * tx;
    const bottom = v01 * (1 - tx) + v11 * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

/**
 * Fractal sum of tileable noise. `cellsX`/`cellsY` set the base lattice
 * resolution, which is how anisotropic features (wood grain, veining) are
 * produced: many cells along one axis, few along the other.
 */
export function fbm(
  noise: Noise2D,
  u: number,
  v: number,
  cellsX: number,
  cellsY: number,
  octaves = 4,
  gain = 0.5,
) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let px = cellsX;
  let py = cellsY;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * noise(u * px, v * py, px, py);
    norm += amp;
    amp *= gain;
    px *= 2;
    py *= 2;
  }
  // Averaging octaves shrinks the variance; stretch it back so callers get a
  // field that actually spans 0..1.
  const value = sum / norm;
  const stretched = 0.5 + (value - 0.5) * (1 + 0.22 * octaves);
  return stretched < 0 ? 0 : stretched > 1 ? 1 : stretched;
}

/** Ridged variant — turns smooth noise into fibre-like lines. */
export function ridged(value: number) {
  return 1 - Math.abs(value * 2 - 1);
}
