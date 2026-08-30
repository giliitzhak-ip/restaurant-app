/**
 * scoring.js — the cinematography judge.
 *
 * A shot is scored on six weighted axes (subject, composition, light,
 * altitude, stability, depth) and then multiplied by situational bonuses
 * (weather difficulty, golden-hour light, first-capture rarity). The same code
 * runs cheaply every frame to drive the live composition meter, and in "full"
 * mode — with a terrain ray-march for real depth analysis — when the shutter
 * fires.
 */
'use strict';

import { clamp, clamp01, lerp, smoothstep, TAU, DEG } from './math.js';
import { POI_INFO } from './world.js';

export const GRADES = [
  { min: 1020, grade: 'S', color: '#ffd76a', label: 'Masterpiece' },
  { min: 890, grade: 'A', color: '#8affc1', label: 'Portfolio' },
  { min: 750, grade: 'B', color: '#7fd4ff', label: 'Publishable' },
  { min: 600, grade: 'C', color: '#cbd5e1', label: 'Usable' },
  { min: 440, grade: 'D', color: '#f0a35e', label: 'Weak' },
  { min: 0, grade: 'F', color: '#ff7a7a', label: 'Reject' },
];

export function gradeFor(score) {
  for (const g of GRADES) if (score >= g.min) return g;
  return GRADES[GRADES.length - 1];
}

const WEIGHTS = {
  subject: 0.24,
  composition: 0.19,
  light: 0.19,
  altitude: 0.11,
  stability: 0.15,
  depth: 0.12,
};

/** Gaussian falloff around an ideal value. */
function bell(value, ideal, width) {
  const d = (value - ideal) / width;
  return Math.exp(-d * d);
}

/** March a camera ray against the heightfield. Returns hit distance or -1. */
function raycastTerrain(cam, terrain, u, v, maxDist) {
  // u,v in [-1,1] screen space → world direction.
  const tv = Math.tan(cam.vfov / 2);
  const th = Math.tan(cam.hfov / 2);
  const dx = cam.right.x * u * th + cam.up.x * v * tv + cam.fwd.x;
  const dy = cam.right.y * u * th + cam.up.y * v * tv + cam.fwd.y;
  const dz = cam.right.z * u * th + cam.up.z * v * tv + cam.fwd.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  const rx = dx / l, ry = dy / l, rz = dz / l;

  let t = 2;
  let prevT = t;
  let prevGap = cam.pos.y + ry * t - terrain.surface(cam.pos.x + rx * t, cam.pos.z + rz * t);
  while (t < maxDist) {
    const step = 3 + t * 0.05;
    t += step;
    const px = cam.pos.x + rx * t, py = cam.pos.y + ry * t, pz = cam.pos.z + rz * t;
    const gap = py - terrain.surface(px, pz);
    if (gap <= 0) {
      // Linear refine between the last two samples.
      const f = prevGap / (prevGap - gap || 1);
      return prevT + (t - prevT) * clamp01(f);
    }
    prevGap = gap;
    prevT = t;
  }
  return -1;
}

/**
 * Everything the judge needs about the current frame.
 * `full` enables the depth ray-march (used on capture only).
 */
