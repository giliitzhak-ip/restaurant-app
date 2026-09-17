import type { TextureRecipe } from "./texture-recipes";

/**
 * Texture contract
 * ----------------
 * `ProductTexture.widthCm` / `heightCm` describe the real-world footprint of
 * the WHOLE texture image, and `repeatX` / `repeatY` say how many product
 * units (planks, tiles, slats) are visible inside it. The render engine only
 * needs the footprint; the unit counts are shown in the admin UI and used for
 * the "plank size" copy.
 *
 * For generated demo textures the footprint is derived from the recipe, so the
 * authored per-unit size in the seed stays readable (19 × 190 cm plank) while
 * the image itself covers four planks.
 */
export interface TextureFootprint {
  /** Real-world width of the image, in cm. */
  widthCm: number;
  /** Real-world height of the image, in cm. */
  heightCm: number;
  repeatX: number;
  repeatY: number;
}

export function resolveFootprint(
  unitWidthCm: number,
  unitHeightCm: number,
  recipe: TextureRecipe | null,
): TextureFootprint {
  if (!recipe) {
    return { widthCm: unitWidthCm, heightCm: unitHeightCm, repeatX: 1, repeatY: 1 };
  }

  switch (recipe.kind) {
    case "wood": {
      if (recipe.layout === "herringbone") {
        // Parquet blocks: a 2L × 2L checkerboard of L planks per block tiles
        // seamlessly, and the engine lays it at 45° for the herringbone look.
        const L = Math.max(2, Math.round(unitHeightCm / unitWidthCm));
        const side = unitWidthCm * 2 * L;
        return { widthCm: side, heightCm: side, repeatX: 2 * L, repeatY: 2 * L };
      }
      return {
        widthCm: unitWidthCm * recipe.planks,
        heightCm: unitHeightCm,
        repeatX: recipe.planks,
        repeatY: 1,
      };
    }
    case "stone":
      return {
        widthCm: unitWidthCm * recipe.tiles,
        heightCm: unitHeightCm * recipe.tiles,
        repeatX: recipe.tiles,
        repeatY: recipe.tiles,
      };
    case "brick":
      return {
        widthCm: unitWidthCm * recipe.columns,
        heightCm: unitHeightCm * recipe.rows,
        repeatX: recipe.columns,
        repeatY: recipe.rows,
      };
    case "slat":
      // Vertical slats are uniform along their length, so a square crop of the
      // panel width tiles correctly and keeps the image small.
      return {
        widthCm: unitWidthCm,
        heightCm: Math.min(unitHeightCm, unitWidthCm),
        repeatX: recipe.slats,
        repeatY: 1,
      };
    case "solid":
      return {
        widthCm: unitWidthCm,
        heightCm: Math.min(unitHeightCm, unitWidthCm * 4),
        repeatX: 1,
        repeatY: 1,
      };
    case "concrete":
    case "terrazzo":
    default:
      return { widthCm: unitWidthCm, heightCm: unitHeightCm, repeatX: 1, repeatY: 1 };
  }
}

/** Pixel size of a generated texture, capped on the long edge. */
export function texturePixelSize(footprint: TextureFootprint, longEdge = 576) {
  const ratio = footprint.widthCm / footprint.heightCm;
  if (ratio >= 1) {
    return {
      width: longEdge,
      height: Math.max(48, Math.round(longEdge / ratio)),
    };
  }
  return {
    width: Math.max(48, Math.round(longEdge * ratio)),
    height: longEdge,
  };
}
