import type { ScenePoint, SceneObject } from "@/types/scene";
import type { NormPoint, RoomSurfaceMask } from "@/types/design";

/**
 * Magnets and guides.
 *
 * The thing that separates an editor people can use from one they fight is
 * that the obvious alignment happens by itself. Nobody wants to nudge a
 * television one pixel at a time to get it centred on the wall; they want it
 * to click into place and to be told that it did.
 *
 * So this returns both halves: where the object should actually go, and the
 * lines to draw so the customer can see *why* it moved. A magnet with no
 * guide feels like the editor is fighting you.
 *
 * Pure, and in normalised photo units throughout.
 */

export type GuideKind =
  | "WALL_CENTRE"
  | "WALL_EDGE"
  | "FLOOR_LINE"
  | "OBJECT_CENTRE"
  | "OBJECT_EDGE"
  | "EQUAL_SPACING";

export interface Guide {
  axis: "x" | "y";
  /** Normalised position of the line. */
  value: number;
  kind: GuideKind;
  /** Where to start and stop drawing, so a guide does not span the photo. */
  from: number;
  to: number;
  /** Shown beside the line: "מרכז הקיר", "80 ס״מ מהרצפה". */
  label?: string;
}

export interface SnapResult {
  position: ScenePoint;
  guides: Guide[];
}

export interface SnapContext {
  /** The object being moved, at its unsnapped candidate position. */
  moving: Pick<SceneObject, "id" | "width" | "height">;
  candidate: ScenePoint;
  /** Everything else visible, which is what it can align to. */
  others: SceneObject[];
  /** The surface it belongs to, for centre and edges. */
  surface?: RoomSurfaceMask | null;
  /** The floor, for "resting on the floor" and height-above-floor. */
  floor?: RoomSurfaceMask | null;
  /**
   * How close counts as close, in normalised units. Scaled by the caller
   * against zoom, so the magnet feels the same distance on screen whether
   * the customer is zoomed in or out.
   */
  threshold: number;
  /** Real room width, for the centimetre readout on the floor guide. */
  roomWidthM: number;
  /** Photo aspect, to turn a vertical normalised distance into centimetres. */
  photoAspect: number;
}

