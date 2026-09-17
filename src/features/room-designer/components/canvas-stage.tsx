"use client";

import * as React from "react";
import { Check, Eraser, Loader2, Pencil, Redo2, Trash2 } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BeforeAfterSlider } from "@/components/before-after-slider";
import type { NormPoint, SurfaceKind } from "@/types/design";
import type { DesignerController } from "../hooks/use-designer";

type MaskMode = "off" | "surface" | "hole";

/**
 * The photo, the render, the mask editor and the before/after comparison all
 * live in one stage so the customer never loses their place in the room.
 */
export function CanvasStage({
  controller,
  compare,
  onCompareChange,
}: {
  controller: DesignerController;
  compare: boolean;
  onCompareChange: (value: boolean) => void;
}) {
  const { image, canvasRef, activeKind, rendering } = controller;
  const [mode, setMode] = React.useState<MaskMode>("off");
  const [draft, setDraft] = React.useState<NormPoint[]>([]);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // Switching surface abandons an in-progress outline. Adjusted during render
  // (the documented pattern) rather than in an effect.
  const [lastKind, setLastKind] = React.useState(activeKind);
  if (activeKind !== lastKind) {
    setLastKind(activeKind);
    setMode("off");
    setDraft([]);
  }

  if (!image) return null;

  const addPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode === "off") return;
    const element = wrapperRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setDraft((current) => [
      ...current,
      { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) },
    ]);
  };

  const finish = () => {
    if (draft.length >= 3) {
      if (mode === "hole") controller.addHoleToActiveSurface(draft);
      else controller.commitManualMask(activeKind as SurfaceKind, draft);
    }
    setDraft([]);
    setMode("off");
  };

  const aspect = image.width / image.height;

  return (
    <div className="relative w-full">
      <div
        ref={wrapperRef}
        onPointerDown={addPoint}
        className={cn(
          "relative mx-auto w-full overflow-hidden rounded-sm bg-studio-2",
          mode !== "off" && "cursor-crosshair",
        )}
        style={{ aspectRatio: String(aspect), maxHeight: "calc(100dvh - 22rem)" }}
      >
        {compare ? (
          <BeforeAfterSlider
            theme="studio"
            className="absolute inset-0 size-full"
            before={
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.url}
                alt={t.designer.before}
                className="size-full object-cover"
              />
            }
            after={<CanvasLayer canvasRef={canvasRef} />}
          />
        ) : (
          <CanvasLayer canvasRef={canvasRef} />
        )}

        {/* mask drafting overlay */}
        {mode !== "off" ? (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full"
          >
            {draft.length > 1 ? (
              <polygon
                points={draft.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                fill="rgba(140,106,67,0.28)"
                stroke="#f2efe9"
                strokeWidth="0.35"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {draft.map((point, index) => (
              <circle
                key={`${point.x}-${point.y}-${index}`}
                cx={point.x * 100}
                cy={point.y * 100}
                r="0.9"
                fill="#f2efe9"
              />
            ))}
          </svg>
        ) : null}

        {rendering ? (
          <span className="pointer-events-none absolute end-3 top-3 inline-flex items-center gap-2 rounded-xs bg-studio/80 px-2.5 py-1.5 text-xs text-studio-ink backdrop-blur-sm">
            <Loader2 className="size-3.5 animate-spin" />
            {t.states.aiProcessing}
          </span>
        ) : null}
      </div>

      {/* stage actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {mode === "off" ? (
          <>
            <Button
              size="sm"
              variant={compare ? "studio" : "studioOutline"}
              onClick={() => onCompareChange(!compare)}
            >
              {t.designer.beforeAfter}
            </Button>
            <Button
              size="sm"
              variant="studioOutline"
              onClick={() => {
                setMode("surface");
                setDraft([]);
                onCompareChange(false);
              }}
            >
              <Pencil />
              {activeKind === "WALL" ? t.designer.maskWall : t.designer.maskFloor}
            </Button>
            {controller.activeSurface ? (
              <Button
                size="sm"
                variant="studioOutline"
                onClick={() => {
                  setMode("hole");
                  setDraft([]);
                  onCompareChange(false);
                }}
              >
                <Eraser />
                {t.designer.maskExclude}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <p className="me-auto text-xs text-studio-ink/60">
              {t.designer.editMaskHint}
            </p>
            <Button
              size="sm"
              variant="studioOutline"
              onClick={() => setDraft((current) => current.slice(0, -1))}
              disabled={!draft.length}
            >
              <Redo2 />
              {t.designer.maskUndo}
            </Button>
            <Button
              size="sm"
              variant="studioOutline"
              onClick={() => setDraft([])}
              disabled={!draft.length}
            >
              <Trash2 />
              {t.designer.maskClear}
            </Button>
            <Button
              size="sm"
              variant="studio"
              onClick={finish}
              disabled={draft.length < 3}
            >
              <Check />
              {t.designer.maskDone}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function CanvasLayer({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 size-full object-cover"
      aria-label={t.designer.title}
    />
  );
}
