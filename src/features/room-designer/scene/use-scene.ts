"use client";

import * as React from "react";
import { createId } from "@/lib/utils";
import type { DesignScene, SceneObject } from "@/types/scene";
import {
  canRedo,
  canUndo,
  initialSceneState,
  sceneReducer,
  type SceneAction,
} from "./reducer";

/**
 * Scene state, plus the two things every editor needs around it: keyboard
 * control and a way for the rest of the app to know something changed.
 *
 * The reducer holds everything undoable. This holds what is not: which tool
 * is active, whether a gesture is in flight, and the plumbing that turns a
 * key press into an action.
 */

export type SceneTool =
  | { kind: "SELECT" }
  | { kind: "DRAW_LED"; shape: "FREE" | "LINE" | "RECTANGLE"; points: [] }
  | { kind: "PERSPECTIVE"; objectId: string };

export function useScene(initial?: DesignScene | null) {
  const [state, dispatch] = React.useReducer(
    sceneReducer,
    initial,
    initialSceneState,
  );
  const [tool, setTool] = React.useState<SceneTool>({ kind: "SELECT" });

  const selectedId = state.selection[0] ?? null;

  const selectedObject =
    state.present.objects.find((object) => object.id === selectedId) ?? null;
  const selectedFixture =
    state.present.lightingFixtures.find((fixture) => fixture.id === selectedId) ?? null;
  const selectedPath =
    state.present.ledPaths.find((path) => path.id === selectedId) ?? null;

  /**
   * Keyboard.
   *
   * Everything reachable by mouse is reachable here: arrows nudge, shift
   * makes the nudge coarse, Delete removes, and the whole editor is
   * undoable from the keyboard. Bound to the document rather than to the
   * stage, because the selection persists while a panel on the other side of
   * the screen has focus, and a shortcut that only works when the canvas
   * happens to be focused is a shortcut people learn not to trust.
   *
   * It stays out of the way of typing: a key pressed inside a field, or
   * anywhere `contenteditable`, is that field's.
   */
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "REDO" : "UNDO" });
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        dispatch({ type: "REDO" });
        return;
      }

      if (!selectedId) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (selectedObject) dispatch({ type: "REMOVE_OBJECT", id: selectedId });
        else if (selectedFixture) dispatch({ type: "REMOVE_FIXTURE", id: selectedId });
        else if (selectedPath) dispatch({ type: "REMOVE_PATH", id: selectedId });
        return;
      }

      if (meta && event.key.toLowerCase() === "d" && selectedObject) {
        event.preventDefault();
        dispatch({ type: "DUPLICATE_OBJECT", id: selectedId, newId: createId("obj") });
        return;
      }

      if (event.key === "Escape") {
        dispatch({ type: "SELECT", ids: [] });
        setTool({ kind: "SELECT" });
        return;
      }

      const nudges: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const nudge = nudges[event.key];
      if (!nudge) return;

      event.preventDefault();
      // Coarse with shift, fine without — the same convention as every
      // drawing tool, and the fine step is small enough to be worth having.
      const step = event.shiftKey ? 0.02 : 0.002;
      const [dx, dy] = nudge;

      if (selectedObject) {
        dispatch({
          type: "UPDATE_OBJECT",
          id: selectedObject.id,
          patch: {
            position: {
              x: selectedObject.position.x + dx * step,
              y: selectedObject.position.y + dy * step,
            },
          },
        });
      } else if (selectedFixture) {
        dispatch({
          type: "UPDATE_FIXTURE",
          id: selectedFixture.id,
          patch: {
            position: {
              x: selectedFixture.position.x + dx * step,
              y: selectedFixture.position.y + dy * step,
            },
          },
        });
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedFixture, selectedId, selectedObject, selectedPath]);

  /** Objects in paint order, so the stage never has to sort while rendering. */
  const orderedObjects = React.useMemo(
    () => [...state.present.objects].sort((a, b) => a.layerIndex - b.layerIndex),
    [state.present.objects],
  );

  const act = React.useCallback((action: SceneAction) => dispatch(action), []);

  return {
    scene: state.present,
    selection: state.selection,
    selectedId,
    selectedObject,
    selectedFixture,
    selectedPath,
    orderedObjects,
    tool,
    setTool,
    dispatch: act,
    canUndo: canUndo(state),
    canRedo: canRedo(state),
    /** True while a drag is in flight, which suppresses autosave. */
    gesturing: state.pending !== null,
  };
}

export type SceneController = ReturnType<typeof useScene>;

/** Which objects a bill of materials may price: the ones with a real product. */
export function sellableObjects(scene: DesignScene): SceneObject[] {
  return scene.objects.filter((object) => Boolean(object.productId));
}
