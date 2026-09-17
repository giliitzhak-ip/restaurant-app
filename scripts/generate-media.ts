/**
 * Generates every placeholder asset the storefront needs:
 *
 *   public/media/textures/*      seamless product textures (used by the engine)
 *   public/media/products/*      studio / room / detail shots per product
 *   public/media/scenes/*        hero, before-after, inspiration, projects
 *   public/media/categories/*    category tiles
 *   public/media/collections/*   collection covers
 *
 * Everything here is procedural — there are no downloads and no binary assets
 * in git. Replace a file (or point the record at a CDN URL) and the app picks
 * up the real photography with no code change. See docs/MEDIA.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  categoryTileProduct,
  collectionCoverProduct,
  seedProducts,
  seedScenes,
  type SeedProduct,
} from "../src/data/catalog-seed";
import type { TextureRecipe } from "../src/data/texture-recipes";
import {
  resolveFootprint,
  texturePixelSize,
  type TextureFootprint,
} from "../src/data/texture-geometry";
import { clamp01, hexToRgb, mix, shade, type Rgb } from "./lib/color";
import { fbm, hashSeed, makeNoise2D } from "./lib/noise";
import { encodePng, Raster, resize } from "./lib/png";
import { renderScene, type SceneTexture } from "./lib/scene";
import { renderTexture } from "./lib/textures";

const root = process.cwd();
const mediaDir = join(root, "public", "media");
const sentinel = join(mediaDir, ".generated");
const MEDIA_VERSION = "1";

// `predev` / `prebuild` call this script on every run; regenerating 250 files
// each time would be wasteful, so bail out unless the sentinel is stale.
if (!process.argv.includes("--force") && existsSync(sentinel)) {
  const current = readFileSync(sentinel, "utf8").trim();
  if (current === MEDIA_VERSION) {
    console.log("✓ media already generated (run `npm run media:generate` to rebuild)");
    process.exit(0);
  }
}
const dirs = {
  textures: join(mediaDir, "textures"),
  products: join(mediaDir, "products"),
  scenes: join(mediaDir, "scenes"),
  categories: join(mediaDir, "categories"),
  collections: join(mediaDir, "collections"),
};

for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });

const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function write(path: string, raster: Raster, level = 6) {
  writeFileSync(path, encodePng(raster, level));
}

/** Every product needs imagery, even the ones without a visualiser texture. */
function imageRecipe(product: SeedProduct): TextureRecipe {
  if (product.texture) return product.texture.recipe;
  return {
    kind: "solid",
    base: product.specs.colorHex,
    gloss: product.specs.material === "METAL" ? 0.5 : 0.12,
    brushed: product.specs.material === "METAL" ? "horizontal" : undefined,
  };
}

function footprintFor(product: SeedProduct): TextureFootprint {
  if (product.texture) {
    return resolveFootprint(
      product.texture.widthCm,
      product.texture.heightCm,
      product.texture.recipe,
    );
  }
  const widthCm = Math.max(6, product.specs.widthMm / 10);
  return resolveFootprint(widthCm, Math.max(12, product.specs.lengthMm / 10), imageRecipe(product));
}

/* ------------------------------------------------------------------ *
 * Textures
 * ------------------------------------------------------------------ */

interface BuiltTexture {
  raster: Raster;
  footprint: TextureFootprint;
}

const textures = new Map<string, BuiltTexture>();

console.log(`▸ textures (${seedProducts.length})`);
for (const product of seedProducts) {
  const recipe = imageRecipe(product);
  const footprint = footprintFor(product);
  const { width, height } = texturePixelSize(footprint);
  const raster = renderTexture(recipe, width, height, product.slug);
  textures.set(product.slug, { raster, footprint });

  if (product.texture) {
    write(join(dirs.textures, `${product.slug}.png`), raster, 7);
    write(join(dirs.textures, `${product.slug}-thumb.png`), resize(raster, 160), 7);
  }
}

/* ------------------------------------------------------------------ *
 * Studio + detail shots
 * ------------------------------------------------------------------ */

