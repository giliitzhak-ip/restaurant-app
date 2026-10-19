"use client";

import { useEffect, useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/money";
import { formatRelative } from "@/lib/format";
import type { AiJobDTO } from "@/server/face-swap";
import type { AssetDTO } from "@/server/projects";
import { JobStatusBadge } from "./job-status";
import { BeforeAfter } from "./before-after";

function elapsed(from: string | null) {
  if (!from) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Live status of one face swap job, and the before/after viewer once its result is ready. */
export function FaceSwapJobCard({
  job,
  assets,
  onCancel,
}: {
  job: AiJobDTO;
  assets: AssetDTO[];
  onCancel?: (id: string) => Promise<void>;
}) {
  const [, tick] = useState(0);
  const active = job.status === "QUEUED" || job.status === "RUNNING";
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  const target = assets.find((a) => a.id === job.input.targetAssetId);
  const source = assets.find((a) => a.id === job.input.sourceAssetId);
  const result = job.resultAssetId ? assets.find((a) => a.id === job.resultAssetId) : undefined;
  const ratio = target?.width && target?.height ? `${target.width} / ${target.height}` : "9 / 16";

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <JobStatusBadge status={job.status} />
          <span className="text-xs text-ash">{job.quote?.provider.name ?? job.provider}</span>
        </div>
        <span className="text-xs text-ash">{formatRelative(job.createdAt)}</span>
      </div>
      <p className="text-sm">
        פנים: <bdi>{source?.originalName ?? "תמונה"}</bdi> · סרטון: <bdi>{target?.originalName ?? "סרטון"}</bdi>
      </p>
      <p className="text-xs text-ash">
        {job.actualCostCents !== null
          ? `עלות בפועל: ${usd(job.actualCostCents)}`
          : job.approvedCostCents !== null
            ? `עלות מאושרת: ${usd(job.approvedCostCents)}`
            : `הערכה: ${usd(job.estimatedCostCents)}`}
      </p>

      {active && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin text-gold" aria-hidden />
            {job.status === "QUEUED" ? "ממתין בתור…" : job.progress >= 90 ? "מוריד ושומר את התוצאה…" : job.progress > 5 ? "בעיבוד…" : "שולח לספק…"}
            <span className="ms-auto text-xs text-ash" dir="ltr">{elapsed(job.startedAt ?? job.createdAt)}</span>
          </div>
          <Progress value={job.progress} label="התקדמות החלפת הפנים" />
          <p className="text-xs text-ash">אפשר לסגור את הדף ולחזור מאוחר יותר. העיבוד ממשיך בשרת.</p>
          {job.status === "QUEUED" && onCancel && (
            <Button size="sm" variant="ghost" onClick={() => onCancel(job.id)}>
              ביטול
            </Button>
          )}
        </div>
      )}

      {job.status === "FAILED" && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {job.errorMessage ?? "המשימה נכשלה"}
        </p>
      )}

      {job.status === "SUCCEEDED" && result?.status === "PROCESSING" && (
        <div className="flex items-center gap-2 text-sm text-ash">
          <Loader2 className="size-4 animate-spin text-gold" aria-hidden />
          מכין תצוגה מקדימה לתוצאה…
        </div>
      )}
      {job.status === "SUCCEEDED" && result?.status === "READY" && target && <BeforeAfter beforeId={target.id} afterId={result.id} ratio={ratio} />}
    </Card>
  );
}
