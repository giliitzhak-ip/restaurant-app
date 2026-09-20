"use client";

import * as React from "react";
import { Lightbulb, PenLine, Trash2 } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type {
  LedPath,
  LedPathShape,
  LightingFixture,
  LightingFixtureType,
} from "@/types/scene";
import { kelvinToHex, lightColor } from "../scene/lighting";
import type { SceneController } from "../scene/use-scene";

/**
 * Lighting.
 *
 * Twelve fixtures to drop in, seven shapes of run to draw, and — for whatever
 * is selected — the controls that make it look like the thing in the showroom
 * rather than a generic glow.
 *
 * RGB is a mode rather than a category, and it is off unless asked for. A
 * customer choosing oak cladding is not asking for a colour-cycling wall, and
 * offering it first makes the whole feature look like a toy.
 */

const FIXTURES: { type: LightingFixtureType; label: string }[] = [
  { type: "LED_BEHIND_TV", label: "מאחורי טלוויזיה" },
  { type: "LED_UNDER_SIDEBOARD", label: "מתחת למזנון" },
  { type: "LED_IN_NICHE", label: "בתוך נישה" },
  { type: "LED_BETWEEN_PANELS", label: "בין לוחות חיפוי" },
  { type: "LED_PERIMETER", label: "היקפי מסביב לקיר" },
  { type: "CEILING_COVE", label: "נסתרת בתקרה" },
  { type: "SPOTLIGHT", label: "ספוטים" },
  { type: "WALL_LAMP", label: "מנורת קיר" },
  { type: "WALL_WASH_UP", label: "מלמטה למעלה" },
  { type: "WALL_WASH_DOWN", label: "מלמעלה למטה" },
  { type: "SHELF_LIGHT", label: "בתוך מדפים" },
  { type: "RECESSED_PROFILE", label: "פרופיל שקוע בחיפוי" },
];

const SHAPES: { shape: LedPathShape; label: string; hint: string }[] = [
  { shape: "LINE", label: "קו ישר", hint: "שתי נקודות" },
  { shape: "L_SHAPE", label: "צורת ר׳", hint: "שלוש נקודות" },
  { shape: "RECTANGLE", label: "מסגרת מלבנית", hint: "שתי פינות" },
  { shape: "TV_FRAME", label: "מסגרת סביב הטלוויזיה", hint: "בוחר את המסך" },
  { shape: "VERTICAL_SEAM", label: "פס אנכי בין חיפויים", hint: "שתי נקודות" },
  { shape: "NICHE_RUN", label: "פס בתוך נישה", hint: "שתי נקודות" },
  { shape: "FREE", label: "מסלול חופשי", hint: "כמה נקודות שצריך" },
];

/** A labelled slider with a live numeric readout, the shape used throughout. */
function Control({
  label,
  value,
  min,
  max,
  step,
  suffix,
  format,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  format?: (value: number) => string;
  onChange: (value: number) => void;
  onCommit: () => void;
}) {
  const id = React.useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="mb-1 text-[0.6875rem] text-studio-ink/70">
          {label}
        </Label>
        <span className="num text-[0.6875rem] text-studio-ink/55">
          {format ? format(value) : value.toFixed(2)}
          {suffix}
        </span>
      </div>
      <Slider
        id={id}
        theme="studio"
        thumbLabel={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next ?? value)}
        onValueCommit={onCommit}
      />
    </div>
  );
}