function sceneTexture(slug: string, rotateDeg?: number): SceneTexture {
  const built = textures.get(slug);
  if (!built) throw new Error(`missing texture for ${slug}`);
  return {
    raster: built.raster,
    widthCm: built.footprint.widthCm,
    heightCm: built.footprint.heightCm,
    rotateDeg,
  };
}

/** Flat-lay board on gallery paper, lit from the top-start corner. */
function renderStudio(slug: string, width = 880, height = 1100): Raster {
  const built = textures.get(slug)!;
  const out = new Raster(width, height);
  const noise = makeNoise2D(hashSeed(`studio-${slug}`));
  const bgTop = hexToRgb("#f6f3ee");
  const bgBottom = hexToRgb("#e7e1d8");

  const boardX0 = width * 0.14;
  const boardX1 = width * 0.86;
  const boardY0 = height * 0.1;
  const boardY1 = height * 0.9;
  const boardW = boardX1 - boardX0;
  const boardH = boardY1 - boardY0;
  // Show roughly one and a half real-world tiles across the board.
  const tilesAcross = 1.35;

  for (let y = 0; y < height; y += 1) {
    const ny = y / height;
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      let color: Rgb = mix(bgTop, bgBottom, smoothstep(0, 1, ny));

      const inBoard = x >= boardX0 && x <= boardX1 && y >= boardY0 && y <= boardY1;
      if (inBoard) {
        const u = ((x - boardX0) / boardW) * tilesAcross;
        const v = ((y - boardY0) / boardH) * tilesAcross * (boardH / boardW) *
          (built.footprint.widthCm / built.footprint.heightCm);
        const [r, g, b] = built.raster.sampleWrap(u - Math.floor(u), v - Math.floor(v));
        color = [r, g, b];
        // Directional light across the board.
        const key = 1 - smoothstep(0, 1.6, (x - boardX0) / boardW + (y - boardY0) / boardH);
        color = shade(color, key * 0.12 - 0.04);
        // Crisp edge shading so the board reads as a physical object.
        const edge = Math.min(
          x - boardX0,
          boardX1 - x,
          y - boardY0,
          boardY1 - y,
        );
        color = shade(color, -(1 - smoothstep(0, 4, edge)) * 0.22);
      } else {
        // Soft drop shadow below / after the board.
        const dx = Math.max(0, Math.max(boardX0 - x, x - boardX1));
        const dy = Math.max(0, Math.max(boardY0 - y, y - boardY1));
        const below = y > boardY0;
        const d = Math.hypot(dx, dy * (below ? 0.7 : 1.4));
        const shadow = (1 - smoothstep(0, 46, d)) * (below ? 0.16 : 0.07);
        color = shade(color, -shadow);
      }

      const vignette = 1 - 0.18 * Math.pow(Math.hypot(nx - 0.5, ny - 0.5) / 0.7, 2.2);
      color = shade(color, (vignette - 1) * 0.6);
      const grain = (fbm(noise, nx, ny, 300, 300, 2, 0.5) - 0.5) * 2.4;
      out.set(x, y, color[0] + grain, color[1] + grain, color[2] + grain);
    }
  }
  return out;
}

/** Macro crop with raking light — shows the material, not the format. */
function renderDetail(slug: string, width = 900, height = 620): Raster {
  const built = textures.get(slug)!;
  const out = new Raster(width, height);
  const noise = makeNoise2D(hashSeed(`detail-${slug}`));
  // Enough zoom to read the material, not so much that a 576px tile has to be
  // upscaled into mush.
  const zoom = 0.8;

  for (let y = 0; y < height; y += 1) {
    const ny = y / height;
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      const u = 0.18 + nx * zoom;
      const v = 0.22 + ny * zoom * (height / width) *
        (built.footprint.widthCm / built.footprint.heightCm);
      const [r, g, b] = built.raster.sampleWrap(u - Math.floor(u), v - Math.floor(v));
      let color: Rgb = [r, g, b];

      // Raking light from the start edge.
      const rake = 1 - smoothstep(0, 1.15, nx + ny * 0.45);
      color = shade(color, rake * 0.16 - 0.06);
      const vignette = 1 - 0.3 * Math.pow(Math.hypot(nx - 0.4, ny - 0.45) / 0.72, 2.3);
      color = shade(color, (vignette - 1) * 0.7);
      const grain = (fbm(noise, nx, ny, 340, 340, 2, 0.5) - 0.5) * 2.6;
      out.set(x, y, color[0] + grain, color[1] + grain, color[2] + grain);
    }
  }
  return out;
}

