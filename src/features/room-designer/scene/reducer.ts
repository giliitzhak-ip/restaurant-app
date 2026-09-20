import {
  SCENE_SCHEMA_VERSION,
  emptyScene,
  type DesignScene,
  type LedPath,
  type LightingFixture,
  type SceneLayerId,
  type SceneObject,
  type SceneViewport,
} from "@/types/scene";

/**
 * The scene, and its history.
 *
 * Undo is the feature this whole editor lives or dies on: someone arranging a
 * media wall will move the television thirty times, and every one of those
 * has to be reversible without thirty presses to get back one decision.
 *
 * So history is per *gesture*, not per change. A drag dispatches a stream of
 * updates that move the object and touch nothing else; `beginGesture` takes
 * one snapshot before the stream starts and `endGesture` commits it. One
 * drag, one undo — which is what people mean by undo, and what a naive
 * "snapshot every action" reducer gets wrong in both directions: it either
 * records hundreds of steps or, if it debounces, loses the last one.
 *
 * The reducer is pure. Ids are minted by the action creators rather than
 * here, because a reducer that calls `Math.random()` is not a function of its
 * arguments — React may call it twice, and the two calls would disagree.
 */

/** Far more than anyone reaches, and bounded so a long session cannot grow without limit. */
const HISTORY_LIMIT = 60;

export interface SceneState {
  present: DesignScene;
  past: DesignScene[];
  future: DesignScene[];
  /**
   * The snapshot taken when a gesture began, held until it ends. Non-null
   * means a gesture is in flight.
   */
  pending: DesignScene | null;
  /** Ids of the selected objects, fixtures or paths. Not part of history. */
  selection: string[];
}

export type SceneAction =
  /* history */
  | { type: "BEGIN_GESTURE" }
  | { type: "END_GESTURE" }
  | { type: "ABORT_GESTURE" }
  | { type: "UNDO" }
  | { type: "REDO" }
  /* whole-scene */
  | { type: "LOAD"; scene: DesignScene }
  | { type: "RESET" }
  /* objects */
  | { type: "ADD_OBJECT"; object: SceneObject }
  | { type: "UPDATE_OBJECT"; id: string; patch: Partial<SceneObject> }
  | { type: "UPDATE_OBJECTS"; patches: { id: string; patch: Partial<SceneObject> }[] }
  | { type: "REMOVE_OBJECT"; id: string }
  | { type: "DUPLICATE_OBJECT"; id: string; newId: string }
  | { type: "REORDER_OBJECT"; id: string; direction: "FRONT" | "BACK" | "UP" | "DOWN" }
  /* lighting */
  | { type: "ADD_FIXTURE"; fixture: LightingFixture }
  | { type: "UPDATE_FIXTURE"; id: string; patch: Partial<LightingFixture> }
  | { type: "REMOVE_FIXTURE"; id: string }
  | { type: "ADD_PATH"; path: LedPath }
  | { type: "UPDATE_PATH"; id: string; patch: Partial<LedPath> }
  | { type: "REMOVE_PATH"; id: string }
  /* view */
  | { type: "TOGGLE_LAYER"; layer: SceneLayerId }
  | { type: "SET_VIEWPORT"; viewport: SceneViewport }
  | { type: "SELECT"; ids: string[] };

export const initialSceneState = (scene?: DesignScene | null): SceneState => ({
  present: scene ?? emptyScene(),
  past: [],
  future: [],
  pending: null,
  selection: [],
});

/** Pushes onto history and drops the redo stack, which a new edit invalidates. */
function commit(state: SceneState, snapshot: DesignScene, next: DesignScene): SceneState {
  return {
    ...state,
    present: next,
    past: [...state.past, snapshot].slice(-HISTORY_LIMIT),
    future: [],
  };
}

/**
 * Applies a change.
 *
 * Inside a gesture the snapshot was already taken, so the change lands on
 * `present` and history is untouched; outside one, the change is its own
 * history entry. That is what makes a drag a single step and a click on
 * "duplicate" also a single step, with no special-casing at the call site.
 */
