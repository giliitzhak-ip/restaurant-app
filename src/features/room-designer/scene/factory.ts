import { createId } from "@/lib/utils";
import type {
  DesignObjectAsset,
  DesignScene,
  LedPath,
  LedPathShape,
  LightingFixture,
  LightingFixtureType,
  SceneObject,
  ScenePoint,
} from "@/types/scene";
import { topLayerIndex } from "./reducer";

/**
 * Making things, with defaults that are right often enough to feel like the
 * editor already knows what you meant.
 *
 * Ids are minted here, in the event handler, rather than in the reducer —
 * a reducer that calls `Math.random()` is not a function of its arguments.
 */

export interface PhotoFrame {
  /** Pixel dimensions of the photo the scene is normalised against. */
  width: number;
  height: number;
  /** How wide the room is, in metres. The customer sets this. */
  roomWidthM: number;
}

/**
 * Real centimetres to normalised photo units.
 *
 * The horizontal case is simple: the photo spans `roomWidthM` metres, so a
 * 145cm television is `1.45 / roomWidthM` of it.
 *
 * The vertical case is the one that is easy to get wrong. Normalised units
 * are relative to a *different* number of pixels on each axis, so a square
 * object is not `width === height` in this space — it is `height = width *
 * (imageWidth / imageHeight)`. Skip that factor and every object comes out
 * stretched by the photo's aspect ratio, which on a 3:2 photo is 50%.
 */
export function sizeFromReal(
  realWidthCm: number,
  realHeightCm: number,
  frame: PhotoFrame,
) {
  const width = Math.min(1.6, realWidthCm / 100 / Math.max(0.5, frame.roomWidthM));
  const aspect = realHeightCm / Math.max(1, realWidthCm);
  const height = width * aspect * (frame.width / Math.max(1, frame.height));
  return { width, height };
}

/** The inverse, for showing the customer what size they have dragged to. */
export function realFromSize(
  widthNorm: number,
  heightNorm: number,
  frame: PhotoFrame,
) {
  const widthCm = widthNorm * frame.roomWidthM * 100;
  const heightCm =
    (heightNorm / Math.max(1e-6, frame.width / Math.max(1, frame.height))) *
    frame.roomWidthM *
    100;
  return { widthCm: Math.round(widthCm), heightCm: Math.round(heightCm) };
}

/**
 * Where a new object lands.
 *
 * Not the middle of the photo. A television belongs at eye level on the wall,
 * a sideboard just above the floor line, a plant on the floor — so the drop
 * point comes from what the thing is. Getting this roughly right is the
 * difference between "drag it into place" and "drag it across the room
 * first".
 */
/**
 * Roughly where each kind of thing lives on a wall.
 *
 * Not decoration: without it every wall item drops at the same height and the
 * sideboard lands on top of the television. These are the heights people
 * actually hang things at, as a fraction of a room photograph — a screen a
 * little above the middle, a hung sideboard below it, a shelf higher, art
 * between the two.
 */
const WALL_HEIGHT: Record<string, number> = {
  TV: 0.4,
  TV_WALL: 0.45,
  SIDEBOARD_WALL: 0.6,
  FLOATING_SHELF: 0.3,
  NICHE: 0.42,
  FIREPLACE: 0.56,
  MIRROR: 0.38,
  WALL_ART: 0.36,
};

function dropPoint(asset: DesignObjectAsset, size: { width: number; height: number }) {
  switch (asset.snap) {
    case "FLOOR":
      // Standing on the floor line, which in most room photographs is around
      // three-quarters of the way down.
      return { x: 0.5, y: 0.78 - size.height / 2 };
    case "WALL":
      return { x: 0.5, y: WALL_HEIGHT[asset.category] ?? 0.45 };
    case "NICHE":
      return { x: 0.5, y: 0.45 };
    default:
      return { x: 0.5, y: 0.5 };
  }
}

