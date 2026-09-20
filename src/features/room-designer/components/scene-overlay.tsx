"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { RoomSurfaceMask } from "@/types/design";
import type {
  DesignScene,
  LedPath,
  LedPathShape,
  LightingFixture,
  SceneObject,
  ScenePoint,
} from "@/types/scene";
import { fixtureStyle, objectShadowFilter, pathD, pathStrokes } from "../scene/lighting";
import { quadToMatrix3d } from "../scene/perspective";
import { snapObject, type Guide } from "../scene/snapping";
import { createPath, frameAround, type PhotoFrame } from "../scene/factory";
import type { SceneController } from "../scene/use-scene";
import { ObjectControls } from "./object-controls";

/**
 * Everything above the cladding.
 *
 * The per-pixel renderer paints the photo and the surfaces onto a canvas.
 * This is the rest of the stack — hidden light, objects, front light, guides
 * and handles — as DOM and SVG on top of it.
 *
 * That split is the whole performance design. Dragging a television moves one
 * element's `transform`, which the compositor handles without the main thread
 * and without the renderer running at all. Doing the same work per pixel
 * would mean re-rasterising the room sixty times a second to move a
 * rectangle.
 *
 * The layer order is fixed and comes from `SCENE_LAYERS`. Light behind an
 * object has to be drawn behind it; the alternative is a picture of a room
 * that cannot exist.
 */

/** Client coordinates to 0..1 of the stage. */
function toNormalised(element: HTMLElement, clientX: number, clientY: number): ScenePoint {
  const rect = element.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / Math.max(1, rect.width),
    y: (clientY - rect.top) / Math.max(1, rect.height),
  };
}

/* ------------------------------------------------------------------ *
 * Lights
 * ------------------------------------------------------------------ */

