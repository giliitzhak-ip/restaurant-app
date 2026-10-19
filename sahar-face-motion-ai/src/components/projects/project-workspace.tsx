"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Trash2, Pencil, Loader2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { cn } from "@/lib/utils";
import { formatDate, formatRelative } from "@/lib/format";
import type { ProjectDTO } from "@/server/projects";
import type { MediaKind } from "@/server/media/policy";
import { AssetCard } from "./asset-card";
import { AspectPicker } from "./aspect-picker";
import { Uploader } from "./uploader";

type Filter = "ALL" | MediaKind;
const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "הכול" },
  { value: "VIDEO", label: "סרטונים" },
  { value: "IMAGE", label: "תמונות" },
  { value: "AUDIO", label: "אודיו" },
];

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  if (!res) throw new Error("אין חיבור לשרת. נסו שוב.");
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? `שגיאת שרת (${res.status})`);
  return data;
}

export function ProjectWorkspace({
  initial,
  accept,
  limits,
}: {
  initial: ProjectDTO;
  accept: string;
  limits: { maxBytes: Record<MediaKind, number>; maxVideoSeconds: number };
}) {
  const [project, setProject] = useState(initial);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [editing, setEditing] = useState(false);
  const [aspect, setAspect] = useState(initial.aspectRatio);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api(`/api/projects/${initial.id}`, "GET");
      setProject(data.project);
    } catch {
      /* transient; next poll retries */
    }
  }, [initial.id]);

  // Poll while any file is still being processed by the media worker.
  const processing = project.assets.some((a) => a.status === "PROCESSING");
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [processing, refresh]);

  const assets = filter === "ALL" ? project.assets : project.assets.filter((a) => a.kind === filter);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-ash hover:text-gold">
          <ArrowRight className="size-4" aria-hidden />
          כל הפרויקטים
        </Link>
      </div>

      {error && <Alert>{error}</Alert>}

      {editing ? (
        <Card>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setSaving(true);
              setError(null);
              try {
                await api(`/api/projects/${project.id}`, "PATCH", { name: f.get("name"), description: f.get("description"), aspectRatio: aspect });
                await refresh();
                setEditing(false);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="e-name">שם הפרויקט</Label>
              <Input id="e-name" name="name" defaultValue={project.name} required maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-desc">תיאור</Label>
              <Textarea id="e-desc" name="description" defaultValue={project.description ?? ""} maxLength={500} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>יחס מסך</Label>
              <AspectPicker name="e-aspect" value={aspect} onChange={setAspect} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" aria-hidden />}
                שמירה
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>ביטול</Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 dir="auto" className="break-words text-2xl font-bold sm:text-3xl">{project.name}</h1>
            {project.description && <p dir="auto" className="mt-1 text-ash">{project.description}</p>}
            <p className="mt-2 text-xs text-ash">
              נוצר {formatDate(project.createdAt)} · יחס מסך <span dir="ltr">{project.aspectRatio}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              עריכה
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={duplicating}
              onClick={async () => {
                setDuplicating(true);
                setError(null);
                try {
                  const data = await api(`/api/projects/${project.id}/duplicate`, "POST");
                  window.location.href = `/projects/${data.id}`;
                } catch (err) {
                  setError((err as Error).message);
                  setDuplicating(false);
                }
              }}
            >
              {duplicating ? <Loader2 className="animate-spin" aria-hidden /> : <Copy aria-hidden />}
              שכפול
            </Button>
            <ConfirmButton
              size="sm"
              variant="ghost"
              confirmLabel="למחוק את הפרויקט וכל הקבצים?"
              onConfirm={async () => {
                try {
                  await api(`/api/projects/${project.id}`, "DELETE");
                  window.location.href = "/projects";
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <Trash2 aria-hidden />
              מחיקה
            </ConfirmButton>
          </div>
        </div>
      )}

      <Uploader projectId={project.id} accept={accept} maxBytes={limits.maxBytes} onUploaded={refresh} />

      <section aria-labelledby="files-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="files-title" className="text-lg font-bold">
            קבצי הפרויקט <span className="text-sm font-normal text-ash">({project.assets.length})</span>
          </h2>
          <div className="flex gap-1 rounded-xl bg-coal p-1" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn("rounded-lg px-3 py-1.5 text-sm", filter === f.value ? "bg-gold/15 text-gold" : "text-ash hover:text-pearl")}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {assets.length === 0 ? (
          <p className="rounded-2xl border border-steel/60 p-8 text-center text-sm text-ash">
            {project.assets.length === 0 ? "עדיין לא הועלו קבצים. העלו תמונת פנים וסרטון כדי להתחיל." : "אין קבצים מסוג זה."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                onDelete={async (id) => {
                  try {
                    await api(`/api/assets/${id}`, "DELETE");
                    await refresh();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardTitle className="mb-3 flex items-center gap-2">
          <History className="size-5 text-gold" aria-hidden />
          היסטוריית פעולות
        </CardTitle>
        <ol className="space-y-2">
          {project.events.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 border-b border-steel/50 pb-2 text-sm last:border-0">
              <span dir="auto" className="min-w-0 break-words">{e.message}</span>
              <time dateTime={e.createdAt} title={formatDate(e.createdAt)} className="shrink-0 text-xs text-ash">{formatRelative(e.createdAt)}</time>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
