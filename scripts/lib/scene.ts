import { clamp01, hexToRgb, mix, shade, type Rgb } from "./color";
import { applyHomography, solveHomography, type Point } from "./homography";
import { fbm, hashSeed, makeNoise2D } from "./noise";
import { Raster } from "./png";

export interface SceneTexture {
  raster: Raster;
  /** Real-world footprint of the texture image, in centimetres. */
  widthCm: number;
  heightCm: number;
  /** Extra rotation for herringbone-style tiles. */
  rotateDeg?: number;
}

export interface SceneOptions {
  width: number;
  height: number;
  floor: SceneTexture;
  wall: SceneTexture | null;
  /** 0 = soft morning, 1 = bright afternoon, 2 = warm evening. */
  light: 0 | 1 | 2;
  seed: string;
  /** Narrow rooms (halls) get a deeper, tighter perspective. */
  narrow?: boolean;
}

const WALL_BASE = "#eae5dd";
const CEILING_BASE = "#f4f1eb";
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const lightPresets: Record<
  0 | 1 | 2,
  { ambient: number; key: number; warmth: Rgb; contrast: number }
> = {
  0: { ambient: 0.86, key: 0.5, warmth: [255, 248, 236], contrast: 0.9 },
  1: { ambient: 0.8, key: 0.78, warmth: [255, 250, 242], contrast: 1.08 },
  2: { ambient: 0.7, key: 0.62, warmth: [255, 226, 186], contrast: 1.0 },
};

/**
 * Renders a generated interior: one back wall, two side walls, ceiling and
 * floor, lit by a single window on the left wall. The floor and the feature
 * wall are covered with the real product textures via a projective transform,
 * which is the same maths the browser engine uses on customer photos.
 */