export function analyzeShot(state, full) {
  const { camera: cam, world, drone, atmosphere: atm } = state;
  const terrain = world.terrain;
  const subjects = [];
  const half = { w: cam.width / 2, h: cam.height / 2 };
  const proj = { x: 0, y: 0, z: 0 };

  for (const p of world.pois) {
    if (p.kind === 'pad') continue;
    if (p.kind === 'vista' && !p.discovered) continue;
    const dx = p.x - cam.pos.x, dz = p.z - cam.pos.z;
    const dist2 = dx * dx + dz * dz;
    if (dist2 > 1100 * 1100) continue;
    const cy = p.y + (p.category === 'wildlife' ? 0 : p.tall * 0.5);
    if (!cam.project(p.x, cy, p.z, proj)) continue;
    const nx = (proj.x - cam.cx) / half.w;
    const ny = (proj.y - cam.cy) / half.h;
    if (Math.abs(nx) > 1.25 || Math.abs(ny) > 1.25) continue;
    const dist = Math.sqrt(dist2 + (cy - cam.pos.y) * (cy - cam.pos.y));
    // Apparent height as a fraction of frame height.
    const apparent = (p.tall * cam.scale / proj.z) / cam.height;
    const fog = atm.fogAmount(dist);
    if (fog > 0.94) continue;
    const centred = clamp01(1 - Math.hypot(nx, ny) / 1.45);
    const clarity = Math.pow(1 - fog, 1.5);
    const weight = p.value * (0.25 + centred) * (0.35 + clamp01(apparent * 3.2)) * clarity;
    subjects.push({
      poi: p, nx, ny, dist, apparent, fog, centred, weight,
      spooked: p.spooked || 0,
    });
  }
  subjects.sort((a, b) => b.weight - a.weight);
  const primary = subjects[0] || null;

  // ── Depth / layering ───────────────────────────────────────────────────
  let depthScore = 0.45;
  let skyFraction = 0.3;
  let nearest = Infinity;
  let layers = 0;
  if (full) {
    const cols = 7, rows = 5;
    let hits = 0, miss = 0;
    let bNear = 0, bMid = 0, bFar = 0;
    const maxD = Math.min(2600, atm.visibility * 1.4);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const u = (i / (cols - 1)) * 2 - 1;
        const v = 1 - (j / (rows - 1)) * 2;
        const d = raycastTerrain(cam, terrain, u * 0.92, v * 0.92, maxD);
        if (d < 0) { miss++; continue; }
        hits++;
        if (d < nearest) nearest = d;
        if (d < 90) bNear++;
        else if (d < 420) bMid++;
        else bFar++;
      }
    }
    const total = cols * rows;
    skyFraction = miss / total;
    layers = (bNear > 1 ? 1 : 0) + (bMid > 1 ? 1 : 0) + (bFar > 1 ? 1 : 0) + (miss > 2 ? 1 : 0);
    // Best frames read as foreground → midground → background → sky.
    depthScore = clamp01(layers / 4) * 0.75 +
      (1 - Math.abs(skyFraction - 0.34) / 0.66) * 0.25;
    depthScore = clamp01(depthScore);
  } else {
    const agl = drone.agl;
    depthScore = clamp01(0.35 + bell(agl, 90, 130) * 0.5);
    nearest = agl;
  }

  // ── Subject ────────────────────────────────────────────────────────────
  let subjectScore, subjectNote;
  if (primary) {
    const info = POI_INFO[primary.poi.kind] || {};
    const idealFill = primary.poi.category === 'wildlife' ? 0.14 : 0.30;
    const fill = bell(primary.apparent, idealFill, idealFill * 0.9);
    const inFrame = clamp01(1 - (Math.max(Math.abs(primary.nx), Math.abs(primary.ny)) - 0.8) / 0.45);
    const worth = clamp01(primary.poi.value / 260);
    subjectScore = clamp01(fill * 0.5 + inFrame * 0.22 + worth * 0.28);
    // Haze between you and the subject costs you the subject.
    subjectScore *= 1 - primary.fog * 0.85;
    if (primary.spooked > 0.3) subjectScore *= 1 - primary.spooked * 0.45;
    subjectNote = (info.label || primary.poi.kind) +
      ' · ' + Math.round(primary.dist) + ' m';
  } else {
    // Pure landscape: judged on relief and how much of the frame is land.
    const relief = clamp01((drone.agl + Math.abs(drone.pos.y - terrain.waterLevel)) / 420);
    // A landscape with no anchor can be good, never great.
    subjectScore = clamp01(0.18 + relief * 0.26 + (1 - Math.abs(skyFraction - 0.4)) * 0.18) * 0.92;
    subjectNote = 'Open landscape — no landmark in frame';
  }

  // ── Composition ────────────────────────────────────────────────────────
  const horizonY = (Math.tan(cam.pitch) * cam.scale) / half.h; // 0 = centred
  const horizonThirds = Math.max(
    bell(horizonY, 0.42, 0.34),
    bell(horizonY, -0.42, 0.34),
  );
  const centreHorizonPenalty = 1 - bell(horizonY, 0, 0.14) * 0.45;
  let thirds = 0.4;
  if (primary) {
    const tx = Math.min(Math.abs(primary.nx - 0.42), Math.abs(primary.nx + 0.42), Math.abs(primary.nx));
    const ty = Math.min(Math.abs(primary.ny - 0.42), Math.abs(primary.ny + 0.42), Math.abs(primary.ny));
    thirds = clamp01(1 - (tx * 0.62 + ty * 0.62));
  }
  const roll = Math.abs(cam.roll);
  const levelness = roll < 3 * DEG ? 1
    : roll > 26 * DEG ? 0.72 + bell(roll, 32 * DEG, 12 * DEG) * 0.2   // deliberate dutch
      : clamp01(1 - (roll - 3 * DEG) / (24 * DEG)) * 0.85 + 0.1;
  const compositionScore = clamp01(
    thirds * 0.46 + horizonThirds * 0.32 + levelness * 0.22,
  ) * centreHorizonPenalty;

  // ── Light ──────────────────────────────────────────────────────────────
  const sun = atm.sunDir;
  const facing = cam.fwd.x * sun.x + cam.fwd.y * sun.y + cam.fwd.z * sun.z;
  // Side and back light read best; flat front light is the worst case.
  const angleQuality = Math.max(
    bell(facing, 0.72, 0.42) * 0.95,   // into the sun — rim light, flare
    bell(facing, -0.15, 0.55) * 0.85,  // cross light
  );
  const goldenness = clamp01(1 - Math.abs(atm.time.elev - 7) / 26);
  const clarity = 1 - clamp01(atm.weather.cloudCover * 0.35);
  const lightScore = clamp01(angleQuality * 0.5 + goldenness * 0.34 + clarity * 0.16);

  // ── Altitude ───────────────────────────────────────────────────────────
  const agl = drone.agl;
  // Generic "is this a sensible height to be shooting from" score.
  const genericAlt = clamp01(bell(agl, 110, 150) * 0.7 + smoothstep(8, 45, agl) * 0.3);
  let altScore = genericAlt;
  if (primary && primary.poi.ideal) {
    const rel = primary.poi.y - drone.pos.y;
    const idealDist = primary.poi.ideal;
    const standoff = bell(primary.dist, idealDist, idealDist * 1.5 + 70);
    const elevation = bell(rel, -primary.poi.tall * 0.5, 130);
    // Standing off well beats the generic score, but a long lens landscape
    // never falls all the way to zero.
    altScore = Math.max(genericAlt * 0.55, clamp01(standoff * 0.62 + elevation * 0.38));
  }
  if (agl < 6) altScore *= 0.55;

  // ── Stability ──────────────────────────────────────────────────────────
  const speedPenalty = 1 - clamp01((drone.speed - 9) / 26) * 0.55;
  const stabilityScore = clamp01(drone.stability * 0.72 + drone.smoothScore * 0.28) * speedPenalty;

  // ── Combine ────────────────────────────────────────────────────────────
  const parts = {
    subject: subjectScore,
    composition: compositionScore,
    light: lightScore,
    altitude: altScore,
    stability: stabilityScore,
    depth: depthScore,
  };
  let base = 0;
  for (const k in WEIGHTS) base += parts[k] * WEIGHTS[k];

  // ── Multipliers ────────────────────────────────────────────────────────
  const mults = [];
  let mult = 1;
  const timeBonus = atm.time.lightBonus;
  if (Math.abs(timeBonus - 1) > 0.02) {
    mult *= timeBonus;
    mults.push({ label: atm.time.name, value: timeBonus });
  }
  const wBonus = atm.weather.scoreBonus;
  if (Math.abs(wBonus - 1) > 0.02) {
    mult *= wBonus;
    mults.push({ label: atm.weather.name, value: wBonus });
  }
  if (primary) {
    const shots = primary.poi.shotCount || 0;
    if (shots === 0) {
      mult *= 1.2;
      mults.push({ label: 'First capture', value: 1.2 });
    } else {
      const rep = Math.max(0.42, 1 - shots * 0.22);
      mult *= rep;
      mults.push({ label: 'Repeat subject ×' + (shots + 1), value: rep });
    }
    if (primary.poi.kind === 'vista') {
      mult *= 1.3;
      mults.push({ label: 'Hidden vista', value: 1.3 });
    }
    if (primary.poi.category === 'wildlife' && primary.spooked < 0.15) {
      mult *= 1.2;
      mults.push({ label: 'Undisturbed wildlife', value: 1.2 });
    }
  }
  if (drone.mode && drone.mode.id === 'cine' && drone.speed > 1.5) {
    mult *= 1.06;
    mults.push({ label: 'Cine mode', value: 1.06 });
  }

  // A mild gamma makes the middle of the range work for its points, and the
  // multiplier stack is capped so bonuses cannot run away with the score.
  mult = Math.min(mult, 1.5);
  const score = Math.round(clamp(Math.pow(base, 1.32) * 820 * mult, 0, 1200));

  return {
    score,
    base,
    parts,
    mults,
    mult,
    primary,
    subjects,
    subjectNote,
    skyFraction,
    layers,
    nearest,
    grade: gradeFor(score),
  };
}

