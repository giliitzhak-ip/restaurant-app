"use client";

import * as React from "react";
import { ImagePlus, Scissors, Undo2 } from "lucide-react";
import { t } from "@/i18n";
import { designerConfig } from "@/config/brand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { uploadDesignObjectAction } from "@/server/actions/designs";
import type { ScenePoint } from "@/types/scene";

/**
 * "Upload my own product".
 *
 * A customer wants to see *their* television, or the sideboard they are about
 * to buy from someone else, on their own wall. The photo they have is a
 * catalogue shot on a white background, so the useful step is cutting the
 * object out of it.
 *
 * There is no background-removal provider configured, and the brief says what
 * to do in that case: offer a simple manual cutout. So this is a polygon —
 * tap around the object, close the shape, done. It is not clever and it does
 * not pretend to be; it is six taps and it works offline, which an API call
 * that might not be there does not.
 *
 * The cutting happens in the browser, on a canvas, which means the file that
 * leaves the device is already only the part they chose. The server then does
 * what it does to every upload: decode, re-encode, strip the EXIF.
 */

type Stage = "pick" | "cut" | "sending";

export function CustomObjectDialog({
  open,
  onOpenChange,
  onReady,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The stored cutout, and its shape, so the object can be sized. */
  onReady: (result: { url: string; label: string; aspect: number }) => void;
}) {
  const [stage, setStage] = React.useState<Stage>("pick");
  const [source, setSource] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState("");
  const [points, setPoints] = React.useState<ScenePoint[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const imageRef = React.useRef<HTMLImageElement>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);

  /*
   * Object URLs are a real leak if they are not revoked: each one pins the
   * whole decoded bitmap until the document goes away, and someone trying
   * three photos in a row would hold all three.
   */
  React.useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );

  const reset = () => {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
    setPoints([]);
    setLabel("");
    setError(null);
    setStage("pick");
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > designerConfig.maxUploadBytes) {
      setError(t.designer.uploadTooLarge);
      return;
    }
    setError(null);
    setSource(URL.createObjectURL(file));
    setPoints([]);
    setStage("cut");
  };

  const addPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    setPoints((current) => [
      ...current,
      {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      },
    ]);
  };

  /**
   * Cuts the shape out and uploads it.
   *
   * The canvas is sized to the polygon's bounding box rather than the whole
   * photo, so a small object cut from a large image does not arrive as a
   * mostly-transparent sheet that is expensive to store and to draw.
   */
  const cut = async () => {
    const image = imageRef.current;
    if (!image || points.length < 3) return;
    setStage("sending");
    setError(null);

    const naturalW = image.naturalWidth;
    const naturalH = image.naturalHeight;
    const xs = points.map((point) => point.x * naturalW);
    const ys = points.map((point) => point.y * naturalH);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxX = Math.min(naturalW, Math.ceil(Math.max(...xs)));
    const maxY = Math.min(naturalH, Math.ceil(Math.max(...ys)));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError(t.states.errorBody);
      setStage("cut");
      return;
    }

    context.beginPath();
    points.forEach((point, index) => {
      const x = point.x * naturalW - minX;
      const y = point.y * naturalH - minY;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.clip();
    context.drawImage(image, -minX, -minY);

    const blob = await new Promise<Blob | null>((resolve) =>
      // PNG, not JPEG: the whole point is the transparency, and JPEG has none.
      canvas.toBlob((value) => resolve(value), "image/png"),
    );
    if (!blob) {
      setError(t.states.errorBody);
      setStage("cut");
      return;
    }

    const form = new FormData();
    form.set("image", new File([blob], "object.png", { type: "image/png" }));
    const result = await uploadDesignObjectAction(form);

    if (!result.ok) {
      setError(
        result.error === "FILE_TOO_LARGE"
          ? t.designer.uploadTooLarge
          : result.error === "UNSUPPORTED_TYPE"
            ? t.designer.uploadWrongType
            : t.states.errorBody,
      );
      setStage("cut");
      return;
    }

    onReady({
      url: result.url,
      label: label.trim() || "מוצר שלי",
      aspect: height / width,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>העלאת מוצר משלי</DialogTitle>
          <DialogDescription>
            צלמו או העלו תמונה של המוצר, סמנו את קווי המתאר שלו, והוא ייכנס לעיצוב.
            התמונה נשמרת בעיצוב שלכם בלבד ואינה מתפרסמת בספרייה.
          </DialogDescription>
        </DialogHeader>

        {stage === "pick" ? (
          <div className="space-y-4">
            <label className="press flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-2 p-8 text-center hover:border-ink">
              <ImagePlus className="size-6 text-muted" aria-hidden />
              <span className="text-sm text-ink">בחירת תמונה</span>
              <span className="text-xs text-muted">
                JPG, PNG או WebP · עד {Math.round(designerConfig.maxUploadBytes / 1048576)}MB
              </span>
              <input
                type="file"
                accept={designerConfig.acceptedMimeTypes.join(",")}
                className="sr-only"
                onChange={(event) => pick(event.target.files?.[0])}
              />
            </label>
            <p className="text-xs leading-relaxed text-muted">
              אין לנו כרגע ספק להסרת רקע אוטומטית, ולכן החיתוך ידני — זה לוקח כמה
              נגיעות ועובד גם בלי חיבור טוב.
            </p>
          </div>
        ) : null}

        {stage !== "pick" && source ? (
          <div className="space-y-4">
            <Field label="שם המוצר" htmlFor="custom-object-label">
              <Input
                id="custom-object-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="לדוגמה: המזנון מהסלון"
              />
            </Field>

            <div
              ref={frameRef}
              onPointerDown={addPoint}
              className="relative cursor-crosshair overflow-hidden rounded-sm bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imageRef}
                src={source}
                alt="התמונה שהעליתם"
                className="max-h-[46dvh] w-full object-contain"
              />
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 size-full"
              >
                {points.length > 1 ? (
                  <polygon
                    points={points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                    fill="rgba(140,106,67,0.3)"
                    stroke="#f2c185"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {points.map((point, index) => (
                  <circle
                    key={index}
                    cx={point.x * 100}
                    cy={point.y * 100}
                    r={0.9}
                    fill="#f2c185"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            </div>

            <p className="text-xs text-muted">
              לחצו סביב המוצר כדי לסמן את קווי המתאר — שלוש נקודות לפחות. אפשר לבטל
              נקודה אחרונה.
            </p>

            {error ? (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={cut}
                loading={stage === "sending"}
                loadingLabel="חותך"
                disabled={points.length < 3}
                data-testid="cut-custom-object"
              >
                <Scissors />
                חיתוך והוספה לחדר
              </Button>
              <Button
                variant="outline"
                onClick={() => setPoints((current) => current.slice(0, -1))}
                disabled={!points.length || stage === "sending"}
              >
                <Undo2 />
                ביטול נקודה
              </Button>
              <Button variant="ghost" onClick={reset} disabled={stage === "sending"}>
                תמונה אחרת
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
