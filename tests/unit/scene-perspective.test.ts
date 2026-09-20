import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fitToSurface,
  quadCentre,
  quadFromRect,
  quadToMatrix3d,
  translateQuad,
} from "../../src/features/room-designer/scene/perspective";
import { kelvinToRgb, lightColor } from "../../src/features/room-designer/scene/lighting";
import type { SceneObject, ScenePoint } from "../../src/types/scene";
import type { RoomSurfaceMask } from "../../src/types/design";

function object(patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id: "a",
    type: "TV",
    assetId: null,
    assetUrl: "/media/objects/tv-65.svg",
    label: "tv",
    productId: null,
    position: { x: 0.5, y: 0.4 },
    width: 0.3,
    height: 0.18,
    rotation: 0,
    flipX: false,
    opacity: 1,
    layerIndex: 0,
    surfaceId: "wall-1",
    perspectivePoints: null,
    locked: false,
    visible: true,
    realWidthCm: 145,
    realHeightCm: 84,
    ...patch,
  };
}

/** Applies the matrix the way the browser would, to check it maps corners. */
function applyMatrix(matrix: string, x: number, y: number) {
  const v = matrix
    .slice("matrix3d(".length, -1)
    .split(",")
    .map((part) => Number(part));
  // Column-major 4x4; we use rows 0,1 and the projective row 3.
  const [a, d, , g, b, e, , h, , , , , c, f] = v as number[];
  const w = g! * x + h! * y + 1;
  return { x: (a! * x + b! * y + c!) / w, y: (d! * x + e! * y + f!) / w };
}

describe("quad to matrix3d", () => {
  it("maps the element's four corners onto the quad", () => {
    const quad: ScenePoint[] = [
      { x: 10, y: 20 },
      { x: 180, y: 5 },
      { x: 200, y: 140 },
      { x: 0, y: 160 },
    ];
    const matrix = quadToMatrix3d(quad, 100, 50)!;
    assert.ok(matrix);

    const corners: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 50],
      [0, 50],
    ];
    corners.forEach(([x, y], index) => {
      const mapped = applyMatrix(matrix, x, y);
      // A thousandth of a pixel: tight enough that a wrong formula fails,
      // loose enough not to be a test of float serialisation.
      assert.ok(Math.abs(mapped.x - quad[index]!.x) < 1e-3, `corner ${index} x`);
      assert.ok(Math.abs(mapped.y - quad[index]!.y) < 1e-3, `corner ${index} y`);
    });
  });

  it("handles a parallelogram, where the projective row is zero", () => {
    const quad: ScenePoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 120, y: 50 },
      { x: 20, y: 50 },
    ];
    const matrix = quadToMatrix3d(quad, 100, 50)!;
    const mapped = applyMatrix(matrix, 100, 50);
    assert.ok(Math.abs(mapped.x - 120) < 1e-3);
    assert.ok(Math.abs(mapped.y - 50) < 1e-3);
  });

  it("refuses a degenerate quad instead of emitting NaN", () => {
    const collinear: ScenePoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ];
    const matrix = quadToMatrix3d(collinear, 100, 50);
    assert.ok(matrix === null || !matrix.includes("NaN"));
  });

  it("refuses a zero-sized element", () => {
    assert.equal(quadToMatrix3d(quadFromRect(object()), 0, 50), null);
  });
});

describe("fitting to a surface", () => {
  const quadWall: RoomSurfaceMask = {
    id: "wall-1",
    kind: "WALL",
    label: "wall",
    polygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.16 },
      { x: 0.9, y: 0.68 },
      { x: 0.1, y: 0.74 },
    ],
    holes: [],
    confidence: 1,
    source: "AUTO",
  };

  it("fits to a wall that is genuinely four-cornered", () => {
    const result = fitToSurface(object(), quadWall);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.quad.length, 4);
      // Inset, so it does not sit edge to edge with the wall.
      assert.ok(result.quad[0]!.x > quadWall.polygon[0]!.x);
    }
  });

  it("refuses a traced outline rather than guessing four corners from it", () => {
    const traced: RoomSurfaceMask = {
      ...quadWall,
      polygon: [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.08 },
        { x: 0.9, y: 0.16 },
        { x: 0.88, y: 0.4 },
        { x: 0.9, y: 0.68 },
        { x: 0.4, y: 0.72 },
        { x: 0.1, y: 0.74 },
      ],
    };
    const result = fitToSurface(object(), traced);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "NOT_A_QUAD");
  });

  it("says so when there is no surface at all", () => {
    const result = fitToSurface(object(), null);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "NO_SURFACE");
  });

  it("keeps the object's proportion rather than stretching it to the wall", () => {
    const wide = object({ width: 0.3, height: 0.05 });
    const result = fitToSurface(wide, quadWall);
    assert.equal(result.ok, true);
    if (result.ok) {
      const top = Math.hypot(
        result.quad[1]!.x - result.quad[0]!.x,
        result.quad[1]!.y - result.quad[0]!.y,
      );
      const side = Math.hypot(
        result.quad[3]!.x - result.quad[0]!.x,
        result.quad[3]!.y - result.quad[0]!.y,
      );
      const ratio = side / top;
      assert.ok(
        Math.abs(ratio - 0.05 / 0.3) < 0.02,
        `expected roughly 1:6, got ${ratio.toFixed(3)}`,
      );
    }
  });
});

describe("quad helpers", () => {
  it("starts from where the object already is", () => {
    const quad = quadFromRect(object());
    const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9);
    near(quad[0].x, 0.35);
    near(quad[0].y, 0.31);
    near(quad[2].x, 0.65);
    near(quad[2].y, 0.49);
  });

  it("moves a fitted object without changing its shape", () => {
    const quad = quadFromRect(object());
    const moved = translateQuad(quad, 0.1, -0.05);
    assert.deepEqual(quadCentre(moved), {
      x: quadCentre(quad).x + 0.1,
      y: quadCentre(quad).y - 0.05,
    });
  });
});

describe("colour temperature", () => {
  it("makes 2700K warm and 6500K cool", () => {
    const [wr, , wb] = kelvinToRgb(2700);
    const [cr, cg, cb] = kelvinToRgb(6500);
    assert.ok(wr > wb, "warm light has more red than blue");
    assert.ok(cb > wb, "cool light has more blue than warm light");
    assert.ok(cr <= 255 && cg <= 255 && cb <= 255);
  });

  it("clamps outside the range of white light anyone sells", () => {
    assert.deepEqual(kelvinToRgb(1000), kelvinToRgb(2200));
    assert.deepEqual(kelvinToRgb(20000), kelvinToRgb(6500));
  });

  it("uses the chosen colour in RGB mode and the temperature otherwise", () => {
    assert.equal(
      lightColor({ colorMode: "RGB", color: "#ff0044", temperatureK: 3000 }),
      "#ff0044",
    );
    assert.notEqual(
      lightColor({ colorMode: "WHITE", color: "#ff0044", temperatureK: 3000 }),
      "#ff0044",
    );
  });
});
