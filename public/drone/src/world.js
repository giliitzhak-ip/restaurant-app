/**
 * world.js — everything that lives on top of the heightfield: landmarks,
 * wildlife, gates, hidden vistas, vegetation placement and clouds.
 *
 * Placement is deterministic for a given (map, seed) so a mission can be
 * replayed and compared on a leaderboard.
 */
'use strict';

import { Terrain } from './terrain.js';
import { makeRandom, clamp01, lerp, smoothstep, hash3, TAU } from './math.js';

const WORLD_RADIUS = 2300;

/** Human-readable names + framing metadata per landmark kind. */
export const POI_INFO = {
  summit_cross: { label: 'Summit Cross', tall: 9, wide: 6, icon: '✝', kind: 'structure' },
  alpine_hut: { label: 'Alpine Hut', tall: 8, wide: 12, icon: '⌂', kind: 'structure' },
  waterfall: { label: 'Waterfall', tall: 70, wide: 22, icon: '≋', kind: 'nature' },
  tarn: { label: 'Glacial Tarn', tall: 3, wide: 90, icon: '◯', kind: 'nature' },
  cable_tower: { label: 'Cable Tower', tall: 26, wide: 8, icon: '⊤', kind: 'structure' },
  lighthouse: { label: 'Lighthouse', tall: 34, wide: 10, icon: '☩', kind: 'structure' },
  sea_stack: { label: 'Sea Stack', tall: 46, wide: 26, icon: '▲', kind: 'nature' },
  arch: { label: 'Stone Arch', tall: 40, wide: 60, icon: '∩', kind: 'nature' },
  shipwreck: { label: 'Shipwreck', tall: 12, wide: 34, icon: '⚓', kind: 'structure' },
  cottage: { label: 'Cottage', tall: 7, wide: 10, icon: '⌂', kind: 'structure' },
  ruins: { label: 'Ruins', tall: 14, wide: 26, icon: '⌗', kind: 'structure' },
  fire_tower: { label: 'Fire Tower', tall: 24, wide: 8, icon: '⊥', kind: 'structure' },
  hoodoo: { label: 'Hoodoo', tall: 28, wide: 12, icon: '⌂', kind: 'nature' },
  windmill: { label: 'Windmill', tall: 32, wide: 26, icon: '✦', kind: 'structure' },
  village: { label: 'Fjord Village', tall: 10, wide: 60, icon: '⌂', kind: 'structure' },
  pad: { label: 'Home Pad', tall: 1, wide: 12, icon: 'H', kind: 'structure' },
  eagle: { label: 'Golden Eagle', tall: 2, wide: 3, icon: '𝕭', kind: 'wildlife' },
  gulls: { label: 'Gull Flock', tall: 2, wide: 3, icon: '𝕭', kind: 'wildlife' },
  condor: { label: 'Condor', tall: 2, wide: 4, icon: '𝕭', kind: 'wildlife' },
  heron: { label: 'Heron', tall: 2, wide: 3, icon: '𝕭', kind: 'wildlife' },
  deer: { label: 'Red Deer', tall: 2, wide: 3, icon: '⚘', kind: 'wildlife' },
  vista: { label: 'Hidden Vista', tall: 2, wide: 10, icon: '★', kind: 'vista' },
};

let nextId = 1;

export class World {
  constructor(mapDef, weather, seedOffset = 0) {
    this.def = mapDef;
    this.weather = weather;
    this.terrain = new Terrain({ ...mapDef, seed: mapDef.seed + seedOffset });
    this.rand = makeRandom(mapDef.seed + seedOffset * 7919 + 17);

    this.pois = [];
    this.wildlife = [];
    this.gates = [];
    this.vistas = [];
    this.clouds = [];
    this.time = 0;

    this._buildDensityGrid();
    this.spawn = this.terrain.findSpawn(this.rand);
    this._placeLandmarks();
    this._placeVistas();
    this._placeGates();
    this._buildClouds();

    this.treeCache = new Map();
    this.homePad = {
      id: nextId++, kind: 'pad', x: this.spawn.x, y: this.spawn.y - 3, z: this.spawn.z,
      value: 0, ideal: 40, rot: this.rand() * TAU, photographed: false, seen: true,
    };
    this.pois.push(this.homePad);
  }