function FixtureView({
  fixture,
  stageWidth,
  attachedTo,
}: {
  fixture: LightingFixture;
  stageWidth: number;
  /** When a light follows an object, the object decides where it is. */
  attachedTo?: SceneObject | null;
}) {
  const position = attachedTo ? attachedTo.position : fixture.position;
  const width = attachedTo ? Math.max(fixture.width, attachedTo.width * 1.06) : fixture.width;
  const height = attachedTo
    ? Math.max(fixture.height, attachedTo.height * 1.06)
    : fixture.height;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: `${(position.x - width / 2) * 100}%`,
        top: `${(position.y - height / 2) * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
        ...fixtureStyle(fixture, stageWidth),
      }}
    />
  );
}

function LedPathView({
  path,
  stageWidth,
}: {
  path: LedPath;
  stageWidth: number;
}) {
  const d = pathD(path);
  if (!d || !path.enabled) return null;
  const { core, halo } = pathStrokes(path, stageWidth);

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
      style={{ mixBlendMode: "screen", overflow: "visible" }}
    >
      {/*
        Two strokes. The halo is the light the strip throws; the core is the
        strip itself. `vectorEffect` keeps both at their intended pixel width
        rather than being stretched by the non-uniform viewBox.
      */}
      <path
        d={d}
        fill="none"
        stroke={halo.stroke}
        strokeWidth={halo.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={{ filter: halo.filter }}
      />
      <path
        d={d}
        fill="none"
        stroke={core.stroke}
        strokeWidth={core.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function LightLayer({
  scene,
  placement,
  stageWidth,
}: {
  scene: DesignScene;
  placement: "HIDDEN" | "FRONT";
  stageWidth: number;
}) {
  const objects = new Map(scene.objects.map((object) => [object.id, object]));
  const hidden = scene.layers.hidden;
  if (hidden.includes(placement === "HIDDEN" ? "backLight" : "frontLight")) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {scene.lightingFixtures
        .filter((fixture) => fixture.placement === placement && fixture.enabled)
        .sort((a, b) => a.layerIndex - b.layerIndex)
        .map((fixture) => (
          <FixtureView
            key={fixture.id}
            fixture={fixture}
            stageWidth={stageWidth}
            attachedTo={
              fixture.attachedToObjectId
                ? objects.get(fixture.attachedToObjectId)
                : null
            }
          />
        ))}
      {scene.ledPaths
        .filter((path) => path.placement === placement)
        .sort((a, b) => a.layerIndex - b.layerIndex)
        .map((path) => (
          <LedPathView key={path.id} path={path} stageWidth={stageWidth} />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Objects
 * ------------------------------------------------------------------ */

function ObjectView({
  object,
  selected,
  hasHiddenLight,
  stageWidth,
  stageHeight,
  onPointerDown,
  onSelect,
}: {
  object: SceneObject;
  selected: boolean;
  hasHiddenLight: boolean;
  stageWidth: number;
  stageHeight: number;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onSelect: () => void;
}) {
  if (!object.visible) return null;

  const filter = objectShadowFilter(hasHiddenLight);

  /*
   * A fitted object is laid onto the whole stage and warped by a matrix3d,
   * because a projective transform needs the element's own box to be the
   * thing being mapped. An unfitted one is positioned and rotated normally,
   * which is cheaper and is the overwhelmingly common case.
   */
  if (object.perspectivePoints) {
    const quad = object.perspectivePoints.map((point) => ({
      x: point.x * stageWidth,
      y: point.y * stageHeight,
    }));
    const matrix = quadToMatrix3d(quad, stageWidth, stageHeight);
    if (matrix) {
      return (
        <button
          type="button"
          data-scene-object={object.id}
          aria-label={object.label}
          aria-pressed={selected}
          onPointerDown={onPointerDown}
          onFocus={onSelect}
          className="absolute inset-0 cursor-move touch-none appearance-none border-0 bg-transparent p-0"
          style={{
            transformOrigin: "0 0",
            transform: matrix,
            opacity: object.opacity,
            zIndex: object.layerIndex,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={object.assetUrl}
            alt=""
            draggable={false}
            className="size-full select-none object-fill"
            style={{ filter, transform: object.flipX ? "scaleX(-1)" : undefined }}
          />
        </button>
      );
    }
  }

  return (
    <button
      type="button"
      data-scene-object={object.id}
      aria-label={object.label}
      aria-pressed={selected}
      onPointerDown={onPointerDown}
      onFocus={onSelect}
      className="absolute cursor-move touch-none appearance-none border-0 bg-transparent p-0"
      style={{
        left: `${(object.position.x - object.width / 2) * 100}%`,
        top: `${(object.position.y - object.height / 2) * 100}%`,
        width: `${object.width * 100}%`,
        height: `${object.height * 100}%`,
        transform: `rotate(${object.rotation}deg)${object.flipX ? " scaleX(-1)" : ""}`,
        opacity: object.opacity,
        zIndex: object.layerIndex,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={object.assetUrl}
        alt=""
        draggable={false}
        className="size-full select-none object-fill"
        style={{ filter }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Guides
 * ------------------------------------------------------------------ */

function GuideLayer({ guides }: { guides: Guide[] }) {
  if (!guides.length) return null;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      {guides.map((guide, index) => {
        const isX = guide.axis === "x";
        return (
          <line
            key={`${guide.axis}-${guide.value}-${index}`}
            x1={isX ? guide.value * 100 : guide.from * 100}
            y1={isX ? guide.from * 100 : guide.value * 100}
            x2={isX ? guide.value * 100 : guide.to * 100}
            y2={isX ? guide.to * 100 : guide.value * 100}
            stroke="#f2c185"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

function GuideLabels({ guides }: { guides: Guide[] }) {
  const labelled = guides.filter((guide) => guide.label);
  if (!labelled.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0" aria-live="polite">
      {labelled.map((guide, index) => (
        <span
          key={`${guide.kind}-${index}`}
          className="num absolute -translate-x-1/2 rounded-xs bg-studio/85 px-1.5 py-0.5 text-[0.625rem] text-studio-ink backdrop-blur-sm"
          style={
            guide.axis === "x"
              ? { left: `${guide.value * 100}%`, top: `${guide.from * 100}%` }
              : { left: `${((guide.from + guide.to) / 2) * 100}%`, top: `${guide.value * 100}%` }
          }
        >
          {guide.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The overlay
 * ------------------------------------------------------------------ */

export interface SceneOverlayProps {
  controller: SceneController;
  /** The wall or floor the active surface is, for magnets. */
  surface: RoomSurfaceMask | null;
  floor: RoomSurfaceMask | null;
  frame: PhotoFrame;
  /** The LED shape being drawn, if the lighting tool is armed. */
  drawingShape?: LedPathShape | null;
  onFinishDrawing?: () => void;
  /** Editing off — the customer is looking, not arranging. */
  readOnly?: boolean;
  className?: string;
}

export function SceneOverlay({
  controller,
  surface,
  floor,
  frame,
  drawingShape = null,
  onFinishDrawing,
  readOnly = false,
  className,
}: SceneOverlayProps) {
  const { scene, selectedId, selectedObject, orderedObjects, dispatch } = controller;
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [stage, setStage] = React.useState<HTMLDivElement | null>(null);
  const [guides, setGuides] = React.useState<Guide[]>([]);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [perspectiveMode, setPerspectiveMode] = React.useState(false);
  const [draft, setDraft] = React.useState<ScenePoint[]>([]);

  // Arming a different shape abandons a half-drawn run rather than mixing the
  // two. Adjusted during render, the documented pattern, not in an effect.
  const [lastShape, setLastShape] = React.useState(drawingShape);
  if (drawingShape !== lastShape) {
    setLastShape(drawingShape);
    setDraft([]);
  }

  const roomWidthM = frame.roomWidthM;
  const photoAspect = frame.width / Math.max(1, frame.height);

  /*
   * The stage's pixel size feeds every blur radius and stroke width, so they
   * scale with the view instead of being fixed pixels that look right at one
   * size only. Measured rather than assumed, because the stage is fluid.
   */
  React.useEffect(() => {
    const element = stageRef.current;
    setStage(element);
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Which objects have hidden light behind them, for the shadow. */
  const litFromBehind = React.useMemo(() => {
    const ids = new Set<string>();
    for (const fixture of scene.lightingFixtures) {
      if (fixture.placement === "HIDDEN" && fixture.enabled && fixture.attachedToObjectId) {
        ids.add(fixture.attachedToObjectId);
      }
    }
    for (const path of scene.ledPaths) {
      if (path.placement === "HIDDEN" && path.enabled && path.attachedToObjectId) {
        ids.add(path.attachedToObjectId);
      }
    }
    return ids;
  }, [scene.ledPaths, scene.lightingFixtures]);

  /*
   * A drag, coalesced into animation frames.
   *
   * Pointer events fire faster than the screen refreshes — on a 120Hz
   * trackpad, considerably faster — and dispatching every one of them means
   * doing the same work twice and dropping frames for it. The latest
   * position is kept in a ref and flushed once per frame.
   */
  const drag = React.useRef<{
    id: string;
    pointerId: number;
    grabOffset: ScenePoint;
    frame: number | null;
    latest: ScenePoint | null;
  } | null>(null);

  const flush = React.useCallback(() => {
    const current = drag.current;
    if (!current?.latest) return;
    current.frame = null;

    const object = scene.objects.find((entry) => entry.id === current.id);
    if (!object) return;

    const candidate = {
      x: current.latest.x - current.grabOffset.x,
      y: current.latest.y - current.grabOffset.y,
    };

    const snapped = snapObject({
      moving: object,
      candidate,
      others: scene.objects,
      surface,
      floor,
      // A magnet should feel the same distance on screen at any zoom, so the
      // threshold is a fraction of the stage rather than of the photo.
      threshold: 0.012,
      roomWidthM,
      photoAspect,
    });

    setGuides(snapped.guides);
    dispatch({ type: "UPDATE_OBJECT", id: current.id, patch: { position: snapped.position } });
  }, [dispatch, floor, photoAspect, roomWidthM, scene.objects, surface]);

  const beginDrag = React.useCallback(
    (object: SceneObject) => (event: React.PointerEvent<HTMLElement>) => {
      if (readOnly || object.locked) {
        dispatch({ type: "SELECT", ids: [object.id] });
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const point = toNormalised(stage, event.clientX, event.clientY);
      drag.current = {
        id: object.id,
        pointerId: event.pointerId,
        // Grab offset, so the object does not jump its centre to the cursor.
        grabOffset: {
          x: point.x - object.position.x,
          y: point.y - object.position.y,
        },
        frame: null,
        latest: null,
      };
      dispatch({ type: "SELECT", ids: [object.id] });
      dispatch({ type: "BEGIN_GESTURE" });
    },
    [dispatch, readOnly],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = drag.current;
      const stage = stageRef.current;
      if (!current || !stage || event.pointerId !== current.pointerId) return;
      current.latest = toNormalised(stage, event.clientX, event.clientY);
      if (current.frame === null) {
        current.frame = requestAnimationFrame(flush);
      }
    },
    [flush],
  );

  const endDrag = React.useCallback(() => {
    const current = drag.current;
    if (!current) return;
    if (current.frame !== null) cancelAnimationFrame(current.frame);
    drag.current = null;
    setGuides([]);
    dispatch({ type: "END_GESTURE" });
  }, [dispatch]);

  React.useEffect(
    () => () => {
      const current = drag.current;
      if (current?.frame !== null && current?.frame !== undefined) {
        cancelAnimationFrame(current.frame);
      }
    },
    [],
  );

  /*
   * How a drawn run is built.
   *
   * Every shape is the same tool with a different number of points, which is
   * why there is one code path and not seven. A rectangle is two opposite
   * corners expanded into four; a television frame needs no points at all,
   * because the screen already has four.
   */
  const POINTS_NEEDED: Record<LedPathShape, number> = {
    LINE: 2,
    L_SHAPE: 3,
    RECTANGLE: 2,
    TV_FRAME: 0,
    VERTICAL_SEAM: 2,
    NICHE_RUN: 2,
    FREE: Infinity,
  };

  const commitPath = React.useCallback(
    (shape: LedPathShape, points: ScenePoint[]) => {
      if (shape === "TV_FRAME") {
        const screen = [...scene.objects]
          .reverse()
          .find((object) => object.type === "TV" || object.type === "TV_WALL");
        if (!screen) return false;
        dispatch({
          type: "ADD_PATH",
          path: createPath({
            shape,
            points: frameAround(screen),
            scene,
            surfaceId: screen.surfaceId,
            attachedToObjectId: screen.id,
            closed: true,
          }),
        });
        return true;
      }

      if (shape === "RECTANGLE") {
        const [a, b] = points;
        if (!a || !b) return false;
        dispatch({
          type: "ADD_PATH",
          path: createPath({
            shape,
            points: [
              { x: a.x, y: a.y },
              { x: b.x, y: a.y },
              { x: b.x, y: b.y },
              { x: a.x, y: b.y },
            ],
            scene,
            surfaceId: surface?.id ?? null,
            closed: true,
          }),
        });
        return true;
      }

      if (points.length < 2) return false;
      dispatch({
        type: "ADD_PATH",
        path: createPath({
          shape,
          points,
          scene,
          surfaceId: surface?.id ?? null,
        }),
      });
      return true;
    },
    [dispatch, scene, surface],
  );

  const addDraftPoint = React.useCallback(
    (point: ScenePoint) => {
      if (!drawingShape) return;
      const needed = POINTS_NEEDED[drawingShape];
      const next = [...draft, point];
      setDraft(next);
      if (next.length >= needed) {
        if (commitPath(drawingShape, next)) {
          setDraft([]);
          onFinishDrawing?.();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitPath, draft, drawingShape, onFinishDrawing],
  );

  // A TV frame needs no clicks: arming it is the whole instruction.
  React.useEffect(() => {
    if (drawingShape !== "TV_FRAME") return;
    if (commitPath("TV_FRAME", [])) onFinishDrawing?.();
  }, [commitPath, drawingShape, onFinishDrawing]);

  const hiddenLayers = scene.layers.hidden;

  return (
    <div
      ref={stageRef}
      data-scene-overlay
      className={cn("absolute inset-0", className)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={(event) => {
        if (drawingShape) {
          const stageElement = stageRef.current;
          if (stageElement) {
            addDraftPoint(toNormalised(stageElement, event.clientX, event.clientY));
          }
          return;
        }
        // A press on bare photo clears the selection, which is how every
        // editor behaves and how people expect to dismiss the handles.
        if (event.target === event.currentTarget) dispatch({ type: "SELECT", ids: [] });
      }}
      style={drawingShape ? { cursor: "crosshair" } : undefined}
    >
      <LightLayer scene={scene} placement="HIDDEN" stageWidth={size.width} />

      {!hiddenLayers.includes("objects") ? (
        <div className="absolute inset-0">
          {orderedObjects.map((object) => (
            <ObjectView
              key={object.id}
              object={object}
              selected={object.id === selectedId}
              hasHiddenLight={litFromBehind.has(object.id)}
              stageWidth={size.width}
              stageHeight={size.height}
              onPointerDown={beginDrag(object)}
              onSelect={() => dispatch({ type: "SELECT", ids: [object.id] })}
            />
          ))}
        </div>
      ) : null}

      <LightLayer scene={scene} placement="FRONT" stageWidth={size.width} />

      <GuideLayer guides={guides} />
      <GuideLabels guides={guides} />

      {drawingShape && draft.length ? (
        <>
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
          >
            <polyline
              points={draft.map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
              fill="none"
              stroke="#f2c185"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              vectorEffect="non-scaling-stroke"
            />
            {draft.map((point, index) => (
              <circle
                key={index}
                cx={point.x * 100}
                cy={point.y * 100}
                r={1}
                fill="#f2c185"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {drawingShape === "FREE" ? (
            <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2">
              <button
                type="button"
                data-testid="finish-led"
                onClick={() => {
                  if (commitPath("FREE", draft)) {
                    setDraft([]);
                    onFinishDrawing?.();
                  }
                }}
                disabled={draft.length < 2}
                className="press rounded-sm bg-[#f2c185] px-4 py-2 text-xs font-medium text-studio disabled:opacity-40"
              >
                סיום המסלול
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {selectedObject && !readOnly ? (
        <ObjectControls
          controller={controller}
          object={selectedObject}
          stage={stage}
          surface={surface}
          frame={frame}
          perspectiveMode={perspectiveMode}
          onRequestPerspective={setPerspectiveMode}
        />
      ) : null}
    </div>
  );
}
