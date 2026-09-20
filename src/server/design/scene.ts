import { z } from "zod";
import {
  SCENE_LAYERS,
  SCENE_SCHEMA_VERSION,
  emptyScene,
  type DesignScene,
} from "@/types/scene";

/**
 * The scene, as the server is willing to accept it.
 *
 * A scene is authored in the browser and posted here, which means it is input
 * from an untrusted source that happens to usually be our own editor. Three
 * things are enforced, none of which the client can be relied on for:
 *
 * **Bounds.** Every number is clamped. A `width` of 1e9 or an `intensity` of
 * -40 is not a drawing, it is an attempt to find out what the renderer does
 * with it, and it would also be handed straight back to every other device
 * that opens the design.
 *
 * **Size.** Arrays are capped. Without a cap, one request can store a
 * multi-megabyte document that is then read on every page view of that
 * design, and the retention job has to carry it too.
 *
 * **Provenance.** `productId` is resolved against the catalogue by the caller
 * and dropped when it does not resolve. A client claiming an object is a
 * product is how an illustration ends up in a basket with a price.
 */

const CAPS = {
  objects: 60,
  fixtures: 40,
  paths: 30,
  pathPoints: 64,
  labelLength: 80,
  urlLength: 2048,
} as const;

/** Numbers arrive as JSON, so NaN and Infinity have to be refused explicitly. */
const finite = z.number().refine(Number.isFinite, "not finite");

const clamped = (min: number, max: number) =>
  finite.transform((value) => Math.min(max, Math.max(min, value)));

/**
 * Positions may sit a little outside the photo: half a sideboard hanging off
 * the left edge is a legitimate composition. Two photo-widths out is not.
 */
const coordinate = clamped(-1, 2);
const pointSchema = z.object({ x: coordinate, y: coordinate });

const quadSchema = z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]);

const label = z.string().trim().max(CAPS.labelLength);

/**
 * An asset URL is a path we issued or a stored upload. Anything with a scheme
 * is refused: an `assetUrl` is rendered into an `<img>` on every device that
 * opens the design, so accepting `https://…` would let one customer's saved
 * design fetch from a third party — and `javascript:` or `data:` would be
 * worse than that.
 */
const assetUrl = z
  .string()
  .trim()
  .min(1)
  .max(CAPS.urlLength)
  .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
    message: "asset must be a site-relative path",
  });

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb");

const objectSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.string().trim().min(1).max(48),
  assetId: z.string().trim().max(64).nullable(),
  assetUrl,
  label,
  productId: z.string().trim().max(64).nullable(),
  position: pointSchema,
  width: clamped(0.005, 2),
  height: clamped(0.005, 2),
  rotation: clamped(-360, 360),
  flipX: z.boolean(),
  opacity: clamped(0, 1),
  layerIndex: z.number().int().min(0).max(999),
  surfaceId: z.string().trim().max(64).nullable(),
  perspectivePoints: quadSchema.nullable(),
  locked: z.boolean(),
  visible: z.boolean(),
  realWidthCm: clamped(1, 2000).nullable(),
  realHeightCm: clamped(1, 2000).nullable(),
});

const lightCommon = {
  intensity: clamped(0, 1),
  spread: clamped(0, 1),
  blur: clamped(0, 1),
  colorMode: z.enum(["WHITE", "RGB"]),
  /** The range of white light people actually buy, and nothing beyond it. */
  temperatureK: clamped(2200, 6500),
  color: hexColor,
  placement: z.enum(["HIDDEN", "FRONT"]),
  layerIndex: z.number().int().min(0).max(999),
  enabled: z.boolean(),
  attachedToObjectId: z.string().trim().max(64).nullable(),
  surfaceId: z.string().trim().max(64).nullable(),
};

const fixtureSchema = z.object({
  id: z.string().trim().min(1).max(64),
  type: z.enum([
    "LED_BEHIND_TV",
    "LED_UNDER_SIDEBOARD",
    "LED_IN_NICHE",
    "LED_BETWEEN_PANELS",
    "LED_PERIMETER",
    "CEILING_COVE",
    "SPOTLIGHT",
    "WALL_LAMP",
    "WALL_WASH_UP",
    "WALL_WASH_DOWN",
    "SHELF_LIGHT",
    "RECESSED_PROFILE",
  ]),
  label,
  position: pointSchema,
  width: clamped(0.002, 2),
  height: clamped(0.002, 2),
  direction: clamped(-360, 360),
  ...lightCommon,
});

