import type { PerspectiveQuad, SceneObject, ScenePoint } from "@/types/scene";
import type { NormPoint, RoomSurfaceMask } from "@/types/design";

/**
 * Laying a flat object onto a plane in a photograph.
 *
 * An object with `perspectivePoints` is drawn by mapping its own rectangle
 * onto four corners the customer placed. That mapping is a projective
 * transform, and the browser can do it for free: `matrix3d` is a 4×4 with a
 * perspective row, so the GPU rasterises it and dragging a corner stays at
 * sixty frames.
 *
 * What this deliberately does not do is *compute* a perspective from the
 * photo. We do not know the camera, the focal length or the wall's true
 * shape; a quad derived from a guessed plane would look authoritative and be
 * wrong, and "fit to wall" only offers a result when the analysis actually
 * resolved a wall polygon to fit to. Everywhere else the customer drags the
 * corners themselves, which is honest and, on a photograph, usually faster.
 */

/**
 * The homography taking the unit square to a quad.
 *
 * Closed form rather than a solve: the unit square is a special case with a
 * known solution, and it is exact, allocation-free and safe to call on every
 * pointer move.
 *
 * Corners are clockwise from the top-left, matching `PerspectiveQuad`:
 * (0,0)→p0, (1,0)→p1, (1,1)→p2, (0,1)→p3.
 */
function unitSquareToQuad(quad: readonly ScenePoint[]) {
  const [p0, p1, p2, p3] = quad as [ScenePoint, ScenePoint, ScenePoint, ScenePoint];

  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  // Parallel opposite edges: the transform is affine and the projective row
  // is zero. Taking the general branch here divides by ~0.
  if (Math.abs(dx3) < 1e-12 && Math.abs(dy3) < 1e-12) {
    return {
      a: p1.x - p0.x,
      b: p3.x - p0.x,
      c: p0.x,
      d: p1.y - p0.y,
      e: p3.y - p0.y,
      f: p0.y,
      g: 0,
      h: 0,
    };
  }

  const denominator = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denominator) < 1e-12) return null; // degenerate: three points in a line

  const g = (dx3 * dy2 - dy3 * dx2) / denominator;
  const h = (dx1 * dy3 - dy1 * dx3) / denominator;

  return {
    a: p1.x - p0.x + g * p1.x,
    b: p3.x - p0.x + h * p3.x,
    c: p0.x,
    d: p1.y - p0.y + g * p1.y,
    e: p3.y - p0.y + h * p3.y,
    f: p0.y,
    g,
    h,
  };
}

/**
 * A CSS `matrix3d` mapping an element's own box onto the quad.
 *
 * The quad is given in the same pixel space as the element's box, and the
 * element must carry `transform-origin: 0 0` — with the default centre
 * origin the browser translates before and after, and the projective row
 * makes those two translations not cancel.
 */
export function quadToMatrix3d(
  quad: readonly ScenePoint[],
  widthPx: number,
  heightPx: number,
): string | null {
  if (quad.length !== 4 || widthPx <= 0 || heightPx <= 0) return null;
  const m = unitSquareToQuad(quad);
  if (!m) return null;

  // Fold in the element's own size, so the transform takes local pixels
  // rather than the unit square.
  const a = m.a / widthPx;
  const d = m.d / widthPx;
  const g = m.g / widthPx;
  const b = m.b / heightPx;
  const e = m.e / heightPx;
  const h = m.h / heightPx;

  const values = [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, m.c, m.f, 0, 1];
  if (values.some((value) => !Number.isFinite(value))) return null;
  /*
   * Significant digits rather than decimal places. The projective terms are
   * small — around 1e-4 — so six decimal places leaves them with two
   * significant figures, and the far corner of a large stage drifts by most
   * of a pixel. `toPrecision` keeps the *relative* accuracy, which is what a
   * projective divide needs, and costs a handful of characters.
   */
  return `matrix3d(${values
    .map((value) => Number(value.toPrecision(12)).toString())
    .join(", ")})`;
}

