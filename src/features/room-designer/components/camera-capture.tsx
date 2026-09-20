"use client";

import * as React from "react";
import { Camera, Images, RotateCcw, SwitchCamera, X } from "lucide-react";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

type CameraState = "starting" | "live" | "captured" | "denied" | "unsupported";

/**
 * Camera capture.
 *
 * Rear camera by default, on-screen framing guidance, and an explicit
 * review step — a blurry or badly framed photo is the main reason a
 * visualisation disappoints, so it is cheaper to fix here than to explain
 * later. Every failure path offers the gallery instead of a dead end.
 */
export function CameraCapture({
  onCapture,
  onClose,
  onFallbackUpload,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onFallbackUpload: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [state, setState] = React.useState<CameraState>("starting");
  const [facing, setFacing] = React.useState<"environment" | "user">("environment");
  const [snapshot, setSnapshot] = React.useState<string | null>(null);
  /** Bumped to restart the stream after a retake. */
  const [attempt, setAttempt] = React.useState(0);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setState("live");
      } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        setState(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : name === "NotFoundError"
              ? "unsupported"
              : "denied",
        );
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [attempt, facing, stop]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setSnapshot(canvas.toDataURL("image/jpeg", 0.92));
    setState("captured");
    stop();
  };

  const use = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92),
    );
    if (!blob) return;
    onCapture(new File([blob], "room.jpg", { type: "image/jpeg" }));
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-studio">
      <div className="flex items-center justify-between p-4">
        <IconButton
          label={t.common.close}
          onClick={() => {
            stop();
            onClose();
          }}
          className="rounded-full bg-white/10 text-studio-ink focus-ring-invert hover:bg-white/20"
        >
          <X />
        </IconButton>
        <p className="text-sm text-studio-ink">{t.designer.camera.title}</p>
        {state === "live" ? (
          <IconButton
            label={t.designer.camera.switchCamera}
            onClick={() => setFacing(facing === "environment" ? "user" : "environment")}
            className="rounded-full bg-white/10 text-studio-ink focus-ring-invert hover:bg-white/20"
          >
            <SwitchCamera />
          </IconButton>
        ) : (
          <span className="size-10" />
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {state === "captured" && snapshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snapshot} alt="" className="size-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="size-full object-cover"
          />
        )}

        {state === "live" ? (
          <>
            {/* framing guides */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-6 rounded-sm border border-white/25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-6 bottom-[38%] h-px bg-white/25"
            />
            <ul className="absolute inset-x-4 top-4 space-y-1.5 text-center text-xs text-white/80">
              <li>{t.designer.camera.guidance1}</li>
              <li>{t.designer.camera.guidance2}</li>
              <li>{t.designer.camera.guidance3}</li>
              <li>{t.designer.camera.guidance4}</li>
            </ul>
          </>
        ) : null}

        {state === "starting" ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-studio-ink/70">
            {t.common.loading}
          </div>
        ) : null}

        {state === "denied" || state === "unsupported" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="font-display text-xl text-studio-ink">
              {state === "denied"
                ? t.designer.camera.permissionTitle
                : t.designer.camera.unsupportedTitle}
            </p>
            <p className="max-w-sm text-sm text-studio-ink/65">
              {state === "denied"
                ? t.designer.camera.permissionBody
                : t.designer.camera.unsupportedBody}
            </p>
            <Button variant="studio" onClick={onFallbackUpload}>
              <Images />
              {t.designer.camera.fromGallery}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-center gap-3 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {state === "captured" ? (
          <>
            <Button
              variant="studioOutline"
              size="lg"
              onClick={() => {
                setSnapshot(null);
                setState("starting");
                setAttempt((current) => current + 1);
              }}
            >
              <RotateCcw />
              {t.designer.camera.retake}
            </Button>
            <Button variant="studio" size="lg" onClick={use}>
              {t.designer.camera.use}
            </Button>
          </>
        ) : state === "live" ? (
          <IconButton
            label={t.designer.camera.capture}
            onClick={capture}
            className="size-16 rounded-full border-4 border-white/80 bg-white/20 text-white backdrop-blur-sm focus-ring-invert hover:bg-white/30 [&_svg]:size-6"
          >
            <Camera />
          </IconButton>
        ) : null}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
