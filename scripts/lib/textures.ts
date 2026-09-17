import type {
  BrickRecipe,
  ConcreteRecipe,
  SlatRecipe,
  SolidRecipe,
  StoneRecipe,
  TerrazzoRecipe,
  TextureRecipe,
  WoodRecipe,
} from "../../src/data/texture-recipes";
import { clamp01, hexToRgb, mix, shade, type Rgb } from "./color";
import { fbm, hashSeed, makeNoise2D, mulberry32, ridged, type Noise2D } from "./noise";
import { Raster } from "./png";

const frac = (v: number) => v - Math.floor(v);
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Renders a seamless texture tile for a product recipe. */
export function renderTexture(
  recipe: TextureRecipe,
  width: number,
  height: number,
  key: string,
): Raster {
  const seed = hashSeed(key);
  const noise = makeNoise2D(seed);
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const raster = new Raster(width, height);

  switch (recipe.kind) {
    case "wood":
      return recipe.layout === "herringbone"
        ? woodBlocks(raster, recipe, noise, rand)
        : woodPlanks(raster, recipe, noise, rand);
    case "stone":
      return stone(raster, recipe, noise);
    case "concrete":
      return concrete(raster, recipe, noise, rand);
    case "slat":
      return slat(raster, recipe, noise);
    case "brick":
      return brick(raster, recipe, noise, rand);
    case "terrazzo":
      return terrazzo(raster, recipe, noise, rand);
    case "solid":
    default:
      return solid(raster, recipe as SolidRecipe, noise);
  }
}

/* ------------------------------ wood ------------------------------ */

interface Knot {
  x: number;
  y: number;
  r: number;
}

function woodPlanks(
  raster: Raster,
  recipe: WoodRecipe,
  noise: Noise2D,
  rand: () => number,
): Raster {
  const { width, height } = raster;
  const base = hexToRgb(recipe.base);
  const grainColor = hexToRgb(recipe.grain);
  const accent = recipe.accent ? hexToRgb(recipe.accent) : null;

  const planks = Math.max(1, recipe.planks);
  const tone: number[] = [];
  const phase: number[] = [];
  const knots: Knot[][] = [];
  for (let i = 0; i < planks; i += 1) {
    tone.push((rand() - 0.5) * 0.14);
    phase.push(rand() * 7);
    const count = accent && rand() > 0.45 ? 1 + Math.floor(rand() * 2) : 0;
    knots.push(
      Array.from({ length: count }, () => ({
        x: 0.25 + rand() * 0.5,
        y: rand(),
        r: 0.008 + rand() * 0.014,
      })),
    );
  }

  const bevelWidth = 0.035 + recipe.bevel * 0.03;

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const scaled = u * planks;
      const index = Math.min(planks - 1, Math.floor(scaled));
      const lu = scaled - index;

      // Two grain scales plus a slow warp give oak its cathedral figure
      // instead of the uniform pinstripe a single octave produces.
      const warp = (fbm(noise, u, v + phase[index]!, 5, 3, 3, 0.5) - 0.5) * 0.05;
      const broad = ridged(fbm(noise, u + warp, v + phase[index]!, 22, 4, 4, 0.6));
      const fibre = ridged(
        fbm(noise, u + warp, v + phase[index]! + 3.1, 96, 7, 3, 0.5),
      );
      const g = clamp01(broad * 0.7 + fibre * 0.4);
      let color = mix(base, grainColor, clamp01(g * recipe.contrast * 1.2));

      // Occasional darker late-wood band.
      const band = ridged(fbm(noise, u + warp, v + phase[index]! + 7.7, 9, 2, 3, 0.5));
      color = mix(color, shade(grainColor, -0.12), clamp01((band - 0.72) * 2.2) * recipe.contrast * 0.6);

      if (accent) {
        for (const knot of knots[index]!) {
          const dx = (lu - knot.x) * 0.6;
          const dy = Math.min(Math.abs(v - knot.y), 1 - Math.abs(v - knot.y));
          const d = Math.hypot(dx, dy);
          if (d < knot.r * 1.8) {
            const core = 1 - smoothstep(knot.r * 0.3, knot.r * 1.1, d);
            const halo = 1 - smoothstep(knot.r * 0.9, knot.r * 1.8, d);
            color = mix(color, shade(accent, -0.3), core * 0.5);
            color = mix(color, accent, halo * 0.14);
          }
        }
      }

      color = shade(color, tone[index]!);

      // Micro roughness / brushing.
      const micro = fbm(noise, u, v, 240, 90, 2, 0.5) - 0.5;
      color = shade(color, micro * recipe.roughness * 0.14);

      // Bevel at plank edges and ends.
      const edge = Math.min(lu, 1 - lu);
      const end = Math.min(v, 1 - v);
      // Plank ends are deliberately faint: a repeating tile would otherwise
      // draw a hard grid of aligned end joints across the whole floor.
      const bevel =
        (1 - smoothstep(0, bevelWidth, edge)) * 0.9 +
        (1 - smoothstep(0, bevelWidth * 0.35, end)) * 0.16;
      color = shade(color, -clamp01(bevel) * recipe.bevel * 0.5);

      // Soft sheen across the board.
      if (recipe.gloss > 0) {
        const sheen = smoothstep(0.1, 0.55, 1 - Math.abs(lu - 0.45));
        color = shade(color, sheen * recipe.gloss * 0.12);
      }

      raster.set(x, y, color[0], color[1], color[2]);
    }
  }
  return raster;
}

