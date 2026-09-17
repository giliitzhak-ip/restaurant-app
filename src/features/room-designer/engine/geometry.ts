import type { NormPoint, RoomSurfaceMask } from "@/types/design";
import { applyHomography, solveHomography, type Matrix3, type Point } from "./homography";

export interface PixelPoint {
  x: number;
  y: number;
}

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const toPixels = (
  point: NormPoint,
  width: number,
  height: number,
): PixelPoint => ({ x: point.x * width, y: point.y * height });

export function polygonBBox(
  polygon: NormPoint[],
  width: number,
  height: number,
): BBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const point of polygon) {
    const px = point.x * width;
    const py = point.y * height;
    if (px < x0) x0 = px;
    if (py < y0) y0 = py;
    if (px > x1) x1 = px;
    if (py > y1) y1 = py;
  }
  return {
    x0: Math.max(0, Math.floor(x0)),
    y0: Math.max(0, Math.floor(y0)),
    x1: Math.min(width, Math.ceil(x1)),
    y1: Math.min(height, Math.ceil(y1)),
  };
}

export function pointInPolygon(point: NormPoint, polygon: NormPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Reduces an arbitrary mask polygon to the quadrilateral that best describes
 * its perspective: the extreme corners of its top and bottom edges. Auto masks
 * are already quads; hand-drawn ones rarely are, and the corners are what the
 * homography needs.
 */
export function quadFromPolygon(polygon: NormPoint[]): [
  NormPoint,
  NormPoint,
  NormPoint,
  NormPoint,
] {
  if (polygon.length === 4) {
    return orderQuad(polygon as [NormPoint, NormPoint, NormPoint, NormPoint]);
  }

  const sortedByY = [...polygon].sort((a, b) => a.y - b.y);
  const topBand = sortedByY.slice(0, Math.max(2, Math.ceil(polygon.length / 3)));
  const bottomBand = sortedByY.slice(-Math.max(2, Math.ceil(polygon.length / 3)));

  const topLeft = topBand.reduce((min, p) => (p.x < min.x ? p : min), topBand[0]!);
  const topRight = topBand.reduce((max, p) => (p.x > max.x ? p : max), topBand[0]!);
  const bottomLeft = bottomBand.reduce(
    (min, p) => (p.x < min.x ? p : min),
    bottomBand[0]!,
  );
  const bottomRight = bottomBand.reduce(
    (max, p) => (p.x > max.x ? p : max),
    bottomBand[0]!,
  );

  return [topLeft, topRight, bottomRight, bottomLeft];
}

/** Clockwise from the top-left corner. */
function orderQuad(
  quad: [NormPoint, NormPoint, NormPoint, NormPoint],
): [NormPoint, NormPoint, NormPoint, NormPoint] {
  const sorted = [...quad].sort((a, b) => a.y - b.y);
  const [first, second, third, fourth] = sorted as [
    NormPoint,
    NormPoint,
    NormPoint,
    NormPoint,
  ];
  const top = [first, second].sort((a, b) => a.x - b.x);
  const bottom = [third, fourth].sort((a, b) => a.x - b.x);
  return [top[0]!, top[1]!, bottom[1]!, bottom[0]!];
}

export interface SurfacePlane {
  /** image pixels -> plane centimetres */
  toPlane: Matrix3;
  /** Real-world size the quad is assumed to cover, in centimetres. */
  widthCm: number;
  heightCm: number;
}

/**
 * Builds the plane mapping for a surface.
 *
 * A single photo carries no absolute scale, so the customer calibrates it:
 * `roomWidthM` for a floor (how wide the marked area is at the front) and a
 * standard 2.6 m ceiling height for a wall. Everything else — plank size,
 * perspective, estimated area — follows from that one number.
 */
export function buildSurfacePlane(
  mask: RoomSurfaceMask,
  imageWidth: number,
  imageHeight: number,
  roomWidthM: number,
): SurfacePlane {
  const quad = quadFromPolygon(mask.polygon);
  const fromPoints: Point[] = quad.map((point) => [
    point.x * imageWidth,
    point.y * imageHeight,
  ]);

  if (mask.kind === "WALL") {
    // Walls: fix the height, derive the width from the marked aspect ratio.
    const heightCm = 260;
    const topWidth = Math.hypot(
      (quad[1]!.x - quad[0]!.x) * imageWidth,
      (quad[1]!.y - quad[0]!.y) * imageHeight,
    );
    const leftHeight = Math.hypot(
      (quad[3]!.x - quad[0]!.x) * imageWidth,
      (quad[3]!.y - quad[0]!.y) * imageHeight,
    );
    const widthCm = Math.max(80, (topWidth / Math.max(1, leftHeight)) * heightCm);
    return {
      toPlane: solveHomography(fromPoints, [
        [0, 0],
        [widthCm, 0],
        [widthCm, heightCm],
        [0, heightCm],
      ]),
      widthCm,
      heightCm,
    };
  }

  // Floors: the front edge of the marked area is `roomWidthM` wide, and the
  // depth follows the quad's proportions.
  const widthCm = Math.max(80, roomWidthM * 100);
  const frontWidth = Math.hypot(
    (quad[2]!.x - quad[3]!.x) * imageWidth,
    (quad[2]!.y - quad[3]!.y) * imageHeight,
  );
  const sideLength = Math.hypot(
    (quad[3]!.x - quad[0]!.x) * imageWidth,
    (quad[3]!.y - quad[0]!.y) * imageHeight,
  );
  // Foreshortening means the visible depth is longer than it looks; 1.9 is a
  // decent constant for a photo taken from standing height.
  const depthCm = Math.max(
    100,
    (sideLength / Math.max(1, frontWidth)) * widthCm * 1.9,
  );

  return {
    toPlane: solveHomography(fromPoints, [
      [0, 0],
      [widthCm, 0],
      [widthCm, depthCm],
      [0, depthCm],
    ]),
    widthCm,
    heightCm: depthCm,
  };
}

/** Real-world area of a mask, in m² — the estimate shown before checkout. */
export function estimateAreaSqm(
  mask: RoomSurfaceMask,
  plane: SurfacePlane,
  imageWidth: number,
  imageHeight: number,
) {
  const outer = shoelaceCm(mask.polygon, plane.toPlane, imageWidth, imageHeight);
  const holes = mask.holes.reduce(
    (sum, hole) => sum + shoelaceCm(hole, plane.toPlane, imageWidth, imageHeight),
    0,
  );
  return Math.max(0, (outer - holes) / 10000);
}

function shoelaceCm(
  polygon: NormPoint[],
  toPlane: Matrix3,
  imageWidth: number,
  imageHeight: number,
) {
  if (polygon.length < 3) return 0;
  const points = polygon.map((point) =>
    applyHomography(toPlane, point.x * imageWidth, point.y * imageHeight),
  );
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}
