"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, CheckCircle2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import { classifyUpload, type MediaKind } from "@/server/media/policy";

type Item = { key: string; name: string; size: number; progress: number; state: "waiting" | "uploading" | "done" | "error"; error?: string };

const TOO_LARGE = { IMAGE: "התמונה גדולה מדי", VIDEO: "הסרטון גדול מדי", AUDIO: "קובץ האודיו גדול מדי" } as const;

/** Uploads one file with real byte-level progress (XHR exposes upload progress; fetch does not). */
function uploadFile(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = () => {
      let data: { ok?: boolean; error?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data?.ok) resolve();
      else reject(new Error(data?.error ?? `ההעלאה נכשלה (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("החיבור נקטע במהלך ההעלאה. בדקו את האינטרנט ונסו שוב."));
    xhr.ontimeout = () => reject(new Error("ההעלאה ארכה זמן רב מדי."));
    xhr.send(file);
  });
}

export function Uploader({
  projectId,
  accept,
  maxBytes,
  onUploaded,
}: {
  projectId: string;
  accept: string;
  maxBytes: Record<MediaKind, number>;
  onUploaded: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = items.some((i) => i.state === "uploading" || i.state === "waiting");

  const update = (key: string, patch: Partial<Item>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const newItems: Item[] = list.map((f, idx) => ({ key: `${Date.now()}-${idx}-${f.name}`, name: f.name, size: f.size, progress: 0, state: "waiting" }));
      setItems((prev) => [...prev.filter((i) => i.state !== "done"), ...newItems]);

      for (let i = 0; i < list.length; i++) {
        const file = list[i]!;
        const item = newItems[i]!;
        const type = classifyUpload(file.name, file.type);
        if (!type.ok) {
          update(item.key, { state: "error", error: type.error });
          continue;
        }
        if (file.size > maxBytes[type.kind]) {
          update(item.key, { state: "error", error: `${TOO_LARGE[type.kind]} (מקסימום ${formatBytes(maxBytes[type.kind])})` });
          continue;
        }
        update(item.key, { state: "uploading" });
        try {
          await uploadFile(`/api/projects/${projectId}/assets`, file, (p) => update(item.key, { progress: p }));
          update(item.key, { state: "done", progress: 100 });
          onUploaded();
        } catch (e) {
          update(item.key, { state: "error", error: (e as Error).message });
        }
      }
    },
    [projectId, maxBytes, onUploaded],
  );

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          drag ? "border-gold bg-gold/10" : "border-steel bg-coal/50 hover:border-gold/60",
        )}
      >
        <UploadCloud className="size-9 text-gold" aria-hidden />
        <span className="font-semibold">העלאת תמונות, סרטונים או אודיו</span>
        <span className="text-xs text-ash">
          לחצו לבחירה מהטלפון או מהמחשב, או גררו קבצים לכאן · תמונה עד {formatBytes(maxBytes.IMAGE)} · סרטון עד {formatBytes(maxBytes.VIDEO)}
        </span>
        <input
          ref={input}
          type="file"
          multiple
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {items.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {items.map((i) => (
            <li key={i.key} className="rounded-xl border border-steel bg-coal/60 p-3 text-sm">
              <div className="flex items-center gap-2">
                {i.state === "done" && <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />}
                {i.state === "error" && <XCircle className="size-4 shrink-0 text-danger" aria-hidden />}
                <span dir="auto" className="min-w-0 flex-1 truncate">{i.name}</span>
                <span className="shrink-0 text-xs text-ash">
                  {i.state === "uploading" ? `${Math.round(i.progress)}%` : i.state === "waiting" ? "ממתין" : i.state === "done" ? "הועלה" : formatBytes(i.size)}
                </span>
              </div>
              {i.state === "uploading" && <Progress value={i.progress} className="mt-2" label={`העלאת ${i.name}`} />}
              {i.error && <p className="mt-1 text-xs text-danger">{i.error}</p>}
            </li>
          ))}
        </ul>
      )}
      {busy && <p className="text-xs text-ash">אל תסגרו את הדף עד לסיום ההעלאה.</p>}
    </div>
  );
}