/**
 * Parquet blocks: a checkerboard of L planks per block. Tiles seamlessly and
 * reads as herringbone once the engine lays it at 45°.
 */
function woodBlocks(
  raster: Raster,
  recipe: WoodRecipe,
  noise: Noise2D,
  rand: () => number,
): Raster {
  const { width, height } = raster;
  const base = hexToRgb(recipe.base);
  const grainColor = hexToRgb(recipe.grain);
  const units = Math.max(4, recipe.planks * 2);
  const blockUnits = units / 2;
  const tone = Array.from({ length: units * 2 }, () => (rand() - 0.5) * 0.12);

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const gx = u * units;
      const gy = v * units;
      const bx = Math.floor(gx / blockUnits);
      const by = Math.floor(gy / blockUnits);
      const horizontal = (bx + by) % 2 === 0;

      const acrossRaw = horizontal ? gy : gx;
      const across = frac(acrossRaw);
      const alongLocal = horizontal
        ? (gx - bx * blockUnits) / blockUnits
        : (gy - by * blockUnits) / blockUnits;
      const plankKey = Math.floor(acrossRaw) % (units * 2);

      const g = horizontal
        ? ridged(fbm(noise, v, u + plankKey * 0.7, 72, 5, 4, 0.55))
        : ridged(fbm(noise, u, v + plankKey * 0.7, 72, 5, 4, 0.55));

      let color = mix(base, grainColor, clamp01(g * recipe.contrast * 1.1));
      color = shade(color, tone[plankKey]!);

      const micro = fbm(noise, u, v, 240, 240, 2, 0.5) - 0.5;
      color = shade(color, micro * recipe.roughness * 0.12);

      const edge = Math.min(across, 1 - across);
      const end = Math.min(alongLocal, 1 - alongLocal);
      const bevel =
        (1 - smoothstep(0, 0.07, edge)) * 0.9 + (1 - smoothstep(0, 0.035, end)) * 0.8;
      color = shade(color, -clamp01(bevel) * recipe.bevel * 0.55);

      if (recipe.gloss > 0) {
        const sheen = smoothstep(0.1, 0.6, 1 - Math.abs(alongLocal - 0.4));
        color = shade(color, sheen * recipe.gloss * 0.1);
      }

      raster.set(x, y, color[0], color[1], color[2]);
    }
  }
  return raster;
}

/* ------------------------------ stone ----------------------------- */

function stone(raster: Raster, recipe: StoneRecipe, noise: Noise2D): Raster {
  const { width, height } = raster;
  const base = hexToRgb(recipe.base);
  const vein = hexToRgb(recipe.vein);
  const shadow = hexToRgb(recipe.shadow);
  const grout = recipe.groutColor ? hexToRgb(recipe.groutColor) : shadow;
  const tiles = Math.max(1, recipe.tiles);
  const groutPx = recipe.grout;

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;

      // Broad cloudiness across the slab.
      const cloud = fbm(noise, u, v, 3, 3, 3, 0.55);
      let color = mix(base, shadow, clamp01((cloud - 0.3) * 1.4) * 0.45);

      // Bedding planes — stretched almost flat, which is what makes
      // travertine read as travertine. Driven by `veinDensity`.
      const bedding = ridged(fbm(noise, u, v, 2, 16, 3, 0.5));
      color = mix(
        color,
        shadow,
        clamp01((bedding - 0.5) * 1.7) * recipe.veinDensity * 0.42,
      );

      // Thin marble veins — strongest when the stone has FEW bedding planes.
      const warp = (fbm(noise, u, v, 4, 4, 2, 0.5) - 0.5) * 0.18;
      const line = ridged(fbm(noise, u + warp, v * 0.7 + warp, 2, 5, 3, 0.55));
      const veinAmt = clamp01((line - 0.82) * 6);
      color = mix(color, vein, veinAmt * (1 - recipe.veinDensity) * 1.1);

      // Pores and crystalline speckle.
      const pore = fbm(noise, u, v, 90, 90, 3, 0.5);
      color = shade(color, -clamp01((pore - 0.74) * 3.4) * 0.12 * recipe.veinDensity);

      const micro = fbm(noise, u, v, 320, 320, 2, 0.5) - 0.5;
      color = shade(color, micro * 0.05);

      if (recipe.gloss > 0) {
        const sheen = smoothstep(0.2, 1, 1 - Math.abs(u + v - 1));
        color = shade(color, sheen * recipe.gloss * 0.1);
      }

      if (groutPx > 0) {
        const tileX = frac(u * tiles) * (width / tiles);
        const tileY = frac(v * tiles) * (height / tiles);
        const dx = Math.min(tileX, width / tiles - tileX);
        const dy = Math.min(tileY, height / tiles - tileY);
        const d = Math.min(dx, dy);
        if (d < groutPx) {
          const t = 1 - smoothstep(groutPx * 0.4, groutPx, d);
          color = mix(color, shade(grout, -0.12), t);
        }
      }

      raster.set(x, y, color[0], color[1], color[2]);
    }
  }
  return raster;
}

