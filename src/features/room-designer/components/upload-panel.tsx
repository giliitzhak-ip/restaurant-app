"use client";

import * as React from "react";
import Link from "next/link";
import { Camera, ImagePlus, Lock, Sparkles } from "lucide-react";
import { designerConfig } from "@/config/brand";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { media } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { CameraCapture } from "./camera-capture";

export function UploadPanel({
  onImage,
  error,
}: {
  onImage: (source: File | string, origin: "camera" | "file" | "demo") => void;
  error: string | null;
}) {
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-studio-3 text-studio-ink">
        <Sparkles className="size-5" />
      </span>
      <h1 className="mt-6 font-display text-3xl text-studio-ink">
        {t.designer.introTitle}
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-studio-ink/65">
        {t.designer.introBody}
      </p>

      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button
          size="lg"
          variant="studio"
          onClick={() => setCameraOpen(true)}
          className="sm:w-auto"
        >
          <Camera />
          {t.designer.cameraCta}
        </Button>
        <Button
          size="lg"
          variant="studioOutline"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus />
          {t.designer.uploadCta}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={designerConfig.acceptedMimeTypes.join(",")}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImage(file, "file");
            event.target.value = "";
          }}
        />
      </div>

      <p className="mt-3 text-xs text-studio-ink/45">{t.designer.uploadHint}</p>

      <button
        type="button"
        onClick={() => onImage(media.scene("before"), "demo")}
        className="mt-6 text-sm text-studio-ink/70 underline underline-offset-4 transition-colors hover:text-studio-ink"
      >
        {t.designer.demoCta}
      </button>

      {error ? (
        <p role="alert" className="mt-6 text-sm text-[#f0a8a0]">
          {error === "IMAGE_DECODE_FAILED"
            ? "לא הצלחנו לקרוא את התמונה. נסו קובץ JPG או PNG אחר."
            : t.states.errorBody}
        </p>
      ) : null}

      <div className="mt-10 w-full rounded-lg border border-studio-line bg-studio-2 p-5 text-start">
        <p className="flex items-center gap-2 text-sm font-medium text-studio-ink">
          <Lock className="size-4 text-studio-ink/60" />
          {t.designer.privacyTitle}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-studio-ink/60">
          {t.designer.privacyBody}{" "}
          <Link
            href={routes.privacy}
            className="underline underline-offset-4 hover:text-studio-ink"
          >
            {t.designer.privacyLink}
          </Link>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-studio-ink/45">
          ההדמיה מתבצעת במכשיר שלכם. לניתוח החדר נשלחת תמונה ממוזערת בלבד, והתמונה
          המלאה נשמרת רק אם תבחרו לשמור את העיצוב.
        </p>
      </div>

      {cameraOpen ? (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            onImage(file, "camera");
          }}
          onFallbackUpload={() => {
            setCameraOpen(false);
            inputRef.current?.click();
          }}
        />
      ) : null}
    </div>
  );
}