export function renderScene(options: SceneOptions): Raster {
  const { width, height, floor, wall, light, seed, narrow } = options;
  const raster = new Raster(width, height);
  const noise = makeNoise2D(hashSeed(seed));
  const preset = lightPresets[light];

  // --- room geometry, in normalised image space -----------------------
  const bx0 = narrow ? 0.3 : 0.24;
  const bx1 = 1 - bx0;
  const by0 = narrow ? 0.06 : 0.12;
  const by1 = narrow ? 0.74 : 0.64;

  const fx0 = -0.62;
  const fx1 = 1.62;
  const fyFloor = 1.24;
  const fyCeil = -0.26;

  // Room dimensions in metres.
  const roomWidth = narrow ? 1.8 : 4.2;
  const roomDepth = narrow ? 6.5 : 5.2;
  const roomHeight = 2.75;
  const sideDepth = roomDepth * 0.82;

  const toPx = (p: Point): Point => [p[0] * width, p[1] * height];

  // floor: image -> world (x metres across, z metres into the room)
  const floorH = solveHomography(
    [
      toPx([bx0, by1]),
      toPx([bx1, by1]),
      toPx([fx1, fyFloor]),
      toPx([fx0, fyFloor]),
    ],
    [
      [0, 0],
      [roomWidth, 0],
      [roomWidth, roomDepth],
      [0, roomDepth],
    ],
  );

  const ceilingH = solveHomography(
    [
      toPx([bx0, by0]),
      toPx([bx1, by0]),
      toPx([fx1, fyCeil]),
      toPx([fx0, fyCeil]),
    ],
    [
      [0, 0],
      [roomWidth, 0],
      [roomWidth, roomDepth],
      [0, roomDepth],
    ],
  );

  // side walls: image -> world (z metres from back wall, y metres from floor)
  const leftTop = lineAt(bx0, by0, 0.5, 0.42, 0);
  const leftBottom = lineAt(bx0, by1, 0.5, 0.42, 0);
  const rightTop = lineAt(bx1, by0, 0.5, 0.42, 1);
  const rightBottom = lineAt(bx1, by1, 0.5, 0.42, 1);

  const leftH = solveHomography(
    [toPx([bx0, by0]), toPx([0, leftTop]), toPx([0, leftBottom]), toPx([bx0, by1])],
    [
      [0, roomHeight],
      [sideDepth, roomHeight],
      [sideDepth, 0],
      [0, 0],
    ],
  );

  const rightH = solveHomography(
    [toPx([bx1, by0]), toPx([1, rightTop]), toPx([1, rightBottom]), toPx([bx1, by1])],
    [
      [0, roomHeight],
      [sideDepth, roomHeight],
      [sideDepth, 0],
      [0, 0],
    ],
  );

  // --- window on the left wall (world coords on that plane) ----------
  const win = { z0: 1.1, z1: 3.1, y0: 0.85, y1: 2.3 };
  const lightFoot = { x: roomWidth * 0.26, z: (win.z0 + win.z1) / 2 };

  const junctionY = (x: number) => {
    if (x < bx0) return interp(x, fx0, fyFloor, bx0, by1);
    if (x > bx1) return interp(x, bx1, by1, fx1, fyFloor);
    return by1;
  };
  const ceilY = (x: number) => {
    if (x < bx0) return interp(x, fx0, fyCeil, bx0, by0);
    if (x > bx1) return interp(x, bx1, by0, fx1, fyCeil);
    return by0;
  };

  const skirting = 0.075 / 2.75; // 7.5 cm skirting, in wall-height units

  for (let py = 0; py < height; py += 1) {
    const ny = (py + 0.5) / height;
    for (let px = 0; px < width; px += 1) {
      const nx = (px + 0.5) / width;
      const jy = junctionY(nx);
      const cy = ceilY(nx);

      let color: Rgb;
      let shadeAmount = 0;

      if (ny > jy) {
        // ---------------- floor ----------------
        const [wx, wz] = applyHomography(floorH, px + 0.5, py + 0.5);
        color = sampleTexture(floor, wx, wz, noise);

        const pool = Math.exp(
          -Math.pow((wx - lightFoot.x) / (roomWidth * 0.55), 2) -
            Math.pow((wz - lightFoot.z) / (roomDepth * 0.34), 2),
        );
        const depthFade = smoothstep(-0.4, 2.4, wz);
        shadeAmount =
          -0.2 + preset.key * 0.26 * pool + depthFade * 0.06 - (1 - depthFade) * 0.12;

        // Contact shading where the floor meets the walls.
        const nearBack = 1 - smoothstep(0, 0.55, wz);
        const nearSide =
          1 - smoothstep(0, 0.5, Math.min(wx, Math.max(0, roomWidth - wx)));
        shadeAmount -= nearBack * 0.12 + nearSide * 0.08;
      } else if (ny < cy) {
        // ---------------- ceiling ----------------
        const [, wz] = applyHomography(ceilingH, px + 0.5, py + 0.5);
        color = hexToRgb(CEILING_BASE);
        const depthFade = smoothstep(0, 3.2, wz);
        shadeAmount = -0.04 + depthFade * 0.08;
      } else if (nx < bx0) {
        // ---------------- left wall (window wall) ----------------
        const [wz, wy] = applyHomography(leftH, px + 0.5, py + 0.5);
        const inWindow = wz > win.z0 && wz < win.z1 && wy > win.y0 && wy < win.y1;
        if (inWindow) {
          const frame =
            Math.min(wz - win.z0, win.z1 - wz, wy - win.y0, win.y1 - wy);
          if (frame < 0.05) {
            color = hexToRgb("#d9d4ca");
            shadeAmount = -0.3;
          } else {
            const glow = smoothstep(0.05, 0.45, frame);
            color = mix(hexToRgb("#f6f2e8"), [255, 255, 255], glow);
            shadeAmount = 0.34 + glow * 0.2;
          }
        } else {
          color = hexToRgb(WALL_BASE);
          const nearWindow = Math.exp(-Math.pow((wy - 1.5) / 1.6, 2));
          shadeAmount = -0.16 - nearWindow * 0.04 + smoothstep(0, 2.8, wz) * 0.05;
          if (wy < skirting * 2.75) {
            color = hexToRgb("#f2efe9");
            shadeAmount -= 0.06;
          }
        }
      } else if (nx > bx1) {
        // ---------------- right wall ----------------
        const [wz, wy] = applyHomography(rightH, px + 0.5, py + 0.5);
        color = hexToRgb(WALL_BASE);
        shadeAmount = -0.05 + preset.key * 0.06 - smoothstep(0, 3, wz) * 0.1;
        shadeAmount -= (1 - smoothstep(0, 0.5, wy)) * 0.08;
        if (wy < skirting * 2.75) {
          color = hexToRgb("#f2efe9");
          shadeAmount -= 0.04;
        }
      } else {
        // ---------------- back wall (feature wall) ----------------
        const wx = ((nx - bx0) / (bx1 - bx0)) * roomWidth;
        const wy = ((by1 - ny) / (by1 - by0)) * roomHeight;
        if (wall && wy > skirting * 2.75) {
          color = sampleTexture(wall, wx, roomHeight - wy, noise);
        } else if (wy <= skirting * 2.75) {
          color = hexToRgb("#f2efe9");
          shadeAmount -= 0.05;
        } else {
          color = hexToRgb(WALL_BASE);
        }
        const fromWindow = Math.exp(-Math.pow((wx - roomWidth * 0.18) / 2.1, 2));
        shadeAmount += -0.12 + preset.key * 0.2 * fromWindow;
        shadeAmount -= (1 - smoothstep(0, 0.45, wy)) * 0.1;
        shadeAmount -= smoothstep(2.2, 2.75, wy) * 0.05;
      }

      // --- light wrap, grade, vignette, grain -------------------------
      let out = shade(color, shadeAmount * 0.9);
      out = mix(out, preset.warmth, 0.1 + 0.12 * clamp01(shadeAmount + 0.3));

      const vignette =
        1 -
        0.34 *
          Math.pow(
            Math.hypot((nx - 0.5) * 1.15, (ny - 0.5) * 1.05) / 0.72,
            2.4,
          );
      out = shade(out, (vignette - 1) * 0.55);

      // Gentle S-curve for photographic contrast.
      out = [
        curve(out[0], preset.contrast),
        curve(out[1], preset.contrast),
        curve(out[2], preset.contrast),
      ];

      const grain = (fbm(noise, nx, ny, 320, 320, 2, 0.5) - 0.5) * 3.2;
      raster.set(px, py, out[0] + grain, out[1] + grain, out[2] + grain);
    }
  }

  return raster;
}