/* ----------------------------- concrete --------------------------- */

function concrete(
  raster: Raster,
  recipe: ConcreteRecipe,
  noise: Noise2D,
  rand: () => number,
): Raster {
  const { width, height } = raster;
  const base = hexToRgb(recipe.base);
  const mottle = hexToRgb(recipe.mottle);

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;

      const cloud = fbm(noise, u, v, 4, 4, 5, 0.6);
      let color = mix(base, mottle, cloud * recipe.cloudiness);

      // Vertical pour streaks.
      const streak = fbm(noise, u, v, 14, 3, 3, 0.5) - 0.5;
      color = shade(color, streak * recipe.cloudiness * 0.12);

      const micro = fbm(noise, u, v, 260, 260, 2, 0.5) - 0.5;
      color = shade(color, micro * 0.06);

      // Pinholes / aggregate.
      if (rand() < recipe.grit * 0.012) {
        color = shade(color, -0.22 - rand() * 0.2);
      }

      if (recipe.panels > 1) {
        const joint = frac(u * recipe.panels) * (width / recipe.panels);
        const d = Math.min(joint, width / recipe.panels - joint);
        if (d < 2) color = shade(color, -0.22 * (1 - d / 2));
      }

      raster.set(x, y, color[0], color[1], color[2]);
    }
  }
  return raster;
}

/* ------------------------------- slat ----------------------------- */

function slat(raster: Raster, recipe: SlatRecipe, noise: Noise2D): Raster {
  const { width, height } = raster;
  const base = hexToRgb(recipe.base);
  const groove = hexToRgb(recipe.groove);
  const grain = recipe.grain ? hexToRgb(recipe.grain) : null;
  const felt = recipe.felt ? hexToRgb(recipe.felt) : null;
  const slats = Math.max(1, recipe.slats);
  const grooveFrac = 0.26;

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const t = frac(u * slats);
      let color: Rgb;

      if (t < grooveFrac) {
        const gt = t / grooveFrac;
        const depth = 1 - Math.abs(gt * 2 - 1);
        color = mix(groove, felt ?? groove, 0.5);
        color = shade(color, -recipe.depth * 0.35 * depth);
      } else {
        const ft = (t - grooveFrac) / (1 - grooveFrac);
        color = base;
        if (grain) {
          const g = ridged(fbm(noise, v, u, 60, 6, 4, 0.55));
          color = mix(color, grain, clamp01(g * 0.45));
        }
        // Cylindrical face shading + shadow next to the groove.
        const face = 1 - Math.pow(Math.abs(ft * 2 - 1), 2);
        color = shade(color, face * 0.06 * (1 + recipe.depth));
        const contact = 1 - smoothstep(0, 0.16, ft);
        color = shade(color, -contact * recipe.depth * 0.3);
        const micro = fbm(noise, u, v, 240, 240, 2, 0.5) - 0.5;
        color = shade(color, micro * 0.05);
      }

      raster.set(x, y, color[0], color[1], color[2]);
    }
  }
  return raster;
}

/* ------------------------------ brick ----------------------------- */

