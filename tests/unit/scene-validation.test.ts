import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normaliseScene, readScene } from "../../src/server/design/scene";
import { emptyScene, type DesignScene } from "../../src/types/scene";

/**
 * A scene is authored in a browser and posted to us, so these are not tests
 * of a helper — they are tests of a trust boundary. Each one is a request
 * somebody could send.
 */

const baseObject = {
  id: "obj-1",
  type: "TV",
  assetId: "doa-tv-65",
  assetUrl: "/media/objects/tv-65.svg",
  label: "TV",
  productId: null,
  position: { x: 0.5, y: 0.4 },
  width: 0.3,
  height: 0.2,
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
};

const scene = (patch: Partial<DesignScene> = {}) =>
  ({ ...emptyScene(), ...patch }) as unknown;

const none = new Set<string>();

describe("product claims", () => {
  it("keeps a claim the catalogue vouches for", () => {
    const result = normaliseScene(
      scene({ objects: [{ ...baseObject, productId: "prod-real" }] as never }),
      new Set(["prod-real"]),
    );
    assert.equal(result?.objects[0]?.productId, "prod-real");
  });

  it("drops a claim the catalogue does not know", () => {
    const result = normaliseScene(
      scene({ objects: [{ ...baseObject, productId: "prod-invented" }] as never }),
      new Set(["prod-real"]),
    );
    assert.equal(
      result?.objects[0]?.productId,
      null,
      "an illustration must not be sellable because a request said so",
    );
    assert.equal(result?.objects.length, 1, "it keeps its picture, it loses its price");
  });
});

describe("asset urls", () => {
  it("accepts a site-relative path", () => {
    const result = normaliseScene(scene({ objects: [baseObject] as never }), none);
    assert.equal(result?.objects.length, 1);
  });

  for (const url of [
    "https://evil.example/tracker.svg",
    "//evil.example/tracker.svg",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  ]) {
    it(`refuses ${url.slice(0, 28)}`, () => {
      const result = normaliseScene(
        scene({ objects: [{ ...baseObject, assetUrl: url }] as never }),
        none,
      );
      assert.equal(
        result,
        null,
        "a saved design is rendered on every device that opens it",
      );
    });
  }
});

describe("bounds", () => {
  it("clamps a width nobody could have dragged to", () => {
    const result = normaliseScene(
      scene({ objects: [{ ...baseObject, width: 1e9 }] as never }),
      none,
    );
    assert.ok(result!.objects[0]!.width <= 2);
  });

  it("clamps a negative opacity", () => {
    const result = normaliseScene(
      scene({ objects: [{ ...baseObject, opacity: -40 }] as never }),
      none,
    );
    assert.equal(result!.objects[0]!.opacity, 0);
  });

  it("refuses NaN and Infinity, which survive JSON as nulls or strings", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = normaliseScene(
        scene({ objects: [{ ...baseObject, width: value }] as never }),
        none,
      );
      assert.equal(result, null);
    }
  });

  it("holds light temperature to the range of white light people buy", () => {
    const result = normaliseScene(
      scene({
        lightingFixtures: [
          {
            id: "lit-1",
            type: "SPOTLIGHT",
            label: "spot",
            position: { x: 0.5, y: 0.5 },
            width: 0.1,
            height: 0.1,
            direction: 0,
            intensity: 0.5,
            spread: 0.5,
            blur: 0.5,
            colorMode: "WHITE",
            temperatureK: 99000,
            color: "#ffb86b",
            placement: "FRONT",
            layerIndex: 0,
            enabled: true,
            attachedToObjectId: null,
            surfaceId: null,
          },
        ] as never,
      }),
      none,
    );
    assert.equal(result!.lightingFixtures[0]!.temperatureK, 6500);
  });

  it("refuses a colour that is not a hex triple", () => {
    const result = normaliseScene(
      scene({
        ledPaths: [
          {
            id: "led-1",
            shape: "LINE",
            label: "run",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
            closed: false,
            thickness: 0.006,
            intensity: 0.5,
            spread: 0.5,
            blur: 0.5,
            colorMode: "RGB",
            temperatureK: 3000,
            color: "red; background: url(x)",
            placement: "FRONT",
            layerIndex: 0,
            enabled: true,
            attachedToObjectId: null,
            surfaceId: null,
          },
        ] as never,
      }),
      none,
    );
    assert.equal(result, null);
  });
});

describe("size", () => {
  it("refuses a scene with more objects than the cap", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      ...baseObject,
      id: `obj-${i}`,
    }));
    assert.equal(normaliseScene(scene({ objects: many as never }), none), null);
  });

  it("refuses an LED run with more points than the cap", () => {
    const points = Array.from({ length: 500 }, (_, i) => ({ x: i / 500, y: 0.5 }));
    const result = normaliseScene(
      scene({
        ledPaths: [
          {
            id: "led-1",
            shape: "FREE",
            label: "run",
            points,
            closed: false,
            thickness: 0.006,
            intensity: 0.5,
            spread: 0.5,
            blur: 0.5,
            colorMode: "WHITE",
            temperatureK: 3000,
            color: "#ffb86b",
            placement: "FRONT",
            layerIndex: 0,
            enabled: true,
            attachedToObjectId: null,
            surfaceId: null,
          },
        ] as never,
      }),
      none,
    );
    assert.equal(result, null);
  });
});

describe("referential integrity", () => {
  it("deduplicates ids, which everything else references", () => {
    const result = normaliseScene(
      scene({ objects: [baseObject, { ...baseObject, width: 0.9 }] as never }),
      none,
    );
    assert.equal(result!.objects.length, 1);
  });

  it("detaches a light bound to an object that is not in the scene", () => {
    const result = normaliseScene(
      scene({
        objects: [baseObject] as never,
        lightingFixtures: [
          {
            id: "lit-1",
            type: "LED_BEHIND_TV",
            label: "glow",
            position: { x: 0.5, y: 0.5 },
            width: 0.3,
            height: 0.2,
            direction: 0,
            intensity: 0.5,
            spread: 0.5,
            blur: 0.5,
            colorMode: "WHITE",
            temperatureK: 3000,
            color: "#ffb86b",
            placement: "HIDDEN",
            layerIndex: 0,
            enabled: true,
            attachedToObjectId: "obj-that-is-not-here",
            surfaceId: null,
          },
        ] as never,
      }),
      none,
    );
    assert.equal(result!.lightingFixtures[0]!.attachedToObjectId, null);
  });
});

describe("reading back", () => {
  it("a null scene reads as an empty one", () => {
    assert.deepEqual(readScene(null), emptyScene());
  });

  it("a scene that will not parse opens empty rather than throwing", () => {
    assert.deepEqual(readScene({ objects: "not an array" }), emptyScene());
    assert.deepEqual(readScene("garbage"), emptyScene());
    assert.deepEqual(
      readScene({ objects: [{ id: 1 }] }),
      emptyScene(),
      "losing the furniture must not cost the customer the cladding too",
    );
  });

  it("round-trips a scene it wrote", () => {
    const stored = normaliseScene(scene({ objects: [baseObject] as never }), none);
    const read = readScene(stored);
    assert.equal(read.objects.length, 1);
    assert.equal(read.objects[0]!.id, "obj-1");
  });
});