/**
 * Nudges a drop so it does not land exactly on something already there.
 *
 * Sideways, not downwards. The first version moved a clashing object down by
 * the two heights, which for a floor-standing plant behind a television meant
 * pushing it clean off the bottom of the photo — a plant does not float, and
 * "lower" is not a free direction for anything resting on the floor.
 *
 * It alternates left and right so a third item does not stack on the second,
 * and it gives up after a few tries rather than marching off the edge: two
 * items near each other are a much smaller problem than one item nobody can
 * find.
 */
function avoidOverlap(
  point: ScenePoint,
  size: { width: number; height: number },
  scene: DesignScene,
): ScenePoint {
  const overlaps = (candidate: ScenePoint) =>
    scene.objects.find(
      (other) =>
        other.visible &&
        Math.abs(other.position.x - candidate.x) <
          Math.min(other.width, size.width) * 0.5 &&
        Math.abs(other.position.y - candidate.y) <
          Math.min(other.height, size.height) * 0.5,
    );

  let clash = overlaps(point);
  if (!clash) return point;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const step = (size.width + clash.width) * 0.6 * attempt;
    for (const direction of [1, -1]) {
      const candidate = {
        x: Math.min(0.94, Math.max(0.06, point.x + step * direction)),
        y: point.y,
      };
      if (!overlaps(candidate)) return candidate;
    }
    clash = overlaps(point) ?? clash;
  }
  return point;
}

export function createObjectFromAsset({
  asset,
  scene,
  frame,
  surfaceId,
  at,
}: {
  asset: DesignObjectAsset;
  scene: DesignScene;
  frame: PhotoFrame;
  surfaceId: string | null;
  /** Where it was dropped, if it was dropped somewhere specific. */
  at?: ScenePoint;
}): SceneObject {
  const size = sizeFromReal(asset.realWidthCm, asset.realHeightCm, frame);
  return {
    id: createId("obj"),
    type: asset.category,
    assetId: asset.id,
    assetUrl: asset.assetUrl,
    label: asset.name,
    /*
     * The product claim is copied from the library, and the server checks it
     * again on save. Both are needed: this one makes the basket button
     * appear, that one decides whether it may.
     */
    productId: asset.soldOnSite ? asset.productId : null,
    position: at ?? avoidOverlap(dropPoint(asset, size), size, scene),
    width: size.width,
    height: size.height,
    rotation: 0,
    flipX: false,
    opacity: 1,
    layerIndex: topLayerIndex(scene) + 1,
    surfaceId,
    perspectivePoints: null,
    locked: false,
    visible: true,
    realWidthCm: asset.realWidthCm,
    realHeightCm: asset.realHeightCm,
  };
}

/** A customer's own photo, cut out by hand. It is nobody's product. */
export function createCustomObject({
  url,
  label,
  scene,
  aspect,
  frame,
  surfaceId,
}: {
  url: string;
  label: string;
  scene: DesignScene;
  /** height / width of the uploaded image. */
  aspect: number;
  frame: PhotoFrame;
  surfaceId: string | null;
}): SceneObject {
  const width = 0.3;
  return {
    id: createId("obj"),
    type: "CUSTOM",
    assetId: null,
    assetUrl: url,
    label,
    productId: null,
    position: { x: 0.5, y: 0.5 },
    width,
    height: width * aspect * (frame.width / Math.max(1, frame.height)),
    rotation: 0,
    flipX: false,
    opacity: 1,
    layerIndex: topLayerIndex(scene) + 1,
    surfaceId,
    perspectivePoints: null,
    locked: false,
    visible: true,
    realWidthCm: null,
    realHeightCm: null,
  };
}

/* ------------------------------------------------------------------ *
 * Lighting
 * ------------------------------------------------------------------ */

interface FixtureDefault {
  label: string;
  width: number;
  height: number;
  direction: number;
  intensity: number;
  spread: number;
  blur: number;
  temperatureK: number;
  placement: "HIDDEN" | "FRONT";
}