function curve(value: number, amount: number) {
  const v = value / 255;
  const mid = 0.5 + (v - 0.5) * amount;
  return clamp01(mid) * 255;
}

function sampleTexture(
  texture: SceneTexture,
  worldX: number,
  worldY: number,
  noise: (x: number, y: number, px: number, py: number) => number,
): Rgb {
  let x = worldX;
  let y = worldY;
  if (texture.rotateDeg) {
    const a = (texture.rotateDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    x = worldX * cos - worldY * sin;
    y = worldX * sin + worldY * cos;
  }
  const u = x / (texture.widthCm / 100);
  const v = y / (texture.heightCm / 100);
  const [r, g, b] = texture.raster.sampleWrap(u - Math.floor(u), v - Math.floor(v));
  // A whisper of large-scale variation so tiling never reads as a pattern.
  const drift = (fbm(noise, u * 0.05, v * 0.05, 5, 5, 2, 0.5) - 0.5) * 0.05;
  return shade([r, g, b], drift);
}

/** Y coordinate where the line through (x0,y0) and the vanishing point hits `targetX`. */
function lineAt(
  x0: number,
  y0: number,
  vpX: number,
  vpY: number,
  targetX: number,
) {
  const t = (targetX - vpX) / (x0 - vpX);
  return vpY + (y0 - vpY) * t;
}

function interp(x: number, x0: number, y0: number, x1: number, y1: number) {
  const t = (x - x0) / (x1 - x0);
  return y0 + (y1 - y0) * t;
}