function change(state: SceneState, next: DesignScene): SceneState {
  if (state.pending) return { ...state, present: next, future: [] };
  return commit(state, state.present, next);
}

const withObjects = (scene: DesignScene, objects: SceneObject[]): DesignScene => ({
  ...scene,
  objects,
});

/** Highest layer index in use, so a new object lands on top. */
export const topLayerIndex = (scene: DesignScene) =>
  scene.objects.reduce((max, object) => Math.max(max, object.layerIndex), -1);

export function sceneReducer(state: SceneState, action: SceneAction): SceneState {
  switch (action.type) {
    /* ----------------------------- history ----------------------------- */

    case "BEGIN_GESTURE":
      // Re-entering without ending keeps the first snapshot: a pointer that
      // starts a second drag without releasing is still one intent.
      return state.pending ? state : { ...state, pending: state.present };

    case "END_GESTURE": {
      if (!state.pending) return state;
      // A gesture that changed nothing — a click that selected and released —
      // must not leave an undo step that appears to do nothing.
      if (state.pending === state.present) return { ...state, pending: null };
      return { ...commit(state, state.pending, state.present), pending: null };
    }

    case "ABORT_GESTURE":
      return state.pending
        ? { ...state, present: state.pending, pending: null }
        : state;

    case "UNDO": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
        pending: null,
      };
    }

    case "REDO": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        present: next,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        pending: null,
      };
    }

    /* --------------------------- whole scene --------------------------- */

    case "LOAD":
      // Opening a saved design is not an edit; it starts a fresh history.
      return initialSceneState({ ...action.scene, schemaVersion: SCENE_SCHEMA_VERSION });

    case "RESET":
      return initialSceneState();

    /* ----------------------------- objects ----------------------------- */

    case "ADD_OBJECT":
      return {
        ...change(state, {
          ...state.present,
          objects: [...state.present.objects, action.object],
        }),
        selection: [action.object.id],
      };

    case "UPDATE_OBJECT":
      return change(
        state,
        withObjects(
          state.present,
          state.present.objects.map((object) =>
            // A locked object refuses every change except being unlocked,
            // which is the entire point of the lock.
            object.id === action.id &&
            (!object.locked || "locked" in action.patch)
              ? { ...object, ...action.patch }
              : object,
          ),
        ),
      );

    case "UPDATE_OBJECTS": {
      const byId = new Map(action.patches.map((entry) => [entry.id, entry.patch]));
      return change(
        state,
        withObjects(
          state.present,
          state.present.objects.map((object) => {
            const patch = byId.get(object.id);
            if (!patch || (object.locked && !("locked" in patch))) return object;
            return { ...object, ...patch };
          }),
        ),
      );
    }

    case "REMOVE_OBJECT": {
      const target = state.present.objects.find((object) => object.id === action.id);
      if (!target || target.locked) return state;
      return {
        ...change(state, {
          ...state.present,
          objects: state.present.objects.filter((object) => object.id !== action.id),
          /*
           * A light attached to a deleted object goes with it. Leaving it
           * behind produces a glow hanging in mid-air with nothing casting
           * it, and no obvious way to select and remove it.
           */
          lightingFixtures: state.present.lightingFixtures.filter(
            (fixture) => fixture.attachedToObjectId !== action.id,
          ),
          ledPaths: state.present.ledPaths.filter(
            (path) => path.attachedToObjectId !== action.id,
          ),
        }),
        selection: state.selection.filter((id) => id !== action.id),
      };
    }

    case "DUPLICATE_OBJECT": {
      const source = state.present.objects.find((object) => object.id === action.id);
      if (!source) return state;
      // Offset so the copy is visibly a copy rather than hidden underneath.
      const copy: SceneObject = {
        ...source,
        id: action.newId,
        position: {
          x: source.position.x + source.width * 0.12,
          y: source.position.y + source.height * 0.12,
        },
        layerIndex: topLayerIndex(state.present) + 1,
        locked: false,
      };
      return {
        ...change(state, {
          ...state.present,
          objects: [...state.present.objects, copy],
        }),
        selection: [copy.id],
      };
    }

    case "REORDER_OBJECT": {
      const ordered = [...state.present.objects].sort(
        (a, b) => a.layerIndex - b.layerIndex,
      );
      const index = ordered.findIndex((object) => object.id === action.id);
      if (index === -1) return state;

      const target =
        action.direction === "FRONT"
          ? ordered.length - 1
          : action.direction === "BACK"
            ? 0
            : action.direction === "UP"
              ? Math.min(ordered.length - 1, index + 1)
              : Math.max(0, index - 1);
      if (target === index) return state;

      const [moved] = ordered.splice(index, 1);
      ordered.splice(target, 0, moved!);
      /*
       * Reindexed from zero rather than swapping two values. Swapping keeps
       * whatever gaps and duplicates earlier edits left behind, and a
       * duplicate index means the paint order is decided by array position —
       * which is to say, arbitrarily.
       */
      const reindexed = new Map(ordered.map((object, order) => [object.id, order]));
      return change(
        state,
        withObjects(
          state.present,
          state.present.objects.map((object) => ({
            ...object,
            layerIndex: reindexed.get(object.id) ?? object.layerIndex,
          })),
        ),
      );
    }

    /* ---------------------------- lighting ----------------------------- */

    case "ADD_FIXTURE":
      return {
        ...change(state, {
          ...state.present,
          lightingFixtures: [...state.present.lightingFixtures, action.fixture],
        }),
        selection: [action.fixture.id],
      };

    case "UPDATE_FIXTURE":
      return change(state, {
        ...state.present,
        lightingFixtures: state.present.lightingFixtures.map((fixture) =>
          fixture.id === action.id ? { ...fixture, ...action.patch } : fixture,
        ),
      });

    case "REMOVE_FIXTURE":
      return {
        ...change(state, {
          ...state.present,
          lightingFixtures: state.present.lightingFixtures.filter(
            (fixture) => fixture.id !== action.id,
          ),
        }),
        selection: state.selection.filter((id) => id !== action.id),
      };

    case "ADD_PATH":
      return {
        ...change(state, {
          ...state.present,
          ledPaths: [...state.present.ledPaths, action.path],
        }),
        selection: [action.path.id],
      };

    case "UPDATE_PATH":
      return change(state, {
        ...state.present,
        ledPaths: state.present.ledPaths.map((path) =>
          path.id === action.id ? { ...path, ...action.patch } : path,
        ),
      });

    case "REMOVE_PATH":
      return {
        ...change(state, {
          ...state.present,
          ledPaths: state.present.ledPaths.filter((path) => path.id !== action.id),
        }),
        selection: state.selection.filter((id) => id !== action.id),
      };

    /* ------------------------------- view ------------------------------ */

    case "TOGGLE_LAYER": {
      // `ui` is the editing furniture itself — handles, guides, the selection
      // frame. Hiding it would leave no way to bring it back.
      if (action.layer === "ui") return state;
      const hidden = state.present.layers.hidden.includes(action.layer)
        ? state.present.layers.hidden.filter((layer) => layer !== action.layer)
        : [...state.present.layers.hidden, action.layer];
      return change(state, { ...state.present, layers: { hidden } });
    }

    case "SET_VIEWPORT":
      // Panning and zooming are how you look at the design, not changes to
      // it, so they never enter history.
      return {
        ...state,
        present: { ...state.present, viewport: action.viewport },
      };

    case "SELECT":
      return { ...state, selection: action.ids };

    default:
      return state;
  }
}

export const canUndo = (state: SceneState) => state.past.length > 0;
export const canRedo = (state: SceneState) => state.future.length > 0;
