"use client";

import * as React from "react";
import { MoveHorizontal } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Before / after comparison.
 *
 * The original room is the base layer and the redesigned one is revealed from
 * the left, so in Hebrew the "before" stays on the right where reading starts.
 * Works with images and with the room designer's canvases.
 */
export function BeforeAfterSlider({
  before,
  after,
  initial = 55,
  className,
  labels = true,
  theme = "light",
}: {
  before: React.ReactNode;
  after: React.ReactNode;
  initial?: number;
  className?: string;
  labels?: boolean;
  theme?: "light" | "studio";
}) {
  const [position, setPosition] = React.useState(initial);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);

  const updateFromClientX = React.useCallback((clientX: number) => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, ratio)));
  }, []);

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      event.preventDefault();
      updateFromClientX(event.clientX);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updateFromClientX]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative touch-pan-y select-none overflow-hidden rounded-sm",
        className,
      )}
      onPointerDown={(event) => {
        dragging.current = true;
        updateFromClientX(event.clientX);
      }}
    >
      {/* `before` is the base layer and `after` is revealed from the left, so
          in Hebrew the original room stays on the right where reading starts. */}
      <div className="absolute inset-0">{before}</div>
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        {after}
      </div>

      {labels ? (
        <>
          <span className="pointer-events-none absolute start-3 top-3 rounded-xs bg-ink/70 px-2 py-1 text-[0.6875rem] tracking-[0.12em] text-canvas backdrop-blur-sm">
            {t.designer.before}
          </span>
          <span className="pointer-events-none absolute end-3 top-3 rounded-xs bg-canvas/85 px-2 py-1 text-[0.6875rem] tracking-[0.12em] text-ink backdrop-blur-sm">
            {t.designer.after}
          </span>
        </>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 w-px",
          theme === "light" ? "bg-canvas" : "bg-studio-ink",
        )}
        style={{ left: `${position}%` }}
      />

      <div
        className="absolute inset-y-0 flex w-12 -translate-x-1/2 items-center justify-center"
        style={{ left: `${position}%` }}
      >
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(position)}
          onChange={(event) => setPosition(Number(event.target.value))}
          aria-label={t.designer.compareHint}
          className="absolute inset-0 size-full cursor-ew-resize opacity-0"
        />
        <span
          aria-hidden
          className={cn(
            "flex size-10 items-center justify-center rounded-full shadow-raised transition-transform",
            theme === "light" ? "bg-canvas text-ink" : "bg-studio-ink text-studio",
          )}
        >
          <MoveHorizontal className="size-4" />
        </span>
      </div>
    </div>
  );
}