function brick(
  raster: Raster,
  recipe: BrickRecipe,
  noise: Noise2D,
  rand: () => number,
): Raster {
  const { width, height } = raster;
  const base = hexToRgb(recipe.base);
  const variation = hexToRgb(recipe.variation);
  const mortar = hexToRgb(recipe.mortar);
  const rows = Math.max(1, recipe.rows);
  const columns = Math.max(1, recipe.columns);
  const tones = Array.from({ length: rows * columns * 2 }, () => rand());
  const jointPx = Math.max(2, Math.round(height / rows / 9));

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    const rowF = v * rows;
    const row = Math.floor(rowF);
    const rowOffset = row % 2 === 0 ? 0 : 0.5;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const colF = u * columns + rowOffset;
      const col = Math.floor(colF);
      const idx = (row * columns + (((col % columns) + columns) % columns)) % tones.length;
      const tone = tones[idx]!;

      const inRow = (rowF - row) * (height / rows);
      const inCol = (colF - col) * (width / columns);
      const dRow = Math.min(inRow, height / rows - inRow);
      const dCol = Math.min(inCol, width / columns - inCol);
      const d = Math.min(dRow, dCol);

      let color = mix(base, variation, tone * 0.85);
      const micro = fbm(noise, u, v, 220, 220, 3, 0.5) - 0.5;
      color = shade(color, micro * 0.1);
      const wear = fbm(noise, u, v, 30, 30, 3, 0.5) - 0.5;
      color = shade(color, wear * 0.12);

      if (d < jointPx) {
        const t = 1 - smoothstep(jointPx * 0.45, jointPx, d);
        color = mix(color, mortar, t);
        color = shade(color, -t * 0.12);
      }

      raster.set(x, y, color[0], color[1], color[2]);
    }
  }
  return raster;
}

/* ----------------------------- terrazzo --------------------------- */

function terrazzo(
  raster: Raster,
  recipe: TerrazzoRecipe,
  noise: Noise2D,
  rand: () => number,
): Raster {
  const { width, height } = raster;
  const base = hexToRgb(recipe.base);
  const chipColors = recipe.chips.map(hexToRgb);

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const micro = fbm(noise, u, v, 200, 200, 3, 0.5) - 0.5;
      const cloud = fbm(noise, u, v, 6, 6, 3, 0.5) - 0.5;
      const color = shade(shade(base, cloud * 0.06), micro * 0.07);
      raster.set(x, y, color[0], color[1], color[2]);
    }
  }

  const area = width * height;
  const chipPx = Math.max(3, (recipe.chipSize / 100) * Math.min(width, height));
  const count = Math.round((area / (chipPx * chipPx)) * recipe.density * 0.55);

  for (let i = 0; i < count; i += 1) {
    const cx = rand() * width;
    const cy = rand() * height;
    const radius = chipPx * (0.45 + rand() * 0.75);
    const color = chipColors[Math.floor(rand() * chipColors.length)]!;
    const squash = 0.6 + rand() * 0.7;
    const angle = rand() * Math.PI;
    const edges = 5 + Math.floor(rand() * 3);
    const wobble = Array.from({ length: edges }, () => 0.75 + rand() * 0.45);

    const r0 = Math.ceil(radius * 1.6);
    for (let dy = -r0; dy <= r0; dy += 1) {
      for (let dx = -r0; dx <= r0; dx += 1) {
        // Rotate into chip space, then test an irregular polygon radius.
        const rx = dx * Math.cos(angle) + dy * Math.sin(angle);
        const ry = (-dx * Math.sin(angle) + dy * Math.cos(angle)) / squash;
        const dist = Math.hypot(rx, ry);
        if (dist > radius * 1.3) continue;
        const theta = Math.atan2(ry, rx) + Math.PI;
        const seg = Math.floor((theta / (Math.PI * 2)) * edges) % edges;
        const limit = radius * wobble[seg]!;
        if (dist > limit) continue;
        const px = ((Math.round(cx + dx) % width) + width) % width;
        const py = ((Math.round(cy + dy) % height) + height) % height;
        const edgeShade = 1 - smoothstep(limit * 0.75, limit, dist);
        const shaded = shade(color, -0.06 + edgeShade * 0.06);
        raster.set(px, py, shaded[0], shaded[1], shaded[2]);
      }
    }
  }

  return raster;
}

/* ------------------------------ solid ----------------------------- */

function solid(raster: Raster, recipe: SolidRecipe, noise: Noise2D): Raster {
  const { width, height } = raster;
  const base = hexToRgb(recipe.base);

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      let color = base;

      if (recipe.brushed === "horizontal") {
        const streak = fbm(noise, v, u, 220, 6, 3, 0.5) - 0.5;
        color = shade(color, streak * 0.14);
      } else if (recipe.brushed === "vertical") {
        const streak = fbm(noise, u, v, 220, 6, 3, 0.5) - 0.5;
        color = shade(color, streak * 0.14);
      } else {
        const micro = fbm(noise, u, v, 180, 180, 3, 0.5) - 0.5;
        color = shade(color, micro * 0.1);
      }

      if (recipe.gloss > 0) {
        const sheen = smoothstep(0.25, 1, 1 - Math.abs(v - 0.35) * 1.6);
        color = shade(color, sheen * recipe.gloss * 0.18);
      }

      raster.set(x, y, color[0], color[1], color[2]);
    }
  }
  return raster;
}
