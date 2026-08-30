/**
 * atmosphere.js — sun position, sky gradient, fog and light colours derived
 * from a time-of-day preset and a weather preset.
 */
'use strict';

import { DEG, clamp, clamp01, lerp, smoothstep, mixColor } from './math.js';

/** Sky keyframes, keyed by sun elevation in degrees. */
const KEYS = [
  {
    elev: -12,
    zenith: [10, 16, 36], horizon: [38, 50, 84], band: [64, 60, 102],
    sun: [150, 158, 200], light: [96, 116, 164], ambient: [74, 92, 132],
    exposure: 0.55, night: 1,
  },
  {
    elev: -3,
    zenith: [20, 32, 66], horizon: [96, 84, 118], band: [162, 116, 126],
    sun: [220, 152, 140], light: [148, 138, 168], ambient: [82, 98, 134],
    exposure: 0.72, night: 0.6,
  },
  {
    elev: 1.5,
    zenith: [30, 52, 96], horizon: [232, 142, 88], band: [250, 176, 108],
    sun: [255, 168, 92], light: [255, 176, 116], ambient: [70, 92, 126],
    exposure: 0.9, night: 0.15,
  },
  {
    elev: 9,
    zenith: [52, 94, 156], horizon: [246, 200, 148], band: [252, 218, 168],
    sun: [255, 214, 152], light: [255, 214, 168], ambient: [96, 122, 158],
    exposure: 1.0, night: 0,
  },
  {
    elev: 26,
    zenith: [54, 108, 182], horizon: [190, 214, 238], band: [214, 230, 246],
    sun: [255, 246, 226], light: [255, 246, 226], ambient: [120, 146, 180],
    exposure: 1.03, night: 0,
  },
  {
    elev: 70,
    zenith: [42, 98, 188], horizon: [174, 204, 234], band: [200, 222, 242],
    sun: [255, 253, 246], light: [255, 253, 246], ambient: [132, 158, 190],
    exposure: 1.06, night: 0,
  },
];

function sampleKeys(elev) {
  let i = 0;
  while (i < KEYS.length - 2 && elev > KEYS[i + 1].elev) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp01((elev - a.elev) / (b.elev - a.elev));
  const out = {};
  for (const k of ['zenith', 'horizon', 'band', 'sun', 'light', 'ambient']) {
    out[k] = mixColor([0, 0, 0], a[k], b[k], t);
  }
  out.exposure = lerp(a.exposure, b.exposure, t);
  out.night = lerp(a.night, b.night, t);
  return out;
}

function desaturate(c, amount, target) {
  const g = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  const grey = target !== undefined ? target : g;
  return [
    lerp(c[0], grey, amount),
    lerp(c[1], grey, amount),
    lerp(c[2], grey, amount),
  ];
}

export class Atmosphere {
  constructor(timeDef, weatherDef) {
    this.time = timeDef;
    this.weather = weatherDef;
    this.rebuild();
  }

  rebuild() {
    const t = this.time, w = this.weather;
    const k = sampleKeys(t.elev);

    const el = t.elev * DEG, az = t.azim * DEG;
    // Direction pointing *towards* the sun.
    this.sunDir = {
      x: Math.sin(az) * Math.cos(el),
      y: Math.sin(el),
      z: Math.cos(az) * Math.cos(el),
    };

    // Overcast/fog flattens and cools the palette.
    const dull = clamp01(w.cloudCover * 0.72 + smoothstep(0.9, 2.4, w.fog) * 0.35);
    this.zenith = desaturate(k.zenith, dull * 0.6, 118 * (1 - k.night * 0.75));
    this.horizon = desaturate(k.horizon, dull * 0.55, 150 * (1 - k.night * 0.8));
    this.band = desaturate(k.band, dull * 0.5, 160 * (1 - k.night * 0.8));
    this.sunColor = k.sun;
    this.lightColor = desaturate(k.light, dull * 0.7, 150 * (1 - k.night * 0.8));
    this.ambientColor = desaturate(k.ambient, dull * 0.4);

    this.night = k.night;
    this.exposure = k.exposure * (1 - dull * 0.18);
    // Moonlight keeps a weak key light after sunset instead of pitch black.
    this.sunIntensity = Math.max(
      lerp(1.05, 0.28, dull) * (1 - k.night * 0.85),
      k.night * 0.52 * (1 - dull * 0.5),
    );
    this.ambientIntensity = lerp(0.42, 0.66, dull) * (1 + k.night * 0.42) + k.night * 0.10;

    // Auto-exposure: the drone's camera meters the scene, so every time of day
    // lands in a usable range and only the colour tells you the hour.
    const lum = (c) => c[0] * 0.30 + c[1] * 0.59 + c[2] * 0.11;
    const refBracket =
      lum(this.lightColor) * this.sunIntensity * 0.61 +
      lum(this.ambientColor) * this.ambientIntensity;
    this.exposureGain = clamp(205 / Math.max(24, refBracket), 0.82, 3.0);

    this.visibility = w.visibility * lerp(1, 0.82, k.night);
    this.fogDensity = w.fog;
    // Fog colour sits between the horizon band and the ambient sky.
    // Fog sits between the horizon band and the sky, pulled toward neutral so
    // heavy weather reads as haze rather than as a colour cast.
    this.fogColor = mixColor([0, 0, 0], this.horizon, this.zenith, 0.30);
    const fogGrey = (this.fogColor[0] + this.fogColor[1] + this.fogColor[2]) / 3;
    const neutral = smoothstep(0.9, 2.0, w.fog) * 0.45 + w.cloudCover * 0.18;
    this.fogColor = [
      lerp(this.fogColor[0], fogGrey * 0.98, neutral),
      lerp(this.fogColor[1], fogGrey * 1.0, neutral),
      lerp(this.fogColor[2], fogGrey * 1.08, neutral),
    ];
    this.fogNear = this.visibility * 0.08;
    this.fogFar = this.visibility;

    this.auroraStrength = k.night > 0.45 && w.cloudCover < 0.6
      ? clamp01((k.night - 0.4) * 2) * (1 - w.cloudCover)
      : 0;
    this.starStrength = clamp01((k.night - 0.25) * 1.6) * (1 - w.cloudCover * 0.9);

    // Water tint responds to the sky above it.
    this.waterSky = mixColor([0, 0, 0], this.zenith, this.horizon, 0.45);
  }

  /** Fog blend factor 0 (clear) .. 1 (fully fogged) for a distance in metres. */
  fogAmount(dist) {
    const d = (dist - this.fogNear) / (this.fogFar - this.fogNear);
    if (d <= 0) return 0;
    const x = d * this.fogDensity;
    return 1 - Math.exp(-x * x * 1.35);
  }

  /** Sky colour looking along a normalised direction — used for the backdrop. */
  skyAt(dirY, out) {
    const t = clamp01(dirY * 1.15 + 0.05);
    const k = Math.pow(t, 0.72);
    out = out || [0, 0, 0];
    return mixColor(out, this.horizon, this.zenith, k);
  }
}