const DEFAULT_FLOOR = "oak-natural-classic";
const DEFAULT_WALL = "wall-travertine-cream";
/** Floor products get a quiet feature wall so the room is not a bare box. */
const BACKDROP_WALL = "wall-microtopping-ash";

function roomFor(product: SeedProduct) {
  const herringbone =
    product.texture?.recipe.kind === "wood" &&
    product.texture.recipe.layout === "herringbone";
  const rotate = herringbone ? 45 : undefined;

  if (product.specs.surface === "WALL") {
    return {
      floor: sceneTexture(DEFAULT_FLOOR),
      wall: sceneTexture(product.slug, rotate),
    };
  }
  if (product.category === "accessories") {
    return { floor: sceneTexture(DEFAULT_FLOOR), wall: sceneTexture(DEFAULT_WALL) };
  }
  return { floor: sceneTexture(product.slug, rotate), wall: sceneTexture(BACKDROP_WALL) };
}

console.log(`▸ product shots (${seedProducts.length * 3})`);
for (const product of seedProducts) {
  const shots = product.shots ?? ["STUDIO", "ROOM", "DETAIL"];
  if (shots.includes("STUDIO")) {
    write(join(dirs.products, `${product.slug}-studio.png`), renderStudio(product.slug));
  }
  if (shots.includes("DETAIL")) {
    write(join(dirs.products, `${product.slug}-detail.png`), renderDetail(product.slug));
  }
  if (shots.includes("ROOM")) {
    const { floor, wall } = roomFor(product);
    write(
      join(dirs.products, `${product.slug}-room.png`),
      renderScene({
        width: 1000,
        height: 700,
        floor,
        wall,
        light: 0,
        seed: `room-${product.slug}`,
      }),
    );
  }
}

/* ------------------------------------------------------------------ *
 * Scenes, category tiles, collection covers
 * ------------------------------------------------------------------ */

console.log(`▸ scenes (${seedScenes.length})`);
for (const scene of seedScenes) {
  const floorProduct = seedProducts.find((p) => p.slug === scene.floorProduct);
  const herringbone =
    floorProduct?.texture?.recipe.kind === "wood" &&
    floorProduct.texture.recipe.layout === "herringbone";
  write(
    join(dirs.scenes, `${scene.key}.png`),
    renderScene({
      width: scene.width,
      height: scene.height,
      floor: sceneTexture(scene.floorProduct, herringbone ? 45 : undefined),
      wall: scene.wallProduct ? sceneTexture(scene.wallProduct) : null,
      light: scene.light,
      seed: `scene-${scene.key}`,
      narrow: scene.room === "hall",
    }),
    5,
  );
}

console.log(`▸ category tiles (${Object.keys(categoryTileProduct).length})`);
// Category tiles are sample boards rather than rooms: six near-identical room
// renders in a grid read as a template, while a board of each material does
// not — and it puts the actual surface in front of the customer.
for (const [slug, productSlug] of Object.entries(categoryTileProduct)) {
  write(join(dirs.categories, `${slug}.png`), renderStudio(productSlug, 880, 1100), 6);
}

console.log(`▸ collection covers (${Object.keys(collectionCoverProduct).length})`);
for (const [slug, productSlug] of Object.entries(collectionCoverProduct)) {
  const product = seedProducts.find((p) => p.slug === productSlug)!;
  const { floor, wall } = roomFor(product);
  write(
    join(dirs.collections, `${slug}.png`),
    renderScene({
      width: 880,
      height: 1150,
      floor,
      wall: wall ?? sceneTexture(BACKDROP_WALL),
      light: 1,
      seed: `collection-${slug}`,
    }),
    5,
  );
}

writeFileSync(sentinel, MEDIA_VERSION);
console.log("✓ media generated into public/media");
