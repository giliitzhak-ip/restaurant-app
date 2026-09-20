import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRedo,
  canUndo,
  initialSceneState,
  sceneReducer,
  type SceneAction,
  type SceneState,
} from "../../src/features/room-designer/scene/reducer";
import { emptyScene, type LightingFixture, type SceneObject } from "../../src/types/scene";

/** Runs a list of actions from a fresh state. */
function run(actions: SceneAction[], from: SceneState = initialSceneState()) {
  return actions.reduce(sceneReducer, from);
}

function object(id: string, patch: Partial<SceneObject> = {}): SceneObject {
  return {
    id,
    type: "TV",
    assetId: "doa-tv-65",
    assetUrl: "/media/objects/tv-65.svg",
    label: 'טלוויזיה 65"',
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
    ...patch,
  };
}

function fixture(id: string, patch: Partial<LightingFixture> = {}): LightingFixture {
  return {
    id,
    type: "LED_BEHIND_TV",
    label: "פס LED",
    position: { x: 0.5, y: 0.4 },
    width: 0.32,
    height: 0.22,
    direction: 0,
    intensity: 0.6,
    spread: 0.7,
    blur: 0.8,
    colorMode: "WHITE",
    temperatureK: 2900,
    color: "#ffb86b",
    placement: "HIDDEN",
    layerIndex: 0,
    enabled: true,
    attachedToObjectId: null,
    surfaceId: "wall-1",
    ...patch,
  };
}

describe("history", () => {
  it("records one step per gesture, however many moves it contains", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("a") },
      { type: "BEGIN_GESTURE" },
      { type: "UPDATE_OBJECT", id: "a", patch: { position: { x: 0.3, y: 0.4 } } },
      { type: "UPDATE_OBJECT", id: "a", patch: { position: { x: 0.2, y: 0.4 } } },
      { type: "UPDATE_OBJECT", id: "a", patch: { position: { x: 0.1, y: 0.4 } } },
      { type: "END_GESTURE" },
    ]);

    // Two steps: adding it, and the whole drag.
    assert.equal(state.past.length, 2);
    assert.equal(state.present.objects[0]!.position.x, 0.1);

    const undone = sceneReducer(state, { type: "UNDO" });
    assert.equal(
      undone.present.objects[0]!.position.x,
      0.5,
      "one undo should reverse the entire drag, not its last frame",
    );
  });

  it("does not record a gesture that changed nothing", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("a") },
      { type: "BEGIN_GESTURE" },
      { type: "END_GESTURE" },
    ]);
    assert.equal(state.past.length, 1);
    assert.equal(state.pending, null);
  });

  it("aborts a gesture back to where it started", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("a") },
      { type: "BEGIN_GESTURE" },
      { type: "UPDATE_OBJECT", id: "a", patch: { width: 0.9 } },
      { type: "ABORT_GESTURE" },
    ]);
    assert.equal(state.present.objects[0]!.width, 0.3);
    assert.equal(state.past.length, 1);
  });

  it("redoes, and a new edit clears the redo stack", () => {
    let state = run([
      { type: "ADD_OBJECT", object: object("a") },
      { type: "UPDATE_OBJECT", id: "a", patch: { rotation: 15 } },
      { type: "UNDO" },
    ]);
    assert.ok(canRedo(state));
    state = sceneReducer(state, { type: "REDO" });
    assert.equal(state.present.objects[0]!.rotation, 15);

    state = sceneReducer(state, { type: "UNDO" });
    state = sceneReducer(state, { type: "UPDATE_OBJECT", id: "a", patch: { opacity: 0.5 } });
    assert.equal(canRedo(state), false, "an edit after undo invalidates the redo stack");
  });

  it("undo on an empty history is a no-op rather than an error", () => {
    const state = initialSceneState();
    assert.equal(canUndo(state), false);
    assert.equal(sceneReducer(state, { type: "UNDO" }), state);
    assert.equal(sceneReducer(state, { type: "REDO" }), state);
  });

  it("opening a saved design starts a fresh history", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("a") },
      { type: "LOAD", scene: { ...emptyScene(), objects: [object("b")] } },
    ]);
    assert.equal(state.past.length, 0, "you cannot undo past the design you opened");
    assert.equal(state.present.objects[0]!.id, "b");
  });
});