/**
 * What each fixture is, before anyone touches a slider.
 *
 * The values are the difference between a feature people use and one they
 * give up on: a strip behind a television is a wide, soft, warm glow that is
 * *hidden* — drawn behind the object — and a spotlight is a small, tight,
 * cooler pool drawn in *front*. Get the placement wrong and the light appears
 * over the television it is supposed to be behind.
 */
const FIXTURE_DEFAULTS: Record<LightingFixtureType, FixtureDefault> = {
  LED_BEHIND_TV: {
    label: "פס LED מאחורי הטלוויזיה",
    width: 0.3,
    height: 0.18,
    direction: 0,
    intensity: 0.65,
    spread: 0.7,
    blur: 0.8,
    temperatureK: 2900,
    placement: "HIDDEN",
  },
  LED_UNDER_SIDEBOARD: {
    label: "פס LED מתחת למזנון",
    width: 0.3,
    height: 0.07,
    direction: 180,
    intensity: 0.55,
    spread: 0.55,
    blur: 0.75,
    temperatureK: 2900,
    placement: "HIDDEN",
  },
  LED_IN_NICHE: {
    label: "פס LED בנישה",
    width: 0.12,
    height: 0.2,
    direction: 0,
    intensity: 0.6,
    spread: 0.5,
    blur: 0.7,
    temperatureK: 2700,
    placement: "HIDDEN",
  },
  LED_BETWEEN_PANELS: {
    label: "פס LED בין לוחות",
    width: 0.012,
    height: 0.4,
    direction: 0,
    intensity: 0.7,
    spread: 0.3,
    blur: 0.5,
    temperatureK: 3000,
    placement: "FRONT",
  },
  LED_PERIMETER: {
    label: "פס LED היקפי",
    width: 0.8,
    height: 0.5,
    direction: 0,
    intensity: 0.5,
    spread: 0.8,
    blur: 0.85,
    temperatureK: 3000,
    placement: "HIDDEN",
  },
  CEILING_COVE: {
    label: "תאורה נסתרת בתקרה",
    width: 0.8,
    height: 0.1,
    direction: 180,
    intensity: 0.6,
    spread: 0.85,
    blur: 0.9,
    temperatureK: 3200,
    placement: "HIDDEN",
  },
  SPOTLIGHT: {
    label: "ספוט",
    width: 0.14,
    height: 0.3,
    direction: 180,
    intensity: 0.7,
    spread: 0.45,
    blur: 0.6,
    temperatureK: 3500,
    placement: "FRONT",
  },
  WALL_LAMP: {
    label: "מנורת קיר",
    width: 0.16,
    height: 0.22,
    direction: 0,
    intensity: 0.6,
    spread: 0.6,
    blur: 0.7,
    temperatureK: 2700,
    placement: "FRONT",
  },
  WALL_WASH_UP: {
    label: "תאורת קיר מלמטה",
    width: 0.2,
    height: 0.45,
    direction: 0,
    intensity: 0.55,
    spread: 0.75,
    blur: 0.8,
    temperatureK: 2900,
    placement: "FRONT",
  },
  WALL_WASH_DOWN: {
    label: "תאורת קיר מלמעלה",
    width: 0.2,
    height: 0.45,
    direction: 180,
    intensity: 0.55,
    spread: 0.75,
    blur: 0.8,
    temperatureK: 2900,
    placement: "FRONT",
  },
  SHELF_LIGHT: {
    label: "תאורת מדף",
    width: 0.22,
    height: 0.05,
    direction: 180,
    intensity: 0.5,
    spread: 0.4,
    blur: 0.6,
    temperatureK: 3000,
    placement: "HIDDEN",
  },
  RECESSED_PROFILE: {
    label: "פרופיל שקוע בחיפוי",
    width: 0.35,
    height: 0.02,
    direction: 0,
    intensity: 0.75,
    spread: 0.35,
    blur: 0.45,
    temperatureK: 3000,
    placement: "FRONT",
  },
};

export const fixtureDefaults = FIXTURE_DEFAULTS;