const pathSchema = z.object({
  id: z.string().trim().min(1).max(64),
  shape: z.enum([
    "LINE",
    "L_SHAPE",
    "RECTANGLE",
    "TV_FRAME",
    "VERTICAL_SEAM",
    "NICHE_RUN",
    "FREE",
  ]),
  label,
  points: z.array(pointSchema).min(2).max(CAPS.pathPoints),
  closed: z.boolean(),
  thickness: clamped(0.001, 0.2),
  ...lightCommon,
});

export const sceneSchema = z.object({
  schemaVersion: z.number().int().min(0).max(SCENE_SCHEMA_VERSION),
  objects: z.array(objectSchema).max(CAPS.objects),
  lightingFixtures: z.array(fixtureSchema).max(CAPS.fixtures),
  ledPaths: z.array(pathSchema).max(CAPS.paths),
  layers: z.object({
    hidden: z.array(z.enum(SCENE_LAYERS)).max(SCENE_LAYERS.length),
  }),
  viewport: z.object({
    zoom: clamped(0.25, 6),
    panX: clamped(-2, 2),
    panY: clamped(-2, 2),
  }),
});

export type ParsedScene = z.infer<typeof sceneSchema>;

/**
 * Turn whatever arrived into a scene this server is prepared to store.
 *
 * `knownProductIds` is the set that actually exists in the catalogue right
 * now. An object claiming any other product keeps its picture and loses its
 * price: it becomes an illustration, which is what it was. This is the only
 * place that decision is made, so there is no path by which a client-supplied
 * id reaches a basket.
 *
 * Returns `null` for input that is not a scene at all — the caller then stores
 * nothing rather than storing something broken.
 */
export function normaliseScene(
  input: unknown,
  knownProductIds: ReadonlySet<string>,
): DesignScene | null {
  if (input === null || input === undefined) return null;

  const parsed = sceneSchema.safeParse(input);
  if (!parsed.success) return null;

  const scene = parsed.data;

  // Ids have to be unique before anything can reference them.
  const seen = new Set<string>();
  const objects = scene.objects
    .filter((object) => !seen.has(object.id) && seen.add(object.id))
    .map((object) => ({
      ...object,
      productId:
        object.productId && knownProductIds.has(object.productId)
          ? object.productId
          : null,
    }));

  const objectIds = new Set(objects.map((object) => object.id));
  /* A light attached to an object that is no longer there would either follow
     nothing or follow the wrong thing after an id collision. It detaches. */
  const detach = <T extends { attachedToObjectId: string | null }>(item: T): T =>
    item.attachedToObjectId && !objectIds.has(item.attachedToObjectId)
      ? { ...item, attachedToObjectId: null }
      : item;

  const fixtureIds = new Set<string>();
  const pathIds = new Set<string>();

  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    objects,
    lightingFixtures: scene.lightingFixtures
      .filter((item) => !fixtureIds.has(item.id) && fixtureIds.add(item.id))
      .map(detach),
    ledPaths: scene.ledPaths
      .filter((item) => !pathIds.has(item.id) && pathIds.add(item.id))
      .map(detach),
    layers: { hidden: [...new Set(scene.layers.hidden)] },
    viewport: scene.viewport,
  };
}

/**
 * Read a scene back out of the database.
 *
 * Rows written by an older build, or by hand, or by a bug, all arrive here.
 * Anything that does not parse becomes an empty scene rather than an
 * exception: a design whose lighting cannot be read should still open with
 * its cladding intact, because that is the part the customer chose.
 */
export function readScene(stored: unknown): DesignScene {
  if (stored === null || stored === undefined) return emptyScene();
  const parsed = sceneSchema.safeParse(stored);
  if (!parsed.success) return emptyScene();
  return { ...parsed.data, schemaVersion: SCENE_SCHEMA_VERSION };
}

export { CAPS as sceneCaps };
