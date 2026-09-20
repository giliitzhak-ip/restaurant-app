"use client";

import * as React from "react";
import {
  ChevronsDown,
  ChevronsUp,
  Copy,
  FlipHorizontal,
  Frame,
  Lock,
  LockOpen,
  RotateCw,
  Trash2,
} from "lucide-react";
import { createId } from "@/lib/utils";
import { IconButton } from "@/components/ui/icon-button";
import type { RoomSurfaceMask } from "@/types/design";
import type { PerspectiveQuad, SceneObject, ScenePoint } from "@/types/scene";
import { fitToSurface, quadCentre, quadFromRect } from "../scene/perspective";
import { realFromSize, type PhotoFrame } from "../scene/factory";
import type { SceneController } from "../scene/use-scene";

/**
 * The frame around the selected object, and what you can do to it.
 *
 * Only ever one frame: showing handles on everything turns a room into a
 * technical drawing, and the one thing a customer is trying to look at is the
 * room.
 *
 * Every handle is 12px of paint and 44px of target. On a phone the visible
 * dot has to stay small or it covers the thing being adjusted, and the touch
 * area has to stay large or it cannot be hit — `tap-target` grows the second
 * without changing the first.
 */

type HandleId = "nw" | "ne" | "se" | "sw";

const CORNERS: { id: HandleId; x: number; y: number; cursor: string }[] = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" },
];

function toNormalised(element: HTMLElement, clientX: number, clientY: number): ScenePoint {
  const rect = element.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / Math.max(1, rect.width),
    y: (clientY - rect.top) / Math.max(1, rect.height),
  };
}