  // ── Vegetation density is expensive; bake it once on a coarse grid ───────
  _buildDensityGrid() {
    const N = 112;
    const span = WORLD_RADIUS * 2.2;
    this.densityN = N;
    this.densitySpan = span;
    this.densityStep = span / (N - 1);
    const t = this.terrain;
    const step = this.densityStep;

    // One height sample per node, slope from finite differences of that grid.
    const hs = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = -span / 2 + j * step;
      for (let i = 0; i < N; i++) hs[j * N + i] = t.height(-span / 2 + i * step, z);
    }
    const grid = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = -span / 2 + j * step;
      for (let i = 0; i < N; i++) {
        const h = hs[j * N + i];
        const hx = hs[j * N + Math.min(N - 1, i + 1)] - hs[j * N + Math.max(0, i - 1)];
        const hz = hs[Math.min(N - 1, j + 1) * N + i] - hs[Math.max(0, j - 1) * N + i];
        const nl = Math.hypot(-hx, 2 * step, -hz) || 1;
        const slope = clamp01(1 - (2 * step) / nl);
        grid[j * N + i] = t.vegetationDensity(-span / 2 + i * step, z, h, slope);
      }
    }
    this.densityGrid = grid;
  }

  treeDensityAt(x, z) {
    const N = this.densityN, span = this.densitySpan, step = this.densityStep;
    const fx = (x + span / 2) / step, fz = (z + span / 2) / step;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return 0;
    const tx = fx - i, tz = fz - j;
    const g = this.densityGrid;
    const a = g[j * N + i], b = g[j * N + i + 1];
    const c = g[(j + 1) * N + i], d = g[(j + 1) * N + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  // ── Landmark placement ───────────────────────────────────────────────────
  _candidateScore(place, x, z, h, slope) {
    const w = this.terrain.waterLevel;
    switch (place) {
      case 'peak':
        return h > w + 220 && slope < 0.55 ? h : -1;
      case 'ridge':
        return h > w + 110 && slope > 0.12 && slope < 0.6 ? h * 0.6 + slope * 90 : -1;
      case 'cliff':
        return slope > 0.5 && h > w + 40 ? slope * 200 + h * 0.15 : -1;
      case 'coast': {
        if (h < w + 2 || h > w + 90) return -1;
        if (slope > 0.72) return -1;
        return 120 - Math.abs(h - (w + 22)) + (this._nearWater(x, z, 90) ? 90 : -400);
      }
      case 'water':
        return h < w - 6 && this._nearLand(x, z, 220) ? 100 - slope * 40 : -1;
      case 'bench':
        return h > w + 12 && slope < 0.22 ? 100 - slope * 200 : -1;
      case 'ground':
        return h > w + 3 && slope < 0.34 ? 80 - slope * 120 : -1;
      case 'air':
        return 50;
      default:
        return 1;
    }
  }

  _nearWater(x, z, r) {
    const w = this.terrain.waterLevel;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      if (this.terrain.height(x + Math.cos(a) * r, z + Math.sin(a) * r) < w - 2) return true;
    }
    return false;
  }

  _nearLand(x, z, r) {
    const w = this.terrain.waterLevel;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      if (this.terrain.height(x + Math.cos(a) * r, z + Math.sin(a) * r) > w + 6) return true;
    }
    return false;
  }

  _placeLandmarks() {
    const t = this.terrain;
    for (const spec of this.def.landmarks) {
      const placed = [];
      let attempts = 0;
      const wanted = spec.count;
      const pool = [];
      while (attempts < 520 && pool.length < wanted * 10) {
        attempts++;
        const ang = this.rand() * TAU;
        const rad = 180 + Math.sqrt(this.rand()) * (WORLD_RADIUS - 200);
        const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
        const h = t.height(x, z);
        const slope = t.slopeAt(x, z);
        const s = this._candidateScore(spec.place, x, z, h, slope);
        if (s > 0) pool.push({ x, z, h, slope, s });
      }
      pool.sort((a, b) => b.s - a.s);
      const minSep = spec.place === 'air' ? 300 : 220;
      for (const c of pool) {
        if (placed.length >= wanted) break;
        let ok = true;
        for (const p of placed) {
          if (Math.hypot(p.x - c.x, p.z - c.z) < minSep) { ok = false; break; }
        }
        if (!ok) continue;
        for (const p of this.pois) {
          if (Math.hypot(p.x - c.x, p.z - c.z) < 140) { ok = false; break; }
        }
        if (!ok) continue;
        placed.push(c);
        this._spawnPOI(spec, c);
      }
    }
  }

  _spawnPOI(spec, c) {
    const t = this.terrain;
    const info = POI_INFO[spec.kind] || { tall: 10, wide: 10, kind: 'structure' };
    const isAir = spec.place === 'air';
    const base = spec.place === 'water' ? t.waterLevel : c.h;
    const poi = {
      id: nextId++,
      kind: spec.kind,
      category: info.kind,
      x: c.x,
      z: c.z,
      groundY: base,
      y: isAir ? base + 55 + this.rand() * 110 : base,
      value: spec.value,
      ideal: spec.ideal,
      tall: info.tall,
      wide: info.wide,
      rot: this.rand() * TAU,
      phase: this.rand() * TAU,
      seen: false,
      photographed: false,
      bestShot: 0,
      slope: c.slope,
    };

    if (info.kind === 'wildlife') {
      poi.homeX = c.x; poi.homeZ = c.z;
      poi.radius = isAir ? 70 + this.rand() * 90 : 26 + this.rand() * 30;
      poi.speed = isAir ? 0.16 + this.rand() * 0.16 : 0.05 + this.rand() * 0.06;
      poi.flock = isAir ? 3 + ((this.rand() * 5) | 0) : 1 + ((this.rand() * 3) | 0);
      poi.flying = isAir;
      poi.spooked = 0;
      this.wildlife.push(poi);
    }

    if (spec.kind === 'waterfall') {
      // Anchor the fall to the steepest nearby face and give it a plunge pool.
      poi.dropHeight = 40 + this.rand() * 70;
      const n = t.normal(c.x, c.z, null);
      poi.faceX = n.x; poi.faceZ = n.z;
      poi.y = c.h;
    }
    if (spec.kind === 'village') poi.houses = 6 + ((this.rand() * 6) | 0);
    if (spec.kind === 'sea_stack' || spec.kind === 'hoodoo') {
      poi.tall = info.tall * (0.6 + this.rand() * 0.9);
      poi.wide = info.wide * (0.7 + this.rand() * 0.7);
    }
    this.pois.push(poi);
  }

  /**
   * Hidden vistas: viewpoints scored by local relief and how much interesting
   * stuff is visible from them. Only revealed on the minimap once nearby.
   */
  _placeVistas() {
    const t = this.terrain;
    const cand = [];
    for (let i = 0; i < 500; i++) {
      const ang = this.rand() * TAU;
      const rad = 250 + Math.sqrt(this.rand()) * (WORLD_RADIUS - 300);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const h = t.height(x, z);
      if (h < t.waterLevel + 15) continue;
      // Local relief: how dramatic the surroundings are.
      let relief = 0;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        relief += Math.abs(t.height(x + Math.cos(a) * 130, z + Math.sin(a) * 130) - h);
      }
      let near = 0;
      for (const p of this.pois) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < 420) near += (1 - d / 420) * p.value;
      }
      cand.push({ x, z, h, s: relief * 0.7 + near * 0.5 });
    }
    cand.sort((a, b) => b.s - a.s);
    const picked = [];
    for (const c of cand) {
      if (picked.length >= 5) break;
      if (picked.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 500)) continue;
      picked.push(c);
      this.vistas.push({
        id: nextId++, kind: 'vista', category: 'vista',
        x: c.x, z: c.z, groundY: c.h, y: c.h + 24,
        value: 260, ideal: 60, tall: 4, wide: 10,
        rot: 0, phase: 0, seen: false, discovered: false,
        photographed: false, bestShot: 0,
      });
    }
    this.pois.push(...this.vistas);
  }

  /** A sequential ring course threaded through the best scenery. */
  _placeGates() {
    const t = this.terrain;
    const interest = this.pois.filter((p) => p.value >= 130 && p.kind !== 'pad');
    const count = 7;
    const used = [];
    for (let i = 0; i < count; i++) {
      let best = null;
      // Three passes, each looser than the last, so a sparse map still gets a
      // full course instead of two lonely gates.
      for (let pass = 0; pass < 3 && !best; pass++) {
        const minSep = [340, 220, 90][pass];
        const maxSep = [1100, 1500, 9999][pass];
        for (let k = 0; k < 240; k++) {
          const src = interest.length
            ? interest[(this.rand() * interest.length) | 0]
            : { x: 0, z: 0 };
          const ang = this.rand() * TAU;
          const rad = 90 + this.rand() * (260 + pass * 240);
          const x = src.x + Math.cos(ang) * rad;
          const z = src.z + Math.sin(ang) * rad;
          if (Math.hypot(x, z) > WORLD_RADIUS) continue;
          const h = t.height(x, z);
          const clearance = Math.max(t.waterLevel, h) + 40 + this.rand() * 90;
          let sep = Infinity;
          for (const u of used) sep = Math.min(sep, Math.hypot(u.x - x, u.z - z));
          if (used.length && (sep < minSep || sep > maxSep)) continue;
          const s = sep === Infinity ? 500 : 900 - Math.abs(sep - 620);
          if (!best || s > best.s) best = { x, z, y: clearance, s };
        }
      }
      if (!best) break;
      used.push(best);
      this.gates.push({
        id: nextId++, index: i, x: best.x, y: best.y, z: best.z,
        radius: 26, passed: false,
        yaw: 0, phase: this.rand() * TAU,
      });
    }
    // Face each gate along the course direction.
    for (let i = 0; i < this.gates.length; i++) {
      const a = this.gates[i];
      const b = this.gates[(i + 1) % this.gates.length];
      a.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    }
  }

  _buildClouds() {
    const cover = this.weather.cloudCover;
    const count = Math.round(26 + cover * 90);
    for (let i = 0; i < count; i++) {
      const ang = this.rand() * TAU;
      const rad = Math.sqrt(this.rand()) * 5200;
      this.clouds.push({
        x: Math.cos(ang) * rad,
        z: Math.sin(ang) * rad,
        y: 520 + this.rand() * 620 - cover * 180,
        r: 130 + this.rand() * 320,
        puffs: 3 + ((this.rand() * 4) | 0),
        seed: (this.rand() * 1000) | 0,
        alpha: 0.24 + this.rand() * 0.4 * (0.5 + cover),
      });
    }
  }

  // ── Runtime ──────────────────────────────────────────────────────────────
  update(dt, drone) {
    this.time += dt;
    const t = this.terrain;

    for (const a of this.wildlife) {
      const d = Math.hypot(a.x - drone.pos.x, a.z - drone.pos.z);
      const vertical = Math.abs(a.y - drone.pos.y);
      if (d < 34 && vertical < 40) a.spooked = Math.min(1, a.spooked + dt * 1.6);
      else a.spooked = Math.max(0, a.spooked - dt * 0.35);

      a.phase += dt * a.speed * (1 + a.spooked * 2.4);
      if (a.flying) {
        a.x = a.homeX + Math.cos(a.phase) * a.radius;
        a.z = a.homeZ + Math.sin(a.phase * 1.13) * a.radius;
        a.y = a.groundY + 55 + Math.sin(a.phase * 0.7) * 26 + a.spooked * 40;
      } else {
        a.x = a.homeX + Math.cos(a.phase * 0.8) * a.radius;
        a.z = a.homeZ + Math.sin(a.phase) * a.radius;
        a.y = t.surface(a.x, a.z);
        a.groundY = a.y;
      }
    }

    // Vistas reveal themselves when you get close.
    for (const v of this.vistas) {
      if (!v.discovered) {
        const d = Math.hypot(v.x - drone.pos.x, v.z - drone.pos.z);
        if (d < 220) { v.discovered = true; v.justFound = true; }
      }
    }

    // Clouds drift downwind.
    const w = this.weather;
    const drift = w.windBase * 0.12;
    for (const c of this.clouds) {
      c.x += drift * dt * 3;
      c.z += drift * dt * 1.4;
      if (c.x > 5600) c.x -= 11200;
      if (c.z > 5600) c.z -= 11200;
    }
  }

  /** Terrain height cached at tree lattice points (heights never change). */
  treeHeight(key, x, z) {
    let h = this.treeCache.get(key);
    if (h === undefined) {
      h = this.terrain.height(x, z);
      if (this.treeCache.size > 60000) this.treeCache.clear();
      this.treeCache.set(key, h);
    }
    return h;
  }

  /**
   * Walk the vegetation lattice near (cx, cz) and invoke `cb(x, y, z, scale,
   * variant)` for each tree. Spacing widens with distance so the far canopy
   * costs little.
   */
  forEachTree(cx, cz, range, cb) {
    if (this.def.terrain.treeDensity <= 0) return;
    const spacing = 15;
    const w = this.terrain.waterLevel;
    const i0 = Math.floor((cx - range) / spacing), i1 = Math.ceil((cx + range) / spacing);
    const j0 = Math.floor((cz - range) / spacing), j1 = Math.ceil((cz + range) / spacing);
    const r2 = range * range;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const hx = hash3(i, j, 3);
        const x = i * spacing + (hx - 0.5) * spacing * 0.85;
        const hz = hash3(i, j, 5);
        const z = j * spacing + (hz - 0.5) * spacing * 0.85;
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        // Thin out distant trees to keep the draw count bounded.
        const dist = Math.sqrt(d2);
        const keep = dist < 170 ? 1 : dist < 320 ? 0.55 : 0.28;
        const roll = hash3(i, j, 7);
        if (roll > keep) continue;
        const dens = this.treeDensityAt(x, z);
        if (dens <= 0.02 || hash3(i, j, 11) > dens) continue;
        const key = (i + 32768) * 100003 + (j + 32768);
        const y = this.treeHeight(key, x, z);
        if (y < w + 1.2) continue;
        const scale = 0.62 + hash3(i, j, 13) * 0.85;
        cb(x, y, z, scale, hash3(i, j, 17), dist);
      }
    }
  }

  /** POIs within `r` metres of a point (used for scoring and the HUD). */
  nearby(x, z, r) {
    const out = [];
    for (const p of this.pois) {
      if (p.kind === 'pad') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < r) out.push({ poi: p, dist: d });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }
}

export { WORLD_RADIUS };
