import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  realFromSize,
  sizeFromReal,
  type PhotoFrame,
} from "../../src/features/room-designer/scene/factory";

/**
 * Normalised units are relative to a different number of pixels on each axis.
 * Everything here exists because forgetting that stretches every object in
 * the room by the photo's aspect ratio — 50% on a 3:2 photo, which is not
 * subtle and is very easy to ship.
 */

const landscape: PhotoFrame = { width: 3000, height: 2000, roomWidthM: 4 };
const portrait: PhotoFrame = { width: 2000, height: 3000, roomWidthM: 4 };

describe("real-world sizing", () => {
  it("makes a 4m-wide object fill a 4m-wide room", () => {
    const { width } = sizeFromReal(400, 100, landscape);
    assert.equal(width, 1);
  });

  it("scales width with the room, not with the photo", () => {
    const narrow = sizeFromReal(145, 84, { ...landscape, roomWidthM: 3 });
    const wide = sizeFromReal(145, 84, { ...landscape, roomWidthM: 6 });
    assert.ok(
      narrow.width > wide.width,
      "the same television takes up less of a bigger room",
    );
    assert.ok(Math.abs(narrow.width / wide.width - 2) < 1e-9);
  });

  it("keeps a square object square on screen, not square in normalised units", () => {
    const { width, height } = sizeFromReal(100, 100, landscape);
    // 3:2 photo, so a square is 1.5x taller in normalised units.
    assert.ok(Math.abs(height / width - 1.5) < 1e-9);
    // Which is what makes it actually square in pixels.
    assert.ok(
      Math.abs(width * landscape.width - height * landscape.height) < 1e-6,
      "equal pixel dimensions is the definition of square on screen",
    );
  });

  it("does the same on a portrait photo", () => {
    const { width, height } = sizeFromReal(100, 100, portrait);
    assert.ok(
      Math.abs(width * portrait.width - height * portrait.height) < 1e-6,
    );
  });

  it("preserves a 65\" television's 16:9 proportion in pixels", () => {
    const { width, height } = sizeFromReal(145, 84, landscape);
    const pixelAspect = (height * landscape.height) / (width * landscape.width);
    assert.ok(Math.abs(pixelAspect - 84 / 145) < 1e-9);
  });

  it("keeps a bigger screen bigger, by the right amount", () => {
    const tv55 = sizeFromReal(123, 71, landscape);
    const tv85 = sizeFromReal(189, 108, landscape);
    assert.ok(Math.abs(tv85.width / tv55.width - 189 / 123) < 1e-9);
  });

  it("caps an object that would not fit in any photograph", () => {
    const { width } = sizeFromReal(100_000, 100, landscape);
    assert.ok(width <= 1.6);
  });
});

describe("reading a size back", () => {
  it("round-trips centimetres through normalised units", () => {
    const { width, height } = sizeFromReal(145, 84, landscape);
    const back = realFromSize(width, height, landscape);
    assert.equal(back.widthCm, 145);
    assert.equal(back.heightCm, 84);
  });

  it("round-trips on a portrait photo too", () => {
    const { width, height } = sizeFromReal(200, 56, portrait);
    const back = realFromSize(width, height, portrait);
    assert.equal(back.widthCm, 200);
    assert.equal(back.heightCm, 56);
  });

  it("reports the new size after a drag, which is what the readout shows", () => {
    const { width, height } = sizeFromReal(145, 84, landscape);
    const stretched = realFromSize(width * 1.5, height * 1.5, landscape);
    /*
     * Within a centimetre rather than exact: the readout rounds, and
     * 145 × 1.5 lands on 217.5 — a value whose rounding is decided by the
     * last bit of a float rather than by anything about the design. A test
     * that pins it is testing IEEE 754, not the editor.
     */
    assert.ok(Math.abs(stretched.widthCm - 145 * 1.5) <= 1);
    assert.ok(Math.abs(stretched.heightCm - 84 * 1.5) <= 1);
  });
});
