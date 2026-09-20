/**
 * The scene: everything in a room design that is not the cladding itself.
 *
 * The room designer started as a texture mapper — choose a floor, choose a
 * wall, see it. A customer deciding on a media wall is not choosing a surface
 * in isolation, though; they are picturing the television, the sideboard under
 * it and the strip of light behind it. The scene is that second half.
 *
 * It is stored as structured JSON rather than a flattened image, so a design
 * can be reopened and kept editable: swap the cladding and the television
 * stays where it was put.
 *
 * Everything positional is **normalised to the photo**, 0..1 on each axis, for
 * the same reason the surface masks are: a design saved from a phone must
 * reopen correctly on a desktop, and a preview render at 1200px must agree
 * with a download at 3000px.
 *
 * ## Honesty
 *
 * This is an illustration, not a survey. Positions are relative to a
 * photograph whose true geometry we do not know; sizes are what the customer
 * dragged them to; light is a gradient, not a photometric simulation. Nothing
 * here should be presented as an architectural drawing, and
 * `designerConfig.renderDisclaimer` goes on every view that shows it.
 */

/** Bumped when a change to this file cannot be read by the previous reader. */
export const SCENE_SCHEMA_VERSION = 1;

/** Normalised point — 0..1 relative to the photo's width and height. */
export interface ScenePoint {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ *
 * Objects
 * ------------------------------------------------------------------ */

/**
 * What kind of thing an object is.
 *
 * The category, not the size: a 55" and an 85" television are both `TV`, and
 * the size lives on the asset, which carries real-world centimetres. That way
 * "a bigger television" is a different asset rather than a different code
 * path, and the admin can add one without a deploy.
 */
export type SceneObjectType =
  | "TV"
  | "SIDEBOARD_WALL"
  | "SIDEBOARD_FLOOR"
  | "TV_WALL"
  | "HOME_BAR"
  | "BAR_COUNTER"
  | "DRINKS_CABINET"
  | "WINE_FRIDGE"
  | "FLOATING_SHELF"
  | "NICHE"
  | "BOOKCASE"
  | "FIREPLACE"
  | "MIRROR"
  | "WALL_ART"
  | "SPEAKER"
  | "PLANT"
  | "CABINET_LOW"
  | "CABINET_TALL"
  | "CONSOLE_TABLE"
  | "CUSTOM";

/**
 * What an object's `type` actually holds.
 *
 * The twenty above are seeded and are the ones behaviour keys off — a
 * TV-frame light run looks for a `TV`, a niche magnet looks for a `NICHE`.
 * The admin can add categories beyond them, which are grouping labels: how a
 * new one snaps is a property of its assets, not of its name. `string & {}`
 * accepts those while keeping the seeded keys in autocomplete.
 */
export type SceneObjectCategoryKey = SceneObjectType | (string & {});

/** Where an object naturally sits, which is what the magnets use. */
export type SceneSnapTarget = "WALL" | "FLOOR" | "NICHE" | "FREE";

/**
 * The four corners an object is mapped onto, clockwise from the top-left,
 * normalised like everything else.
 *
 * `null` means "not fitted": the object is drawn as an upright rectangle with
 * a rotation, which is the honest default. A perspective quad is only ever set
 * by the customer dragging the corners or by "fit to wall" on a surface whose
 * plane the analysis actually resolved — never guessed, because a guessed
 * perspective looks precise and is not.
 */
export type PerspectiveQuad = [ScenePoint, ScenePoint, ScenePoint, ScenePoint];

export interface SceneObject {
  id: string;
  type: SceneObjectCategoryKey;
  /** Catalogue asset this came from; absent for a customer's own upload. */
  assetId: string | null;
  /** Transparent PNG or SVG. */
  assetUrl: string;
  /** Shown in the layer list, the bill of materials and to a screen reader. */
  label: string;
  /**
   * The catalogue product this represents, when it represents one at all.
   * Only a product that resolves against the catalogue on the server may be
   * added to a basket; everything else is illustration and says so.
   */
  productId: string | null;
  /** Centre of the object, normalised. */
  position: ScenePoint;
  /** Normalised against the photo's width and height respectively. */
  width: number;
  height: number;
  /** Degrees, clockwise, about the centre. */
  rotation: number;
  flipX: boolean;
  opacity: number;
  /** Order within the object layer. Higher draws on top. */
  layerIndex: number;
  /** The surface it belongs to, so it survives a cladding change. */
  surfaceId: string | null;
  perspectivePoints: PerspectiveQuad | null;
  locked: boolean;
  visible: boolean;
  /** Real-world size of the source asset, for the scale hint. May be null. */
  realWidthCm: number | null;
  realHeightCm: number | null;
}

/* ------------------------------------------------------------------ *
 * Lighting
 * ------------------------------------------------------------------ */

/**
 * The twelve fixtures. RGB is deliberately not one of them: it is a colour
 * mode any fixture can be put into, off by default, because a customer
 * choosing oak cladding is not asking for a colour-cycling wall.
 */
export type LightingFixtureType =
  | "LED_BEHIND_TV"
  | "LED_UNDER_SIDEBOARD"
  | "LED_IN_NICHE"
  | "LED_BETWEEN_PANELS"
  | "LED_PERIMETER"
  | "CEILING_COVE"
  | "SPOTLIGHT"
  | "WALL_LAMP"
  | "WALL_WASH_UP"
  | "WALL_WASH_DOWN"
  | "SHELF_LIGHT"
  | "RECESSED_PROFILE";

/**
 * Hidden light is bounced off the surface behind the object and drawn under
 * the objects; front light falls on what is in front of it and is drawn over.
 * It is the single most important property visually, and the one customers
 * actually mean when they say "behind the television".
 */
export type LightPlacement = "HIDDEN" | "FRONT";

export type LightColorMode = "WHITE" | "RGB";

export interface LightingFixture {
  id: string;
  type: LightingFixtureType;
  label: string;
  /** Centre of the emitter, normalised. */
  position: ScenePoint;
  /** Normalised. A strip is long and thin; a spot is roughly square. */
  width: number;
  height: number;
  /** Degrees. 0 points up the wall. */
  direction: number;
  /** 0..1. */
  intensity: number;
  /** 0..1 — how far the glow reaches beyond the emitter. */
  spread: number;
  /** 0..1 — softness of the edge. */
  blur: number;
  colorMode: LightColorMode;
  /** Kelvin, 2200..6500. Ignored when `colorMode` is RGB. */
  temperatureK: number;
  /** Hex. Used when `colorMode` is RGB. */
  color: string;
  placement: LightPlacement;
  /** Higher draws on top within its placement band. */
  layerIndex: number;
  enabled: boolean;
  /** Follows this object when it moves — "the strip behind the TV". */
  attachedToObjectId: string | null;
  surfaceId: string | null;
}

/* ------------------------------------------------------------------ *
 * Drawn LED runs
 * ------------------------------------------------------------------ */

/**
 * A run the customer drew point by point.
 *
 * Separate from a fixture because it has a path rather than a position, and
 * because the shapes people actually want — a frame around the television, a
 * vertical seam between two claddings, a line inside a niche — are all the
 * same tool with different numbers of points.
 */
export type LedPathShape =
  | "LINE"
  | "L_SHAPE"
  | "RECTANGLE"
  | "TV_FRAME"
  | "VERTICAL_SEAM"
  | "NICHE_RUN"
  | "FREE";

export interface LedPath {
  id: string;
  shape: LedPathShape;
  label: string;
  /** At least two points, normalised. */
  points: ScenePoint[];
  /** Closes the run back to the first point — a frame rather than a line. */
  closed: boolean;
  /** Normalised against the photo width. */
  thickness: number;
  intensity: number;
  spread: number;
  blur: number;
  colorMode: LightColorMode;
  temperatureK: number;
  color: string;
  placement: LightPlacement;
  layerIndex: number;
  enabled: boolean;
  /** Follows this object — how a TV frame stays a TV frame. */
  attachedToObjectId: string | null;
  surfaceId: string | null;
}

/* ------------------------------------------------------------------ *
 * Layers and viewport
 * ------------------------------------------------------------------ */

/**
 * The stack, bottom to top. Fixed rather than reorderable: the order is what
 * makes a design physically readable — light behind an object cannot be drawn
 * over it — and letting it be rearranged only produces pictures of rooms that
 * cannot exist.
 */
export const SCENE_LAYERS = [
  "photo",
  "surfaces",
  "cladding",
  "backLight",
  "objects",
  "frontLight",
  "ui",
] as const;

export type SceneLayerId = (typeof SCENE_LAYERS)[number];

export interface SceneLayerState {
  /** Layers the customer has switched off. `ui` is never in here. */
  hidden: SceneLayerId[];
}

export interface SceneViewport {
  zoom: number;
  panX: number;
  panY: number;
}

/* ------------------------------------------------------------------ *
 * The scene
 * ------------------------------------------------------------------ */

export interface DesignScene {
  schemaVersion: number;
  objects: SceneObject[];
  lightingFixtures: LightingFixture[];
  ledPaths: LedPath[];
  layers: SceneLayerState;
  viewport: SceneViewport;
}

export const emptyScene = (): DesignScene => ({
  schemaVersion: SCENE_SCHEMA_VERSION,
  objects: [],
  lightingFixtures: [],
  ledPaths: [],
  layers: { hidden: [] },
  viewport: { zoom: 1, panX: 0, panY: 0 },
});

/* ------------------------------------------------------------------ *
 * The object catalogue
 * ------------------------------------------------------------------ */

/**
 * A library entry, managed in the admin panel.
 *
 * `soldOnSite` is the line that matters commercially. An asset with it set and
 * a `productId` that resolves is something the customer can put in a basket;
 * everything else is drawn so they can picture the room and is labelled "for
 * illustration only". There is no third state, and the client cannot claim one
 * — the server decides by resolving the product.
 */
export interface DesignObjectAsset {
  id: string;
  category: SceneObjectCategoryKey;
  categoryName: string;
  name: string;
  /** Transparent PNG or SVG. */
  assetUrl: string;
  /** Real-world size, which is what makes a 65" television look like one. */
  realWidthCm: number;
  realHeightCm: number;
  snap: SceneSnapTarget;
  soldOnSite: boolean;
  productId: string | null;
  productSlug: string | null;
  /**
   * Read from the linked catalogue product, never stored here and never typed
   * in by hand. A price on a library asset would be a price with nothing
   * behind it, and the first time the catalogue changed it would be wrong.
   */
  price: number | null;
  sortOrder: number;
  enabled: boolean;
}

export interface LightingPreset {
  id: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  /** Fixtures and runs the preset drops in, without ids or positions. */
  fixtures: Omit<LightingFixture, "id" | "attachedToObjectId" | "surfaceId">[];
  paths: Omit<LedPath, "id" | "attachedToObjectId" | "surfaceId" | "points">[];
}