export function ObjectControls({
  controller,
  object,
  stage,
  surface,
  frame,
  onRequestPerspective,
  perspectiveMode,
}: {
  controller: SceneController;
  object: SceneObject;
  /** The overlay element, for coordinate conversion. */
  stage: HTMLElement | null;
  surface: RoomSurfaceMask | null;
  frame: PhotoFrame;
  onRequestPerspective: (on: boolean) => void;
  perspectiveMode: boolean;
}) {
  const { dispatch } = controller;
  const [fitMessage, setFitMessage] = React.useState<string | null>(null);

  const quad = object.perspectivePoints;
  const centre = quad ? quadCentre(quad) : object.position;

  /* ----------------------------- resizing ----------------------------- */

  const resize = React.useRef<{
    handle: HandleId;
    pointerId: number;
    /** The corner diagonally opposite, which stays put. */
    anchor: ScenePoint;
    aspect: number;
    /** Shift held: stretch freely instead of keeping the proportion. */
    freeAspect: boolean;
    frameId: number | null;
    latest: ScenePoint | null;
  } | null>(null);

  const flushResize = React.useCallback(() => {
    const current = resize.current;
    if (!current?.latest) return;
    current.frameId = null;

    const { anchor, aspect } = current;
    let width = Math.abs(current.latest.x - anchor.x);
    let height = Math.abs(current.latest.y - anchor.y);

    /*
     * Aspect is locked by default. A television stretched to 21:9 is not a
     * different television, it is a mistake — and the one time someone
     * genuinely wants a free stretch (a custom photo of a rug) they hold
     * shift, the same as everywhere else.
     */
    if (!current.freeAspect) {
      // Drive from whichever axis moved further, so it follows the pointer.
      if (width / Math.max(1e-6, aspect) > height) height = width * aspect;
      else width = height / Math.max(1e-6, aspect);
    }

    width = Math.max(0.01, Math.min(1.8, width));
    height = Math.max(0.01, Math.min(1.8, height));

    const x = current.latest.x >= anchor.x ? anchor.x + width / 2 : anchor.x - width / 2;
    const y = current.latest.y >= anchor.y ? anchor.y + height / 2 : anchor.y - height / 2;

    dispatch({
      type: "UPDATE_OBJECT",
      id: object.id,
      patch: { width, height, position: { x, y } },
    });
  }, [dispatch, object.id]);

  const beginResize = (handle: HandleId) => (event: React.PointerEvent<HTMLElement>) => {
    if (!stage || object.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const corner = CORNERS.find((entry) => entry.id === handle)!;
    // The opposite corner is the anchor: dragging the north-west handle
    // should pin the south-east one, which is what "resize from a corner"
    // means to everyone who has used a drawing tool.
    const anchor = {
      x: object.position.x + (corner.x === 0 ? object.width / 2 : -object.width / 2),
      y: object.position.y + (corner.y === 0 ? object.height / 2 : -object.height / 2),
    };

    resize.current = {
      handle,
      pointerId: event.pointerId,
      anchor,
      aspect: object.height / Math.max(1e-6, object.width),
      freeAspect: event.shiftKey,
      frameId: null,
      latest: null,
    };
    dispatch({ type: "BEGIN_GESTURE" });
  };

  const onResizeMove = (event: React.PointerEvent<HTMLElement>) => {
    const current = resize.current;
    if (!current || !stage || event.pointerId !== current.pointerId) return;
    current.freeAspect = event.shiftKey;
    current.latest = toNormalised(stage, event.clientX, event.clientY);
    if (current.frameId === null) current.frameId = requestAnimationFrame(flushResize);
  };

  const endResize = () => {
    const current = resize.current;
    if (!current) return;
    if (current.frameId !== null) cancelAnimationFrame(current.frameId);
    resize.current = null;
    dispatch({ type: "END_GESTURE" });
  };

  /* ----------------------------- rotating ----------------------------- */

  const rotate = React.useRef<{ pointerId: number; startAngle: number; start: number } | null>(
    null,
  );

  const angleTo = (point: ScenePoint) =>
    (Math.atan2(point.y - object.position.y, point.x - object.position.x) * 180) / Math.PI;

  const beginRotate = (event: React.PointerEvent<HTMLElement>) => {
    if (!stage || object.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    rotate.current = {
      pointerId: event.pointerId,
      startAngle: angleTo(toNormalised(stage, event.clientX, event.clientY)),
      start: object.rotation,
    };
    dispatch({ type: "BEGIN_GESTURE" });
  };

  const onRotateMove = (event: React.PointerEvent<HTMLElement>) => {
    const current = rotate.current;
    if (!current || !stage || event.pointerId !== current.pointerId) return;
    const delta = angleTo(toNormalised(stage, event.clientX, event.clientY)) - current.startAngle;
    let next = current.start + delta;
    // Snap to the straight angles, which is what people are aiming for
    // whenever they rotate something in a room.
    for (const step of [-180, -90, 0, 90, 180]) {
      if (Math.abs(next - step) < 4) next = step;
    }
    dispatch({ type: "UPDATE_OBJECT", id: object.id, patch: { rotation: next } });
  };

  const endRotate = () => {
    if (!rotate.current) return;
    rotate.current = null;
    dispatch({ type: "END_GESTURE" });
  };

  /* --------------------------- perspective ---------------------------- */

  const corner = React.useRef<{ index: number; pointerId: number } | null>(null);

  const beginCorner = (index: number) => (event: React.PointerEvent<HTMLElement>) => {
    if (!stage || object.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    corner.current = { index, pointerId: event.pointerId };
    dispatch({ type: "BEGIN_GESTURE" });
  };

  const onCornerMove = (event: React.PointerEvent<HTMLElement>) => {
    const current = corner.current;
    if (!current || !stage || !quad || event.pointerId !== current.pointerId) return;
    const point = toNormalised(stage, event.clientX, event.clientY);
    const next = quad.map((existing, index) =>
      index === current.index ? point : existing,
    ) as PerspectiveQuad;
    dispatch({ type: "UPDATE_OBJECT", id: object.id, patch: { perspectivePoints: next } });
  };

  const endCorner = () => {
    if (!corner.current) return;
    corner.current = null;
    dispatch({ type: "END_GESTURE" });
  };

  /* ------------------------------ actions ----------------------------- */

  const size = realFromSize(object.width, object.height, frame);

  const applyFit = () => {
    const result = fitToSurface(object, surface);
    if (result.ok) {
      dispatch({
        type: "UPDATE_OBJECT",
        id: object.id,
        patch: { perspectivePoints: result.quad },
      });
      onRequestPerspective(true);
      setFitMessage(null);
      return;
    }
    /*
     * No silent failure and no invented plane. The brief is explicit: where
     * there is not enough information for a reliable perspective, say so and
     * let the customer place the corners.
     */
    setFitMessage(
      result.reason === "NO_SURFACE"
        ? "אין משטח מסומן. סמנו קיר או רצפה, או גררו את הפינות ידנית."
        : "צורת המשטח לא מספיקה לחישוב פרספקטיבה מדויקת. גררו את ארבע הפינות ידנית.",
    );
    // Still give them the corners to drag — refusing to compute is not a
    // reason to refuse the tool.
    dispatch({
      type: "UPDATE_OBJECT",
      id: object.id,
      patch: { perspectivePoints: quadFromRect(object) },
    });
    onRequestPerspective(true);
  };

  const box = quad
    ? null
    : {
        left: `${(object.position.x - object.width / 2) * 100}%`,
        top: `${(object.position.y - object.height / 2) * 100}%`,
        width: `${object.width * 100}%`,
        height: `${object.height * 100}%`,
        transform: `rotate(${object.rotation}deg)`,
      };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[500]"
      onPointerMove={(event) => {
        onResizeMove(event);
        onRotateMove(event);
        onCornerMove(event);
      }}
      onPointerUp={() => {
        endResize();
        endRotate();
        endCorner();
      }}
      onPointerCancel={() => {
        endResize();
        endRotate();
        endCorner();
      }}
    >
      {/* The frame itself. */}
      {box ? (
        <div
          aria-hidden
          className="absolute border border-dashed border-[#f2c185]"
          style={box}
        />
      ) : null}

      {/* Corner handles: resize when upright, perspective when fitted. */}
      {!object.locked
        ? (quad
            ? quad.map((point, index) => (
                <Handle
                  key={`corner-${index}`}
                  x={point.x}
                  y={point.y}
                  cursor="move"
                  label={`פינה ${index + 1}`}
                  onPointerDown={beginCorner(index)}
                />
              ))
            : CORNERS.map((entry) => (
                <Handle
                  key={entry.id}
                  x={object.position.x + (entry.x - 0.5) * object.width}
                  y={object.position.y + (entry.y - 0.5) * object.height}
                  cursor={entry.cursor}
                  label="שינוי גודל"
                  onPointerDown={beginResize(entry.id)}
                />
              )))
        : null}

      {/* Rotation, above the object, only when it is not perspective-fitted. */}
      {!object.locked && !quad ? (
        <Handle
          x={object.position.x}
          y={object.position.y - object.height / 2 - 0.05}
          cursor="grab"
          label="סיבוב"
          onPointerDown={beginRotate}
          icon={<RotateCw className="size-3" />}
        />
      ) : null}

      {/* The toolbar. */}
      <div
        className="pointer-events-auto absolute flex -translate-x-1/2 flex-wrap items-center gap-0.5 rounded-sm border border-studio-line bg-studio/90 p-1 backdrop-blur-sm"
        style={{
          left: `${centre.x * 100}%`,
          top: `calc(${(centre.y + object.height / 2) * 100}% + 0.75rem)`,
        }}
      >
        <span className="num px-1.5 text-[0.625rem] text-studio-ink/70">
          {size.widthCm}×{size.heightCm} ס״מ
        </span>
        <IconButton
          size="iconSm"
          variant="studioOutline"
          label={object.locked ? "ביטול נעילה" : "נעילה"}
          aria-pressed={object.locked}
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
          label="היפוך אופקי"
          disabled={object.locked}
          onClick={() =>
            dispatch({ type: "UPDATE_OBJECT", id: object.id, patch: { flipX: !object.flipX } })
          }
        >
          <FlipHorizontal />
        </IconButton>
        <IconButton
          size="iconSm"
          variant="studioOutline"
          label="התאמה לפרספקטיבה"
          aria-pressed={perspectiveMode}
          disabled={object.locked}
          onClick={() => {
            if (quad) {
              dispatch({
                type: "UPDATE_OBJECT",
                id: object.id,
                patch: { perspectivePoints: null },
              });
              onRequestPerspective(false);
              setFitMessage(null);
            } else {
              applyFit();
            }
          }}
        >
          <Frame />
        </IconButton>
        <IconButton
          size="iconSm"
          variant="studioOutline"
          label="הבאה קדימה"
          disabled={object.locked}
          onClick={() => dispatch({ type: "REORDER_OBJECT", id: object.id, direction: "UP" })}
        >
          <ChevronsUp />
        </IconButton>
        <IconButton
          size="iconSm"
          variant="studioOutline"
          label="שליחה אחורה"
          disabled={object.locked}
          onClick={() => dispatch({ type: "REORDER_OBJECT", id: object.id, direction: "DOWN" })}
        >
          <ChevronsDown />
        </IconButton>
        <IconButton
          size="iconSm"
          variant="studioOutline"
          label="שכפול"
          onClick={() =>
            dispatch({ type: "DUPLICATE_OBJECT", id: object.id, newId: createId("obj") })
          }
        >
          <Copy />
        </IconButton>
        <IconButton
          size="iconSm"
          variant="studioOutline"
          label="מחיקה"
          className="text-danger"
          disabled={object.locked}
          onClick={() => dispatch({ type: "REMOVE_OBJECT", id: object.id })}
        >
          <Trash2 />
        </IconButton>
      </div>

      {fitMessage ? (
        <p
          role="status"
          className="pointer-events-auto absolute max-w-[18rem] -translate-x-1/2 rounded-sm bg-studio/92 px-2.5 py-1.5 text-[0.6875rem] leading-relaxed text-studio-ink backdrop-blur-sm"
          style={{
            left: `${centre.x * 100}%`,
            top: `calc(${(centre.y + object.height / 2) * 100}% + 3.5rem)`,
          }}
        >
          {fitMessage}
        </p>
      ) : null}
    </div>
  );
}

function Handle({
  x,
  y,
  cursor,
  label,
  onPointerDown,
  icon,
}: {
  x: number;
  y: number;
  cursor: string;
  label: string;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      className="tap-target pointer-events-auto absolute flex size-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-studio bg-[#f2c185] text-studio shadow-subtle focus-ring-invert"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, cursor, touchAction: "none" }}
    >
      {icon}
    </button>
  );
}