/** Ordered breakdown rows for the HUD / results screens. */
export function breakdownRows(shot) {
  const labels = {
    subject: 'Subject',
    composition: 'Composition',
    light: 'Light',
    altitude: 'Vantage',
    stability: 'Stability',
    depth: 'Depth',
  };
  const rows = [];
  for (const k in WEIGHTS) {
    rows.push({
      key: k,
      label: labels[k],
      value: shot.parts[k],
      weight: WEIGHTS[k],
      points: Math.round(shot.parts[k] * WEIGHTS[k] * 1000 * shot.mult),
    });
  }
  return rows;
}

/**
 * Records a continuous take. Smoothness is sampled at a fixed rate; the score
 * rewards long, fluid, varied takes and punishes jerk and stalling.
 */
export class ClipRecorder {
  constructor() {
    this.recording = false;
    this.clips = [];
    this.reset();
  }

  reset() {
    this.recording = false;
    this.clips = [];
    this.current = null;
  }

  start(state) {
    if (this.recording) return;
    this.recording = true;
    this.current = {
      t0: state.elapsed,
      duration: 0,
      smoothSum: 0,
      smoothN: 0,
      lightSum: 0,
      speedSum: 0,
      minAlt: Infinity,
      maxAlt: -Infinity,
      subjects: new Set(),
      subjectValue: 0,
      modes: new Set(),
      worstJerk: 0,
      path: [],
      sampleAcc: 0,
    };
  }

