"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Lock,
  LockOpen,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { createId } from "@/lib/utils";
import { realFromSize, sizeFromReal, type PhotoFrame } from "../scene/factory";
import type { SceneController } from "../scene/use-scene";

/**
 * The room designer without a mouse.
 *
 * The canvas is a direct-manipulation surface: drag to move, pull a corner to
 * resize, twist a handle to rotate. None of that is available to someone using
 * a keyboard, a switch device or a screen reader, and "add keyboard shortcuts"
 * only half-solves it — a shortcut still requires knowing the object is there
 * and where it currently sits.
 *
 * So this panel is the equivalent path, not a fallback: every property that
 * can be reached by dragging has a labelled control here, in real
 * centimetres and degrees rather than in the normalised units the scene
 * stores. It is always rendered, for everyone — a keyboard path that only
 * appears in a special mode is a path nobody maintains.
 *
 * Changes are announced through a live region, because a number changing in a
 * field the user just typed into is not announced by itself, and the visible
 * result of the change is on a canvas a screen reader cannot read.
 */
export function AccessibleEditor({
  controller,
  frame,
  className,
}: {
  controller: SceneController;
  frame: PhotoFrame;
  className?: string;
}) {
  const { selectedObject, selectedFixture, dispatch } = controller;
  const [announcement, setAnnouncement] = React.useState("");
  const headingId = React.useId();

  const target = selectedObject ?? selectedFixture;

  if (!target) {
    return (
      <section aria-labelledby={headingId} className={className}>
        <h3 id={headingId} className="text-sm font-medium">
          עריכה מדויקת
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          בחרו פריט או גוף תאורה — מרשימת השכבות, או בלחיצה על הפריט בהדמיה — כדי לערוך את
          המיקום, הגודל והזווית שלו במספרים, בלי צורך בגרירה.
        </p>
      </section>
    );
  }

  const isObject = Boolean(selectedObject);
  const locked = selectedObject?.locked ?? false;

  /* Percentages of the photo: the one unit that means the same thing for an
     object and for a light, and that a person can reason about without
     knowing the photo's pixel dimensions. */
  const xPercent = Math.round(target.position.x * 1000) / 10;
  const yPercent = Math.round(target.position.y * 1000) / 10;
  const real = realFromSize(target.width, target.height, frame);
  const rotation = isObject ? (selectedObject?.rotation ?? 0) : (selectedFixture?.direction ?? 0);

  function announce(message: string) {
    setAnnouncement(`${message} · ${target!.label}`);
  }

  function move(dx: number, dy: number) {
    if (locked) return;
    const step = 0.01;
    const next = {
      x: clamp01(target!.position.x + dx * step),
      y: clamp01(target!.position.y + dy * step),
    };
    patchPosition(next);
    announce(`הוזז ל-${Math.round(next.x * 100)}% אופקית, ${Math.round(next.y * 100)}% אנכית`);
  }

  function patchPosition(position: { x: number; y: number }) {
    if (selectedObject) {
      dispatch({ type: "UPDATE_OBJECT", id: selectedObject.id, patch: { position } });
    } else if (selectedFixture) {
      dispatch({ type: "UPDATE_FIXTURE", id: selectedFixture.id, patch: { position } });
    }
  }

  function setSizeCm(widthCm: number, heightCm: number) {
    if (locked) return;
    const size = sizeFromReal(
      Math.max(5, Math.min(2000, widthCm)),
      Math.max(5, Math.min(2000, heightCm)),
      frame,
    );
    if (selectedObject) {
      dispatch({ type: "UPDATE_OBJECT", id: selectedObject.id, patch: size });
    } else if (selectedFixture) {
      dispatch({ type: "UPDATE_FIXTURE", id: selectedFixture.id, patch: size });
    }
    announce(`הגודל שונה ל-${Math.round(widthCm)} על ${Math.round(heightCm)} ס״מ`);
  }

  function scale(factor: number) {
    setSizeCm(real.widthCm * factor, real.heightCm * factor);
  }

  function setRotation(degrees: number) {
    if (locked) return;
    const normalised = ((Math.round(degrees) % 360) + 360) % 360;
    if (selectedObject) {
      dispatch({
        type: "UPDATE_OBJECT",
        id: selectedObject.id,
        patch: { rotation: normalised },
      });
    } else if (selectedFixture) {
      dispatch({
        type: "UPDATE_FIXTURE",
        id: selectedFixture.id,
        patch: { direction: normalised },
      });
    }
    announce(`הזווית שונתה ל-${normalised} מעלות`);
  }

  return (
    <section aria-labelledby={headingId} className={className}>
      <h3 id={headingId} className="text-sm font-medium">
        עריכה מדויקת — {target.label}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        אפשר להזיז בחצים, לשנות גודל וזווית בשדות המספריים, ולבצע את כל הפעולות בכפתורים.
        אין צורך בגרירה או בעכבר.
      </p>

      {locked ? (
        <p className="mt-2 rounded-xs bg-surface-3 px-2 py-1.5 text-xs text-ink-soft">
          הפריט נעול. יש לשחרר את הנעילה כדי לערוך אותו.
        </p>
      ) : null}

      {/* --- move ---------------------------------------------------- */}
      <div className="mt-4">
        <p className="text-xs font-medium text-ink-soft" id={`${headingId}-move`}>
          הזזה
        </p>
        <div
          role="group"
          aria-labelledby={`${headingId}-move`}
          className="mt-1.5 flex flex-wrap items-center gap-1.5"
        >
          {/* In an RTL layout "start" is the right of the screen, so the arrow
              that visually points right must move the object in −x. */}
          <IconButton
            label="הזזה ימינה"
            disabled={locked}
            onClick={() => move(-1, 0)}
            size="iconSm"
          >
            <ArrowRight />
          </IconButton>
          <IconButton
            label="הזזה שמאלה"
            disabled={locked}
            onClick={() => move(1, 0)}
            size="iconSm"
          >
            <ArrowLeft />
          </IconButton>
          <IconButton label="הזזה למעלה" disabled={locked} onClick={() => move(0, -1)} size="iconSm">
            <ArrowUp />
          </IconButton>
          <IconButton label="הזזה למטה" disabled={locked} onClick={() => move(0, 1)} size="iconSm">
            <ArrowDown />
          </IconButton>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="מיקום אופקי (%)" htmlFor={`${headingId}-x`}>
          <Input
            id={`${headingId}-x`}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.5}
            disabled={locked}
            value={xPercent}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              patchPosition({ x: clamp01(value / 100), y: target.position.y });
            }}
          />
        </Field>
        <Field label="מיקום אנכי (%)" htmlFor={`${headingId}-y`}>
          <Input
            id={`${headingId}-y`}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.5}
            disabled={locked}
            value={yPercent}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              patchPosition({ x: target.position.x, y: clamp01(value / 100) });
            }}
          />
        </Field>

        <Field label="רוחב (ס״מ)" htmlFor={`${headingId}-w`}>
          <Input
            id={`${headingId}-w`}
            type="number"
            inputMode="numeric"
            min={5}
            max={2000}
            step={1}
            disabled={locked}
            value={real.widthCm}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value) || value <= 0) return;
              // Aspect kept: the same rule the corner handles follow.
              const ratio = real.heightCm / Math.max(1, real.widthCm);
              setSizeCm(value, value * ratio);
            }}
          />
        </Field>
        <Field label="גובה (ס״מ)" htmlFor={`${headingId}-h`}>
          <Input
            id={`${headingId}-h`}
            type="number"
            inputMode="numeric"
            min={5}
            max={2000}
            step={1}
            disabled={locked}
            value={real.heightCm}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value) || value <= 0) return;
              setSizeCm(real.widthCm, value);
            }}
          />
        </Field>

        <Field
          label={isObject ? "זווית (מעלות)" : "כיוון האור (מעלות)"}
          htmlFor={`${headingId}-r`}
          className="col-span-2"
        >
          <Input
            id={`${headingId}-r`}
            type="number"
            inputMode="numeric"
            min={0}
            max={359}
            step={1}
            disabled={locked}
            value={Math.round(rotation)}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              setRotation(value);
            }}
          />
        </Field>
      </div>

      {/* --- size and actions ---------------------------------------- */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() => scale(1.1)}
        >
          <Plus aria-hidden />
          הגדלה
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() => scale(0.9)}
        >
          <Minus aria-hidden />
          הקטנה
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={locked}
          onClick={() => setRotation(rotation - 15)}
        >
          <RotateCcw aria-hidden />
          סיבוב 15°
        </Button>
        {selectedObject ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                dispatch({
                  type: "DUPLICATE_OBJECT",
                  id: selectedObject.id,
                  newId: createId("obj"),
                });
                announce("שוכפל");
              }}
            >
              <Copy aria-hidden />
              שכפול
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                dispatch({
                  type: "UPDATE_OBJECT",
                  id: selectedObject.id,
                  patch: { locked: !locked },
                });
                announce(locked ? "הנעילה שוחררה" : "ננעל");
              }}
            >
              {locked ? <LockOpen aria-hidden /> : <Lock aria-hidden />}
              {locked ? "שחרור נעילה" : "נעילה"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={locked}
              onClick={() => {
                dispatch({ type: "REMOVE_OBJECT", id: selectedObject.id });
                announce("נמחק");
              }}
            >
              <Trash2 aria-hidden />
              מחיקה
            </Button>
          </>
        ) : selectedFixture ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              dispatch({ type: "REMOVE_FIXTURE", id: selectedFixture.id });
              announce("גוף התאורה הוסר");
            }}
          >
            <Trash2 aria-hidden />
            מחיקה
          </Button>
        ) : null}
      </div>

      {/*
        * Every change above lands here. Without it a keyboard user pressing
        * "הגדלה" gets no feedback at all — the only evidence is a picture.
        */}
      <p role="status" aria-live="polite" className="mt-3 min-h-4 text-xs text-muted">
        {announcement}
      </p>
    </section>
  );
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
