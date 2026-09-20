import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { snapObject } from "../../src/features/room-designer/scene/snapping";
import type { SceneObject } from "../../src/types/scene";
import type { RoomSurfaceMask } from "../../src/types/design";

const wall: RoomSurfaceMask = {
  id: "wall-1",
  kind: "WALL",
  label: "wall",
  polygon: [
    { x: 0.1, y: 0.05 },
    { x: 0.9, y: 0.05 },
    { x: 0.9, y: 0.7 },
    { x: 0.1, y: 0.7 },
  ],
  holes: [],
  confidence: 1,
  source: "AUTO",
};

const floor: RoomSurfaceMask = {
  ...wall,
  id: "floor-1",
  kind: "FLOOR",
  polygon: [
    { x: 0, y: 0.7 },
    { x: 1, y: 0.7 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
};

function object(id: string, patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    type: "TV",
    assetId: null,
    assetUrl: "/media/objects/tv-65.svg",
    label: "tv",
    productId: null,
    position: { x: 0.5, y: 0.4 },
    width: 0.2,
    height: 0.12,
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

const base = {
  others: [] as SceneObject[],
  surface: wall,
  floor,
  threshold: 0.02,
  roomWidthM: 4,
  photoAspect: 1.5,
};

describe("wall magnets", () => {
  it("centres an object that is nearly centred on the wall", () => {
    const result = snapObject({
      ...base,
      moving: { id: "a", width: 0.2, height: 0.12 },
      candidate: { x: 0.508, y: 0.3 },
    });
    // The wall spans 0.1..0.9, so its centre is 0.5.
    assert.equal(result.position.x, 0.5);
    assert.ok(result.guides.some((g) => g.kind === "WALL_CENTRE"));
  });

  it("leaves an object alone when it is not close to anything", () => {
    const result = snapObject({
      ...base,
      moving: { id: "a", width: 0.2, height: 0.12 },
      candidate: { x: 0.3, y: 0.3 },
    });
    assert.equal(result.position.x, 0.3);
    assert.equal(result.guides.some((g) => g.axis === "x"), false);
  });

  it("snaps a near edge to the wall edge, not the object's centre to it", () => {
    const result = snapObject({
      ...base,
      moving: { id: "a", width: 0.2, height: 0.12 },
      // Left edge at 0.205, close to the wall's left edge at 0.1? No — test
      // the right edge instead: centre 0.795 puts the edge at 0.895.
      candidate: { x: 0.795, y: 0.3 },
    });
    assert.ok(Math.abs(result.position.x + 0.1 - 0.9) < 1e-9, "right edge lands on 0.9");
    assert.ok(result.guides.some((g) => g.kind === "WALL_EDGE"));
  });
});

describe("object magnets", () => {
  it("lines a sideboard up with the centre of the television", () => {
    const tv = object("tv", { position: { x: 0.62, y: 0.3 }, width: 0.3, height: 0.18 });
    const result = snapObject({
      ...base,
      others: [tv],
      moving: { id: "side", width: 0.4, height: 0.08 },
      candidate: { x: 0.615, y: 0.52 },
    });
    assert.equal(result.position.x, 0.62);
    const guide = result.guides.find((g) => g.kind === "OBJECT_CENTRE");
    assert.equal(guide?.label, "מרכז הטלוויזיה");
  });

  it("ignores a locked object as an alignment target", () => {
    const tv = object("tv", { position: { x: 0.62, y: 0.3 }, locked: true });
    const result = snapObject({
      ...base,
      others: [tv],
      moving: { id: "side", width: 0.4, height: 0.08 },
      candidate: { x: 0.615, y: 0.52 },
    });
    assert.equal(result.position.x, 0.615);
  });

  it("never snaps an object to itself", () => {
    const self = object("a", { position: { x: 0.3, y: 0.3 } });
    const result = snapObject({
      ...base,
      others: [self],
      moving: { id: "a", width: 0.2, height: 0.12 },
      candidate: { x: 0.302, y: 0.3 },
    });
    assert.equal(result.position.x, 0.302);
  });
});

describe("equal spacing", () => {
  it("centres an object between its two neighbours", () => {
    /*
     * Neighbours at 0.2 and 0.7, so the midpoint is 0.45 — deliberately not
     * 0.5, which is also the centre of the wall. With both on the same line
     * the tie would go to the wall, correctly, and the test would be
     * asserting the wrong magnet.
     */
    const left = object("l", { position: { x: 0.2, y: 0.4 }, width: 0.1, height: 0.1 });
    const right = object("r", { position: { x: 0.7, y: 0.4 }, width: 0.1, height: 0.1 });
    const result = snapObject({
      ...base,
      others: [left, right],
      moving: { id: "m", width: 0.1, height: 0.1 },
      candidate: { x: 0.444, y: 0.4 },
    });
    assert.ok(Math.abs(result.position.x - 0.45) < 1e-9);
    assert.ok(result.guides.some((g) => g.kind === "EQUAL_SPACING"));
  });
});

describe("height above the floor", () => {
  it("reports the gap in centimetres when nothing else claims the axis", () => {
    const result = snapObject({
      ...base,
      moving: { id: "a", width: 0.2, height: 0.12 },
      // y = 0.25 keeps the object clear of the wall's own vertical centre at
      // 0.375, which would otherwise take the axis and suppress the readout.
      candidate: { x: 0.3, y: 0.25 },
    });
    const guide = result.guides.find((g) => g.kind === "FLOOR_LINE");
    // Bottom at 0.31, floor at 0.7 → 0.39 normalised; ÷1.5 aspect × 4m = 104cm.
    assert.equal(guide?.label, "104 ס״מ מהרצפה");
  });

  it("rests an object on the floor line when it is close to it", () => {
    const result = snapObject({
      ...base,
      moving: { id: "a", width: 0.2, height: 0.3 },
      candidate: { x: 0.3, y: 0.556 },
    });
    // Bottom edge lands on the floor line at 0.7.
    assert.ok(Math.abs(result.position.y + 0.15 - 0.7) < 1e-9);
    assert.equal(
      result.guides.find((g) => g.axis === "y")?.label,
      "על הרצפה",
    );
  });
});