  stop(state) {
    if (!this.recording || !this.current) return null;
    this.recording = false;
    const c = this.current;
    this.current = null;
    c.duration = state.elapsed - c.t0;
    if (c.duration < 3) return null;
    const clip = this.finalize(c, state);
    this.clips.push(clip);
    return clip;
  }

  update(dt, state, shot) {
    if (!this.recording || !this.current) return;
    const c = this.current;
    const d = state.drone;
    c.duration = state.elapsed - c.t0;
    c.sampleAcc += dt;
    if (c.sampleAcc < 0.2) return;
    c.sampleAcc = 0;
    c.smoothSum += d.stability;
    c.lightSum += shot ? shot.parts.light : 0.5;
    c.speedSum += d.speed;
    c.smoothN++;
    c.minAlt = Math.min(c.minAlt, d.agl);
    c.maxAlt = Math.max(c.maxAlt, d.agl);
    c.modes.add(state.camera.mode);
    c.worstJerk = Math.max(c.worstJerk, d.jitter);
    if (shot && shot.primary && shot.primary.centred > 0.5) {
      if (!c.subjects.has(shot.primary.poi.id)) {
        c.subjects.add(shot.primary.poi.id);
        c.subjectValue += shot.primary.poi.value;
      }
    }
    if (c.path.length < 900) c.path.push(d.pos.x, d.pos.y, d.pos.z);
  }