export function createFixture({
  type,
  scene,
  at,
  surfaceId,
  attachedToObjectId = null,
}: {
  type: LightingFixtureType;
  scene: DesignScene;
  at?: ScenePoint;
  surfaceId: string | null;
  attachedToObjectId?: string | null;
}): LightingFixture {
  const preset = FIXTURE_DEFAULTS[type];
  return {
    id: createId("lit"),
    type,
    label: preset.label,
    position: at ?? { x: 0.5, y: 0.45 },
    width: preset.width,
    height: preset.height,
    direction: preset.direction,
    intensity: preset.intensity,
    spread: preset.spread,
    blur: preset.blur,
    colorMode: "WHITE",
    temperatureK: preset.temperatureK,
    color: "#ffb86b",
    placement: preset.placement,
    layerIndex:
      scene.lightingFixtures.reduce((max, f) => Math.max(max, f.layerIndex), -1) + 1,
    enabled: true,
    attachedToObjectId,
    surfaceId,
  };
}

/**
 * A strip sized and placed to sit behind a given object.
 *
 * Slightly larger than the object and centred on it, because that is what
 * produces a halo rather than a rectangle peeking out on one side. It stays
 * attached, so moving the television moves the light.
 */
export function createFixtureBehind(
  object: SceneObject,
  scene: DesignScene,
  type: LightingFixtureType = "LED_BEHIND_TV",
): LightingFixture {
  const base = createFixture({
    type,
    scene,
    at: { ...object.position },
    surfaceId: object.surfaceId,
    attachedToObjectId: object.id,
  });
  /*
   * Considerably larger than the object, not a hair larger.
   *
   * The glow's falloff reaches nothing by about 80% of its own radius, so a
   * strip only 6% bigger than the television has its entire visible edge
   * inside the transparent part of the gradient — the light is drawn, it is
   * behind the screen, and it cannot be seen. The halo has to extend well
   * past the silhouette to be a halo at all.
   */
  return {
    ...base,
    width: object.width * 1.55,
    height: object.height * 1.7,
  };
}

/* ------------------------------------------------------------------ *
 * Drawn runs
 * ------------------------------------------------------------------ */

const PATH_LABELS: Record<LedPathShape, string> = {
  LINE: "פס תאורה ישר",
  L_SHAPE: "פס תאורה בצורת ר׳",
  RECTANGLE: "מסגרת תאורה",
  TV_FRAME: "מסגרת סביב הטלוויזיה",
  VERTICAL_SEAM: "פס אנכי בין חיפויים",
  NICHE_RUN: "פס בתוך נישה",
  FREE: "מסלול תאורה",
};

export function createPath({
  shape,
  points,
  scene,
  surfaceId,
  attachedToObjectId = null,
  closed = false,
}: {
  shape: LedPathShape;
  points: ScenePoint[];
  scene: DesignScene;
  surfaceId: string | null;
  attachedToObjectId?: string | null;
  closed?: boolean;
}): LedPath {
  return {
    id: createId("led"),
    shape,
    label: PATH_LABELS[shape],
    points,
    closed,
    thickness: 0.006,
    intensity: 0.7,
    spread: 0.5,
    blur: 0.6,
    colorMode: "WHITE",
    temperatureK: 3000,
    color: "#ffb86b",
    placement: shape === "TV_FRAME" ? "HIDDEN" : "FRONT",
    layerIndex: scene.ledPaths.reduce((max, p) => Math.max(max, p.layerIndex), -1) + 1,
    enabled: true,
    attachedToObjectId,
    surfaceId,
  };
}

/** The four corners of an object, for a frame that hugs it. */
export function frameAround(object: SceneObject, inset = 1.04): ScenePoint[] {
  const hw = (object.width * inset) / 2;
  const hh = (object.height * inset) / 2;
  const { x, y } = object.position;
  return [
    { x: x - hw, y: y - hh },
    { x: x + hw, y: y - hh },
    { x: x + hw, y: y + hh },
    { x: x - hw, y: y + hh },
  ];
}
