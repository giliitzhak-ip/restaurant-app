"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lightbulb,
  Lock,
  LockOpen,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { SCENE_LAYERS, type SceneLayerId } from "@/types/scene";
import type { SceneController } from "../scene/use-scene";

/**
 * The layer list.
 *
 * Two halves, because a design has two kinds of layer and conflating them is
 * confusing. The top half is the fixed stack — photo, surfaces, cladding,
 * light, objects — which can be switched off to look underneath but not
 * reordered, because the order is what makes the picture physically
 * coherent. The bottom half is the things the customer put in the room,
 * which can be reordered, hidden, locked and deleted.
 *
 * Selecting a row selects the item, which is the fastest way to reach a light
 * that has ended up behind a sideboard and cannot be clicked.
 */

const LAYER_NAMES: Record<SceneLayerId, string> = {
  photo: "תמונת החדר",
  surfaces: "משטחים",
  cladding: "חיפויים וטקסטורות",
  backLight: "תאורה אחורית",
  objects: "ריהוט ומוצרים",
  frontLight: "תאורה קדמית",
  ui: "סימוני עריכה",
};

export function LayersPanel({
  controller,
  className,
}: {
  controller: SceneController;
  className?: string;
}) {
  const { scene, selectedId, orderedObjects, dispatch } = controller;

  // Top of the list is the front of the room, which is how people read a
  // layer stack everywhere else.
  const objectsTopFirst = React.useMemo(
    () => [...orderedObjects].reverse(),
    [orderedObjects],
  );

  const lights = [
    ...scene.lightingFixtures.map((fixture) => ({
      id: fixture.id,
      label: fixture.label,
      enabled: fixture.enabled,
      kind: "fixture" as const,
    })),
    ...scene.ledPaths.map((path) => ({
      id: path.id,
      label: path.label,
      enabled: path.enabled,
      kind: "path" as const,
    })),
  ];

  return (
    <div className={cn("flex h-full flex-col gap-5 overflow-y-auto px-1", className)}>
      <section>
        <h3 className="mb-2 text-[0.6875rem] tracking-[0.18em] text-studio-ink/50">
          שכבות התמונה
        </h3>
        <ul className="space-y-1">
          {SCENE_LAYERS.filter((layer) => layer !== "ui").map((layer) => {
            const hidden = scene.layers.hidden.includes(layer);
            return (
              <li
                key={layer}
                className="flex items-center justify-between gap-2 rounded-xs px-2 py-1.5 text-[0.75rem] text-studio-ink/80"
              >
                <span>{LAYER_NAMES[layer]}</span>
                <Switch
                  checked={!hidden}
                  onCheckedChange={() => dispatch({ type: "TOGGLE_LAYER", layer })}
                  aria-label={`${LAYER_NAMES[layer]} — הצגה`}
                />
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[0.625rem] leading-relaxed text-studio-ink/40">
          סדר השכבות קבוע: תאורה שמאחורי אובייקט חייבת להיות מצוירת מאחוריו.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-[0.6875rem] tracking-[0.18em] text-studio-ink/50">
          פריטים בחדר ({orderedObjects.length})
        </h3>
        {objectsTopFirst.length === 0 ? (
          <p className="text-[0.6875rem] text-studio-ink/45">
            עדיין לא הוספתם פריטים. פתחו ״הוספת פריטים״.
          </p>
        ) : (
          <ul className="space-y-1">
            {objectsTopFirst.map((object) => {
              const selected = object.id === selectedId;
              return (
                <li key={object.id}>
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-xs border px-1.5 py-1",
                      selected
                        ? "border-studio-ink/60 bg-studio-3"
                        : "border-transparent hover:bg-studio-3/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "SELECT", ids: [object.id] })}
                      className="press flex min-w-0 flex-1 items-center gap-2 rounded-xs px-1 py-1 text-start focus-ring-invert"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={object.assetUrl}
                        alt=""
                        className="size-6 shrink-0 object-contain opacity-80"
                      />
                      <span className="truncate text-[0.6875rem] text-studio-ink">
                        {object.label}
                      </span>
                    </button>
                    <IconButton
                      size="iconSm"
                      variant="studioOutline"
                      label={`${object.label} — הבאה קדימה`}
                      className="border-0"
                      onClick={() =>
                        dispatch({ type: "REORDER_OBJECT", id: object.id, direction: "UP" })
                      }
                    >
                      <ChevronUp />
                    </IconButton>
                    <IconButton
                      size="iconSm"
                      variant="studioOutline"
                      label={`${object.label} — שליחה אחורה`}
                      className="border-0"
                      onClick={() =>
                        dispatch({ type: "REORDER_OBJECT", id: object.id, direction: "DOWN" })
                      }
                    >
                      <ChevronDown />
                    </IconButton>
                    <IconButton
                      size="iconSm"
                      variant="studioOutline"
                      label={`${object.label} — ${object.visible ? "הסתרה" : "הצגה"}`}
                      aria-pressed={!object.visible}
                      className="border-0"
                      onClick={() =>
                        dispatch({
                          type: "UPDATE_OBJECT",
                          id: object.id,
                          patch: { visible: !object.visible },
                        })
                      }
                    >
                      {object.visible ? <Eye /> : <EyeOff />}
                    </IconButton>
                    <IconButton
                      size="iconSm"
                      variant="studioOutline"
                      label={`${object.label} — ${object.locked ? "ביטול נעילה" : "נעילה"}`}
                      aria-pressed={object.locked}
                      className="border-0"
                      onClick={() =>
                        dispatch({
                          type: "UPDATE_OBJECT",
                          id: object.id,
                          patch: { locked: !object.locked },
                        })
                      }
                    >
                      {object.locked ? <Lock /> : <LockOpen />}
                    </IconButton>
                    <IconButton
                      size="iconSm"
                      variant="studioOutline"
                      label={`${object.label} — מחיקה`}
                      className="border-0 text-danger"
                      disabled={object.locked}
                      onClick={() => dispatch({ type: "REMOVE_OBJECT", id: object.id })}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[0.6875rem] tracking-[0.18em] text-studio-ink/50">
          תאורה ({lights.length})
        </h3>
        {lights.length === 0 ? (
          <p className="text-[0.6875rem] text-studio-ink/45">
            עדיין לא הוספתם תאורה.
          </p>
        ) : (
          <ul className="space-y-1">
            {lights.map((light) => (
              <li key={light.id}>
                <div
                  className={cn(
                    "flex items-center gap-1 rounded-xs border px-1.5 py-1",
                    light.id === selectedId
                      ? "border-studio-ink/60 bg-studio-3"
                      : "border-transparent hover:bg-studio-3/60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "SELECT", ids: [light.id] })}
                    className="press flex min-w-0 flex-1 items-center gap-2 rounded-xs px-1 py-1 text-start focus-ring-invert"
                  >
                    <Lightbulb className="size-3.5 shrink-0 text-[#f2c185]" aria-hidden />
                    <span className="truncate text-[0.6875rem] text-studio-ink">
                      {light.label}
                    </span>
                  </button>
                  <Switch
                    checked={light.enabled}
                    onCheckedChange={(next) =>
                      light.kind === "fixture"
                        ? dispatch({
                            type: "UPDATE_FIXTURE",
                            id: light.id,
                            patch: { enabled: next },
                          })
                        : dispatch({
                            type: "UPDATE_PATH",
                            id: light.id,
                            patch: { enabled: next },
                          })
                    }
                    aria-label={`${light.label} — הפעלה`}
                  />
                  <IconButton
                    size="iconSm"
                    variant="studioOutline"
                    label={`${light.label} — מחיקה`}
                    className="border-0 text-danger"
                    onClick={() =>
                      light.kind === "fixture"
                        ? dispatch({ type: "REMOVE_FIXTURE", id: light.id })
                        : dispatch({ type: "REMOVE_PATH", id: light.id })
                    }
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