  finalize(c, state) {
    const n = Math.max(1, c.smoothN);
    const smooth = c.smoothSum / n;
    const light = c.lightSum / n;
    const avgSpeed = c.speedSum / n;
    const dur = c.duration;

    const durScore = clamp01(smoothstep(4, 24, dur)) * (dur > 70 ? 0.85 : 1);
    const motion = clamp01(smoothstep(1.2, 6.5, avgSpeed)) * (avgSpeed > 26 ? 0.8 : 1);
    const variety = clamp01(c.subjects.size / 3) * 0.6 +
      clamp01((c.maxAlt - c.minAlt) / 160) * 0.25 +
      clamp01((c.modes.size - 1) / 2) * 0.15;
    const smoothness = clamp01(smooth * 1.05 - c.worstJerk * 0.25);

    const raw =
      smoothness * 0.38 +
      durScore * 0.20 +
      variety * 0.20 +
      light * 0.14 +
      motion * 0.08;
    const subjectBonus = 1 + clamp01(c.subjectValue / 900) * 0.35;
    const score = Math.round(clamp(raw * 1000 * subjectBonus, 0, 1300));

    return {
      duration: dur,
      score,
      smoothness,
      variety,
      light,
      motion,
      durScore,
      subjects: c.subjects.size,
      subjectBonus,
      maxAlt: c.maxAlt,
      minAlt: c.minAlt === Infinity ? 0 : c.minAlt,
      avgSpeed,
      path: c.path,
      grade: gradeFor(score),
      label: 'Clip ' + (this.clips.length + 1),
    };
  }

  get liveDuration() {
    return this.current ? this.current.duration : 0;
  }

  get liveSmooth() {
    if (!this.current || !this.current.smoothN) return 1;
    return this.current.smoothSum / this.current.smoothN;
  }
}

/** Final mission tally. */
export function buildShowreel(session) {
  const photos = [...session.photos].sort((a, b) => b.score - a.score);
  const best = photos.slice(0, 6);
  const photoTotal = best.reduce((s, p) => s + p.score, 0);

  const clips = [...session.clips].sort((a, b) => b.score - a.score);
  const bestClips = clips.slice(0, 3);
  const clipTotal = bestClips.reduce((s, c) => s + c.score, 0);

  const objectiveTotal = session.objectives
    .filter((o) => o.done)
    .reduce((s, o) => s + o.points, 0);

  const gateTotal = session.gatesPassed * 220;
  const vistaTotal = session.vistasFound * 180;

  // Bringing the aircraft home intact is worth real money.
  const recovery = session.crashed ? 0 : Math.round(600 * (0.4 + session.batteryLeft * 0.6));
  const penalty = session.crashed ? -450 : 0;

  const total = Math.max(0,
    photoTotal + clipTotal + objectiveTotal + gateTotal + vistaTotal + recovery + penalty);

  // The letter grade judges the reel itself — average shot quality, how much
  // of it you actually delivered, and mission completion — not raw volume, so
  // a short run of great frames still grades honestly.
  const photoAvg = best.length ? photoTotal / best.length : 0;
  const clipAvg = bestClips.length ? clipTotal / bestClips.length : 0;
  const coverage = Math.min(1, best.length / 6) * 0.62 + Math.min(1, bestClips.length / 3) * 0.38;
  const objRatio = session.objectives.length
    ? session.objectives.filter((o) => o.done).length / session.objectives.length : 0;
  const quality = photoAvg * 0.44 + clipAvg * 0.22 + coverage * 180 + objRatio * 220;

  return {
    photos: best,
    allPhotos: photos,
    clips: bestClips,
    allClips: clips,
    lines: [
      { label: 'Best 6 stills', value: photoTotal, detail: best.length + ' of ' + photos.length },
      { label: 'Best 3 clips', value: clipTotal, detail: bestClips.length + ' of ' + clips.length },
      { label: 'Objectives', value: objectiveTotal,
        detail: session.objectives.filter((o) => o.done).length + '/' + session.objectives.length },
      { label: 'Course gates', value: gateTotal, detail: session.gatesPassed + ' passed' },
      { label: 'Hidden vistas', value: vistaTotal, detail: session.vistasFound + ' found' },
      { label: session.crashed ? 'Airframe lost' : 'Recovery bonus',
        value: session.crashed ? penalty : recovery,
        detail: session.crashed ? session.crashReason : Math.round(session.batteryLeft * 100) + '% battery' },
    ],
    total,
    quality: Math.round(quality),
    grade: gradeFor(quality * (session.crashed ? 0.82 : 1)),
  };
}
