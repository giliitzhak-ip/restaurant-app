"use client";

import { Download, Trash2, Loader2, AlertCircle, Volume2, VolumeX, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Progress } from "@/components/ui/progress";
import { formatBytes, formatDuration, KIND_LABEL } from "@/lib/format";
import type { AssetDTO } from "@/server/projects";

export function AssetCard({ asset, onDelete }: { asset: AssetDTO; onDelete: (id: string) => Promise<void> }) {
  const file = (v: string) => `/api/assets/${asset.id}/file?v=${v}`;
  const ratio = asset.width && asset.height ? `${asset.width} / ${asset.height}` : "16 / 9";

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: asset.kind === "AUDIO" ? undefined : ratio, maxHeight: 520 }}>
        {asset.status === "READY" && asset.kind === "VIDEO" && (
          <video
            src={file("preview")}
            poster={asset.hasPoster ? file("poster") : undefined}
            controls
            playsInline
            preload="metadata"
            className="size-full object-contain"
          />
        )}
        {asset.status === "READY" && asset.kind === "IMAGE" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file("preview")} alt={asset.originalName ?? ""} className="size-full object-contain" loading="lazy" />
        )}
        {asset.status === "READY" && asset.kind === "AUDIO" && (
          <div className="p-3">
            <audio src={file("preview")} controls preload="metadata" className="w-full" />
          </div>
        )}
        {asset.status === "PROCESSING" && (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center" style={{ aspectRatio: "16 / 9" }}>
            <Loader2 className="size-7 animate-spin text-gold" aria-hidden />
            <p className="text-sm">
              {asset.job?.status === "RUNNING" ? "בודק את הקובץ ומכין תצוגה מקדימה…" : "ממתין לעיבוד בתור…"}
            </p>
            <Progress value={asset.job?.progress ?? 0} className="max-w-56" label="התקדמות עיבוד" />
            <span className="text-xs text-ash">{asset.job?.progress ?? 0}%</span>
          </div>
        )}
        {asset.status === "REJECTED" && (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center text-danger">
            <AlertCircle className="size-7" aria-hidden />
            <p className="text-sm">{asset.errorMessage ?? "הקובץ נדחה"}</p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <p dir="auto" className="truncate text-sm font-semibold">{asset.originalName ?? "ללא שם"}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="gold">{KIND_LABEL[asset.kind]}</Badge>
          {asset.aiGenerated && <Badge variant="gold"><Sparkles className="size-3" aria-hidden />נוצר ב-AI</Badge>}
          {asset.width && asset.height && <Badge dir="ltr">{asset.width}×{asset.height}</Badge>}
          {asset.durationMs != null && <Badge dir="ltr">{formatDuration(asset.durationMs)}</Badge>}
          {asset.fps && <Badge dir="ltr">{Math.round(asset.fps)} fps</Badge>}
          {asset.kind === "VIDEO" && asset.status === "READY" && (
            <Badge>{asset.hasAudio ? <Volume2 className="size-3" aria-label="כולל אודיו" /> : <VolumeX className="size-3" aria-label="ללא אודיו" />}</Badge>
          )}
          <Badge dir="ltr">{formatBytes(asset.sizeBytes)}</Badge>
          {asset.videoCodec && <Badge dir="ltr" className="uppercase">{asset.videoCodec}</Badge>}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        {asset.status === "READY" && (
          <Button asChild size="sm" variant="outline">
            <a href={`${file("original")}&download=1`}>
              <Download aria-hidden />
              הורדת המקור
            </a>
          </Button>
        )}
        <ConfirmButton size="sm" variant="ghost" confirmLabel="למחוק את הקובץ?" onConfirm={() => onDelete(asset.id)}>
          <Trash2 aria-hidden />
          מחיקה
        </ConfirmButton>
      </div>
    </Card>
  );
}