export function LightingDrawer({
  controller,
  drawingShape,
  onStartDrawing,
  onStopDrawing,
  onAddFixture,
  className,
}: {
  controller: SceneController;
  drawingShape: LedPathShape | null;
  onStartDrawing: (shape: LedPathShape) => void;
  onStopDrawing: () => void;
  onAddFixture: (type: LightingFixtureType) => void;
  className?: string;
}) {
  const { scene, selectedFixture, selectedPath, dispatch } = controller;
  const selected: LightingFixture | LedPath | null = selectedFixture ?? selectedPath;

  const patch = (changes: Partial<LightingFixture> & Partial<LedPath>) => {
    if (selectedFixture) {
      dispatch({ type: "UPDATE_FIXTURE", id: selectedFixture.id, patch: changes });
    } else if (selectedPath) {
      dispatch({ type: "UPDATE_PATH", id: selectedPath.id, patch: changes });
    }
  };

  /*
   * Slider drags are a gesture like any other: one undo step for the whole
   * drag, not one per pixel of travel.
   */
  const beginEdit = React.useRef(false);
  const live = (changes: Partial<LightingFixture> & Partial<LedPath>) => {
    if (!beginEdit.current) {
      dispatch({ type: "BEGIN_GESTURE" });
      beginEdit.current = true;
    }
    patch(changes);
  };
  const commit = () => {
    if (!beginEdit.current) return;
    beginEdit.current = false;
    dispatch({ type: "END_GESTURE" });
  };

  return (
    <div className={cn("flex h-full flex-col gap-4 overflow-y-auto px-1", className)}>
      {/* ------------------------------ add ------------------------------ */}
      <section>
        <h3 className="mb-2 text-[0.6875rem] tracking-[0.18em] text-studio-ink/50">
          גופי תאורה
        </h3>
        <ul className="grid grid-cols-2 gap-1.5">
          {FIXTURES.map((entry) => (
            <li key={entry.type}>
              <Button
                size="sm"
                variant="studioOutline"
                block
                className="justify-start rounded-xs text-[0.6875rem]"
                data-testid="add-fixture"
                data-fixture-type={entry.type}
                onClick={() => onAddFixture(entry.type)}
              >
                <Lightbulb />
                {entry.label}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------- draw a run -------------------------- */}
      <section>
        <h3 className="mb-2 text-[0.6875rem] tracking-[0.18em] text-studio-ink/50">
          ציור פס תאורה
        </h3>
        <ul className="space-y-1.5">
          {SHAPES.map((entry) => (
            <li key={entry.shape}>
              <Button
                size="sm"
                variant={drawingShape === entry.shape ? "studio" : "studioOutline"}
                aria-pressed={drawingShape === entry.shape}
                block
                className="justify-start rounded-xs text-[0.6875rem]"
                data-testid="draw-led"
                data-led-shape={entry.shape}
                onClick={() =>
                  drawingShape === entry.shape
                    ? onStopDrawing()
                    : onStartDrawing(entry.shape)
                }
              >
                <PenLine />
                <span className="flex-1 text-start">{entry.label}</span>
                <span className="text-[0.5625rem] opacity-60">{entry.hint}</span>
              </Button>
            </li>
          ))}
        </ul>
        {drawingShape ? (
          <p role="status" className="mt-2 text-[0.625rem] leading-relaxed text-[#f2c185]">
            סמנו נקודות על התמונה. לחיצה על ״סיום״ תיצור את הפס.
          </p>
        ) : null}
      </section>

      {/* --------------------------- the selection ------------------------ */}
      {selected ? (
        <section className="space-y-3 border-t border-studio-line pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm text-studio-ink">{selected.label}</h3>
            <div className="flex items-center gap-2">
              <Switch
                checked={selected.enabled}
                onCheckedChange={(next) => {
                  dispatch({ type: "BEGIN_GESTURE" });
                  patch({ enabled: next });
                  dispatch({ type: "END_GESTURE" });
                }}
                aria-label="הפעלה וכיבוי"
              />
              <IconButton
                size="iconSm"
                variant="studioOutline"
                label="מחיקת גוף התאורה"
                className="text-danger"
                onClick={() =>
                  selectedFixture
                    ? dispatch({ type: "REMOVE_FIXTURE", id: selectedFixture.id })
                    : selectedPath
                      ? dispatch({ type: "REMOVE_PATH", id: selectedPath.id })
                      : undefined
                }
              >
                <Trash2 />
              </IconButton>
            </div>
          </div>

          <div className="grid gap-3">
            {selectedFixture ? (
              <>
                <Control
                  label="אורך"
                  value={selectedFixture.width}
                  min={0.01}
                  max={1.5}
                  step={0.005}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(width) => live({ width })}
                  onCommit={commit}
                />
                <Control
                  label="רוחב"
                  value={selectedFixture.height}
                  min={0.005}
                  max={1.2}
                  step={0.005}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(height) => live({ height })}
                  onCommit={commit}
                />
                <Control
                  label="כיוון"
                  value={selectedFixture.direction}
                  min={-180}
                  max={180}
                  step={1}
                  suffix="°"
                  format={(v) => String(Math.round(v))}
                  onChange={(direction) => live({ direction })}
                  onCommit={commit}
                />
              </>
            ) : selectedPath ? (
              <Control
                label="עובי הפס"
                value={selectedPath.thickness}
                min={0.001}
                max={0.05}
                step={0.001}
                format={(v) => `${(v * 1000).toFixed(0)}`}
                onChange={(thickness) => live({ thickness })}
                onCommit={commit}
              />
            ) : null}

            <Control
              label="עוצמה"
              value={selected.intensity}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(intensity) => live({ intensity })}
              onCommit={commit}
            />
            <Control
              label="פיזור האור"
              value={selected.spread}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(spread) => live({ spread })}
              onCommit={commit}
            />
            <Control
              label="רכות וטשטוש"
              value={selected.blur}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(blur) => live({ blur })}
              onCommit={commit}
            />
          </div>

          {/* --------------------------- colour --------------------------- */}
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={selected.colorMode === "WHITE" ? "studio" : "studioOutline"}
                aria-pressed={selected.colorMode === "WHITE"}
                className="flex-1 rounded-xs text-[0.6875rem]"
                onClick={() => {
                  dispatch({ type: "BEGIN_GESTURE" });
                  patch({ colorMode: "WHITE" });
                  dispatch({ type: "END_GESTURE" });
                }}
              >
                אור לבן
              </Button>
              <Button
                size="sm"
                variant={selected.colorMode === "RGB" ? "studio" : "studioOutline"}
                aria-pressed={selected.colorMode === "RGB"}
                className="flex-1 rounded-xs text-[0.6875rem]"
                onClick={() => {
                  dispatch({ type: "BEGIN_GESTURE" });
                  patch({ colorMode: "RGB" });
                  dispatch({ type: "END_GESTURE" });
                }}
              >
                RGB
              </Button>
            </div>

            {selected.colorMode === "WHITE" ? (
              <>
                <Control
                  label="טמפרטורת אור"
                  value={selected.temperatureK}
                  min={2200}
                  max={6500}
                  step={50}
                  suffix="K"
                  format={(v) => String(Math.round(v))}
                  onChange={(temperatureK) => live({ temperatureK })}
                  onCommit={commit}
                />
                <div className="flex gap-1.5">
                  {[
                    { label: "חם", k: 2700 },
                    { label: "ניטרלי", k: 4000 },
                    { label: "קר", k: 6000 },
                  ].map((preset) => (
                    <Button
                      key={preset.k}
                      size="sm"
                      variant="studioOutline"
                      className="flex-1 rounded-xs text-[0.625rem]"
                      aria-pressed={Math.abs(selected.temperatureK - preset.k) < 100}
                      onClick={() => {
                        dispatch({ type: "BEGIN_GESTURE" });
                        patch({ temperatureK: preset.k });
                        dispatch({ type: "END_GESTURE" });
                      }}
                    >
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{ background: kelvinToHex(preset.k) }}
                      />
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <label className="flex items-center justify-between gap-3 text-[0.6875rem] text-studio-ink/70">
                צבע האור
                <input
                  type="color"
                  value={selected.color}
                  onChange={(event) => {
                    dispatch({ type: "BEGIN_GESTURE" });
                    patch({ color: event.target.value });
                    dispatch({ type: "END_GESTURE" });
                  }}
                  aria-label="צבע האור"
                  className="h-8 w-16 cursor-pointer rounded-xs border border-studio-line bg-transparent"
                />
              </label>
            )}

            <div
              aria-hidden
              className="h-6 rounded-xs"
              style={{
                background: `linear-gradient(90deg, transparent, ${lightColor(selected)}, transparent)`,
              }}
            />
          </div>

          {/* -------------------------- placement ------------------------- */}
          <div>
            <p className="mb-1.5 text-[0.6875rem] text-studio-ink/70">מיקום האור</p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={selected.placement === "HIDDEN" ? "studio" : "studioOutline"}
                aria-pressed={selected.placement === "HIDDEN"}
                className="flex-1 rounded-xs text-[0.6875rem]"
                onClick={() => {
                  dispatch({ type: "BEGIN_GESTURE" });
                  patch({ placement: "HIDDEN" });
                  dispatch({ type: "END_GESTURE" });
                }}
              >
                אור נסתר
              </Button>
              <Button
                size="sm"
                variant={selected.placement === "FRONT" ? "studio" : "studioOutline"}
                aria-pressed={selected.placement === "FRONT"}
                className="flex-1 rounded-xs text-[0.6875rem]"
                onClick={() => {
                  dispatch({ type: "BEGIN_GESTURE" });
                  patch({ placement: "FRONT" });
                  dispatch({ type: "END_GESTURE" });
                }}
              >
                אור קדמי
              </Button>
            </div>
            <p className="mt-1.5 text-[0.625rem] leading-relaxed text-studio-ink/45">
              אור נסתר מצויר מאחורי הריהוט ויוצר הילה; אור קדמי מצויר מעליו ונופל על מה
              שלפניו.
            </p>
          </div>
        </section>
      ) : (
        <p className="border-t border-studio-line pt-4 text-[0.6875rem] leading-relaxed text-studio-ink/45">
          בחרו גוף תאורה בתמונה כדי לשלוט בעוצמה, בצבע ובפיזור.
        </p>
      )}

      <p className="border-t border-studio-line pt-3 text-[0.625rem] leading-relaxed text-studio-ink/45">
        {t.designer.lightingDisclaimer}
      </p>

      <p className="text-[0.625rem] text-studio-ink/35">
        {scene.lightingFixtures.length + scene.ledPaths.length} גופי תאורה בעיצוב
      </p>
    </div>
  );
}