describe("objects", () => {
  it("refuses every change to a locked object except unlocking it", () => {
    let state = run([
      { type: "ADD_OBJECT", object: object("a", { locked: true }) },
      { type: "UPDATE_OBJECT", id: "a", patch: { position: { x: 0.9, y: 0.9 } } },
    ]);
    assert.equal(state.present.objects[0]!.position.x, 0.5, "a lock has to actually hold");

    state = sceneReducer(state, { type: "UPDATE_OBJECT", id: "a", patch: { locked: false } });
    assert.equal(state.present.objects[0]!.locked, false);
  });

  it("refuses to delete a locked object", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("a", { locked: true }) },
      { type: "REMOVE_OBJECT", id: "a" },
    ]);
    assert.equal(state.present.objects.length, 1);
  });

  it("takes attached lights with a deleted object", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("tv") },
      { type: "ADD_FIXTURE", fixture: fixture("glow", { attachedToObjectId: "tv" }) },
      { type: "ADD_FIXTURE", fixture: fixture("lamp") },
      { type: "REMOVE_OBJECT", id: "tv" },
    ]);
    assert.equal(state.present.objects.length, 0);
    assert.deepEqual(
      state.present.lightingFixtures.map((f) => f.id),
      ["lamp"],
      "a glow with nothing casting it should not be left hanging in mid-air",
    );
  });

  it("offsets a duplicate so it is not hidden underneath the original", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("a") },
      { type: "DUPLICATE_OBJECT", id: "a", newId: "b" },
    ]);
    const [first, copy] = state.present.objects;
    assert.notEqual(copy!.position.x, first!.position.x);
    assert.ok(copy!.layerIndex > first!.layerIndex);
    assert.deepEqual(state.selection, ["b"], "the copy becomes the selection");
  });

  it("a duplicate of a locked object is not itself locked", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("a", { locked: true }) },
      { type: "DUPLICATE_OBJECT", id: "a", newId: "b" },
    ]);
    assert.equal(state.present.objects[1]!.locked, false);
  });

  it("reindexes layers from zero rather than swapping, so no two share an index", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("a", { layerIndex: 0 }) },
      { type: "ADD_OBJECT", object: object("b", { layerIndex: 5 }) },
      { type: "ADD_OBJECT", object: object("c", { layerIndex: 5 }) },
      { type: "REORDER_OBJECT", id: "a", direction: "FRONT" },
    ]);
    const indices = state.present.objects.map((o) => o.layerIndex).sort();
    assert.deepEqual(indices, [0, 1, 2]);
    const a = state.present.objects.find((o) => o.id === "a")!;
    assert.equal(a.layerIndex, 2, "sent to the front means the highest index");
  });

  it("sending the front object forward again does nothing", () => {
    const before = run([
      { type: "ADD_OBJECT", object: object("a") },
      { type: "ADD_OBJECT", object: object("b") },
    ]);
    const after = sceneReducer(before, { type: "REORDER_OBJECT", id: "b", direction: "FRONT" });
    assert.equal(after, before, "a no-op must not leave an undo step");
  });
});

describe("layers and viewport", () => {
  it("will not hide the editing layer, which could not be brought back", () => {
    const state = sceneReducer(initialSceneState(), { type: "TOGGLE_LAYER", layer: "ui" });
    assert.deepEqual(state.present.layers.hidden, []);
  });

  it("toggles a layer off and on again", () => {
    let state = sceneReducer(initialSceneState(), { type: "TOGGLE_LAYER", layer: "objects" });
    assert.deepEqual(state.present.layers.hidden, ["objects"]);
    state = sceneReducer(state, { type: "TOGGLE_LAYER", layer: "objects" });
    assert.deepEqual(state.present.layers.hidden, []);
  });

  it("keeps panning and zooming out of history", () => {
    const state = run([
      { type: "ADD_OBJECT", object: object("a") },
      { type: "SET_VIEWPORT", viewport: { zoom: 2, panX: 0.1, panY: 0 } },
    ]);
    assert.equal(state.past.length, 1, "looking at the design is not changing it");
    assert.equal(state.present.viewport.zoom, 2);
  });
});
