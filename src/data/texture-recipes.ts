/**
 * Texture recipes.
 *
 * Every demo product ships a procedurally generated, seamless texture so the
 * room designer has something real to tile. When the client uploads genuine
 * scans, the recipe is simply ignored — `ProductTexture.imageUrl` points at
 * the uploaded file instead (see docs/MEDIA.md).
 */

export interface WoodRecipe {
  kind: "wood";
  /** Lightest tone of the board. */
  base: string;
  /** Grain / late-wood colour. */
  grain: string;
  /** Optional knot + mineral streak colour. */
  accent?: string;
  /** Planks visible across one tile. */
  planks: number;
  /** 0..1 — grain contrast. */
  contrast: number;
  /** 0..1 — surface roughness / brushing. */
  roughness: number;
  /** 0..1 — bevel darkness between planks. */
  bevel: number;
  /** 0..1 — specular sheen (lacquered vs. oiled). */
  gloss: number;
  /** Block layout; "herringbone" renders parquet blocks laid at 45°. */
  layout?: "straight" | "herringbone";
}

export interface StoneRecipe {
  kind: "stone";
  base: string;
  vein: string;
  shadow: string;
  /** 0..1 */
  veinDensity: number;
  /** 0..1 — polished to honed. */
  gloss: number;
  /** Tiles across one texture tile. */
  tiles: number;
  /** Grout width in px of the generated tile; 0 = seamless slab. */
  grout: number;
  groutColor?: string;
}

export interface ConcreteRecipe {
  kind: "concrete";
  base: string;
  mottle: string;
  /** 0..1 — pour marks and cloudiness. */
  cloudiness: number;
  /** 0..1 — pinholes and aggregate. */
  grit: number;
  /** Panel joints across the tile; 0 = monolithic. */
  panels: number;
}

export interface SlatRecipe {
  kind: "slat";
  base: string;
  groove: string;
  /** Slats across the tile. */
  slats: number;
  /** 0..1 — how deep the groove shadow reads. */
  depth: number;
  /** Fine wood grain on top of the slats. */
  grain?: string;
  /** Felt backing visible in the groove (acoustic panels). */
  felt?: string;
}

export interface BrickRecipe {
  kind: "brick";
  base: string;
  variation: string;
  mortar: string;
  rows: number;
  columns: number;
}

export interface TerrazzoRecipe {
  kind: "terrazzo";
  base: string;
  chips: string[];
  density: number;
  chipSize: number;
}

export interface SolidRecipe {
  kind: "solid";
  base: string;
  /** Subtle brushed / anodised direction. */
  brushed?: "horizontal" | "vertical";
  gloss: number;
}

export type TextureRecipe =
  | WoodRecipe
  | StoneRecipe
  | ConcreteRecipe
  | SlatRecipe
  | BrickRecipe
  | TerrazzoRecipe
  | SolidRecipe;