function bounds(points: NormPoint[]) {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

interface Target {
  value: number;
  kind: GuideKind;
  label?: string;
  /** Extent of the guide line along the other axis. */
  from: number;
  to: number;
}

/** The three lines on an object that can align: near edge, centre, far edge. */
const edgesOf = (size: number) => [
  { offset: -size / 2, name: "start" as const },
  { offset: 0, name: "centre" as const },
  { offset: size / 2, name: "end" as const },
];

export function snapObject(context: SnapContext): SnapResult {
  const { moving, candidate, others, surface, floor, threshold } = context;

  const xTargets: Target[] = [];
  const yTargets: Target[] = [];

  /* ---------------------------- the surface ---------------------------- */

  const surfaceBox = surface ? bounds(surface.polygon) : null;
  if (surfaceBox) {
    xTargets.push({
      value: surfaceBox.cx,
      kind: "WALL_CENTRE",
      label: "מרכז הקיר",
      from: surfaceBox.minY,
      to: surfaceBox.maxY,
    });
    xTargets.push(
      { value: surfaceBox.minX, kind: "WALL_EDGE", from: surfaceBox.minY, to: surfaceBox.maxY },
      { value: surfaceBox.maxX, kind: "WALL_EDGE", from: surfaceBox.minY, to: surfaceBox.maxY },
    );
    yTargets.push({
      value: surfaceBox.cy,
      kind: "WALL_CENTRE",
      label: "אמצע הקיר",
      from: surfaceBox.minX,
      to: surfaceBox.maxX,
    });
  }

  /* ----------------------------- the floor ----------------------------- */

  const floorBox = floor ? bounds(floor.polygon) : null;
  if (floorBox) {
    // The top of the floor polygon is where the wall meets it: the line an
    // object is "standing on".
    yTargets.push({
      value: floorBox.minY,
      kind: "FLOOR_LINE",
      label: "על הרצפה",
      from: floorBox.minX,
      to: floorBox.maxX,
    });
  }

  /* ------------------------- the other objects ------------------------- */

  const visible = others.filter(
    (other) => other.id !== moving.id && other.visible && !other.locked,
  );

  for (const other of visible) {
    const isScreen = other.type === "TV" || other.type === "TV_WALL";
    for (const edge of edgesOf(other.width)) {
      xTargets.push({
        value: other.position.x + edge.offset,
        kind: edge.name === "centre" ? "OBJECT_CENTRE" : "OBJECT_EDGE",
        // The television is the thing everything else on a media wall lines
        // up with, so its centre is named rather than anonymous.
        label: edge.name === "centre" && isScreen ? "מרכז הטלוויזיה" : undefined,
        from: other.position.y - other.height / 2,
        to: other.position.y + other.height / 2,
      });
    }
    for (const edge of edgesOf(other.height)) {
      yTargets.push({
        value: other.position.y + edge.offset,
        kind: edge.name === "centre" ? "OBJECT_CENTRE" : "OBJECT_EDGE",
        from: other.position.x - other.width / 2,
        to: other.position.x + other.width / 2,
      });
    }
  }

  /* --------------------------- equal spacing --------------------------- */

  /*
   * Three objects in a row want equal gaps. Detected by looking for a pair
   * either side of the one being moved on the same axis and offering the
   * position that makes the two gaps match — which is the arrangement people
   * are trying to produce by eye and rarely hit exactly.
   */
  const sameRow = visible
    .filter((other) => Math.abs(other.position.y - candidate.y) < moving.height)
    .sort((a, b) => a.position.x - b.position.x);
  for (let i = 0; i < sameRow.length - 1; i += 1) {
    const left = sameRow[i]!;
    const right = sameRow[i + 1]!;
    if (candidate.x <= left.position.x || candidate.x >= right.position.x) continue;
    const leftEdge = left.position.x + left.width / 2;
    const rightEdge = right.position.x - right.width / 2;
    const midpoint = (leftEdge + rightEdge) / 2;
    xTargets.push({
      value: midpoint,
      kind: "EQUAL_SPACING",
      label: "מרווחים שווים",
      from: Math.min(left.position.y, right.position.y) - left.height / 2,
      to: Math.max(left.position.y, right.position.y) + right.height / 2,
    });
  }

  /* ------------------------------ resolve ------------------------------ */

  const guides: Guide[] = [];

  /** Picks the nearest target for one axis and returns the adjusted centre. */
  function resolve(
    axis: "x" | "y",
    centre: number,
    size: number,
    targets: Target[],
  ): number {
    let best: { delta: number; target: Target; offset: number } | null = null;
    for (const edge of edgesOf(size)) {
      const edgeValue = centre + edge.offset;
      for (const target of targets) {
        const delta = Math.abs(target.value - edgeValue);
        if (delta > threshold) continue;
        /*
         * Ties go to the earlier target, and the lists are built in order of
         * how much people care: the wall centre before an object edge, an
         * object centre before its edges. Without an order, which line you
         * snap to when two coincide is decided by object creation order.
         */
        if (!best || delta < best.delta - 1e-9) {
          best = { delta, target, offset: edge.offset };
        }
      }
    }
    if (!best) return centre;
    guides.push({
      axis,
      value: best.target.value,
      kind: best.target.kind,
      from: best.target.from,
      to: best.target.to,
      label: best.target.label,
    });
    return best.target.value - best.offset;
  }

  const x = resolve("x", candidate.x, moving.width, xTargets);
  const y = resolve("y", candidate.y, moving.height, yTargets);

  /*
   * Height above the floor, reported in centimetres. Not a magnet — there is
   * no single right height — but the number people are actually trying to
   * hit when they say "the TV should be 110 from the floor".
   */
  if (floorBox && !guides.some((guide) => guide.axis === "y")) {
    const bottom = y + moving.height / 2;
    const above = floorBox.minY - bottom;
    if (above > 0.01) {
      const cm = Math.round(
        (above / context.photoAspect) * context.roomWidthM * 100,
      );
      guides.push({
        axis: "y",
        value: floorBox.minY,
        kind: "FLOOR_LINE",
        from: x - moving.width / 2,
        to: x + moving.width / 2,
        label: `${cm} ס״מ מהרצפה`,
      });
    }
  }

  return { position: { x, y }, guides };
}
