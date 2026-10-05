/** Small deterministic PRNG (mulberry32) so simulations are reproducible in tests. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  /** Approximately normal (Irwin–Hall, n=4), mean 0, std ~= sigma. */
  gauss(sigma = 1): number {
    const u = this.next() + this.next() + this.next() + this.next() - 2;
    return u * sigma * 1.732;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}