/* ------------------------------------------------------------------ *
 * Fitting
 * ------------------------------------------------------------------ */

function polygonBounds(points: NormPoint[]) {
  if (points.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Corners for the object as it currently sits: an upright rectangle.
 *
 * This is what "start adjusting the perspective" produces — the customer
 * begins from where the object already is and pulls corners, rather than
 * from some guess that has to be undone first.
 */
export function quadFromRect(object: SceneObject): PerspectiveQuad {
  const hw = object.width / 2;
  const hh = object.height / 2;
  const { x, y } = object.position;
  return [
    { x: x - hw, y: y - hh },
    { x: x + hw, y: y - hh },
    { x: x + hw, y: y + hh },
    { x: x - hw, y: y + hh },
  ];
}

export type FitResult =
  | { ok: true; quad: PerspectiveQuad }
  | { ok: false; reason: "NO_SURFACE" | "NOT_A_QUAD" };

/**
 * "Fit to wall".
 *
 * Only offered when the surface mask is a quadrilateral, because only then do
 * we have four corners that genuinely correspond to the four corners of a
 * flat plane. A mask with nine points is an outline traced around a sofa and
 * a radiator; picking four of them would produce a confident-looking
 * perspective built on nothing, which is exactly what the brief says not to
 * show. In that case the answer is "adjust it yourself", and the editor says
 * so instead of quietly doing something worse.
 */
export function fitToSurface(
  object: SceneObject,
  surface: RoomSurfaceMask | null | undefined,
  /** How much of the surface to cover, so it does not sit edge to edge. */
  inset = 0.12,
): FitResult {
  if (!surface) return { ok: false, reason: "NO_SURFACE" };

  const polygon = surface.polygon;
  if (polygon.length !== 4) return { ok: false, reason: "NOT_A_QUAD" };

  const box = polygonBounds(polygon);
  if (!box) return { ok: false, reason: "NOT_A_QUAD" };

  // Order the four corners: top-left, top-right, bottom-right, bottom-left.
  const centreX = (box.minX + box.maxX) / 2;
  const centreY = (box.minY + box.maxY) / 2;
  const corner = (wantRight: boolean, wantBelow: boolean) =>
    polygon.find(
      (point) => point.x > centreX === wantRight && point.y > centreY === wantBelow,
    );

  const topLeft = corner(false, false);
  const topRight = corner(true, false);
  const bottomRight = corner(true, true);
  const bottomLeft = corner(false, true);
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    return { ok: false, reason: "NOT_A_QUAD" };
  }

  // Shrink towards the centre by `inset`, keeping the plane's shape.
  const pull = (point: NormPoint): ScenePoint => ({
    x: point.x + (centreX - point.x) * inset,
    y: point.y + (centreY - point.y) * inset,
  });

  const aspect = object.height / Math.max(1e-6, object.width);
  const quad: PerspectiveQuad = [pull(topLeft), pull(topRight), pull(bottomRight), pull(bottomLeft)];

  /*
   * Keep the object's proportion instead of stretching it to the whole wall:
   * a television fitted to a wall should still be 16:9, just lying on the
   * wall's plane. The quad is scaled about its own centre on the axis that
   * would otherwise stretch.
   */
  const quadWidth = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  const quadHeight = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
  const wanted = quadWidth * aspect;
  if (quadHeight > 1e-6 && wanted < quadHeight) {
    const scale = wanted / quadHeight;
    const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
    const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
    for (const point of quad) {
      point.x = cx + (point.x - cx) * 1;
      point.y = cy + (point.y - cy) * scale;
    }
  }

  return { ok: true, quad };
}

/** Moves a whole quad, for dragging an object that has been fitted. */
export function translateQuad(quad: PerspectiveQuad, dx: number, dy: number): PerspectiveQuad {
  return quad.map((point) => ({ x: point.x + dx, y: point.y + dy })) as PerspectiveQuad;
}

/** The centre of a quad, which is where its handles and label anchor. */
export function quadCentre(quad: PerspectiveQuad): ScenePoint {
  return {
    x: (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4,
    y: (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4,
  };
}
