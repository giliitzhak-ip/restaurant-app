"use client";

import { useActionState, useRef, useState } from "react";
import { uploadMedia } from "@/actions/media";

/** Resize in the browser: converts iPhone HEIC to JPEG and keeps uploads small. */
async function prepare(file: File, asLogo: boolean): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // let the server reject unsupported formats
  const max = asLogo ? 1000 : 2160;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = asLogo ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), type, 0.88));
  const name = file.name.replace(/\.[^.]+$/, "") + (asLogo ? ".png" : ".jpg");
  return new File([blob], name, { type });
}

export function UploadForm({ asLogo = false }: { asLogo?: boolean }) {
  const [state, action, pending] = useActionState(uploadMedia, undefined);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        const f = fd.get("file");
        if (f instanceof File && f.size) {
          setBusy(true);
          try {
            fd.set("file", await prepare(f, asLogo));
          } finally {
            setBusy(false);
          }
        }
        await action(fd);
        formRef.current?.reset();
        setPreview(null);
      }}
      className="space-y-3"
    >
      <input type="hidden" name="as_logo" value={asLogo ? "1" : "0"} />
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-tech/40 bg-ink-850 p-4 text-sm text-soft hover:border-tech">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="max-h-40 rounded-lg" />
        ) : (
          <>
            <span className="text-2xl">📷</span>
            {asLogo ? "בחרו קובץ לוגו (PNG שקוף מומלץ)" : "צלמו או בחרו תמונה של התקנה אמיתית"}
          </>
        )}
        <input
          type="file"
          name="file"
          accept="image/*"
          required
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </label>
      {!asLogo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="title" className="input" placeholder="תיאור קצר (למשל: התקנת מצלמות בכניסה)" />
          <input name="tags" className="input" placeholder="תגיות: מצלמות, עסק" />
        </div>
      )}
      {state?.error && <p className="text-sm text-red-300">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
      <button type="submit" disabled={pending || busy} className="btn-primary w-full sm:w-auto">
        {busy ? "מכין תמונה…" : pending ? "מעלה…" : asLogo ? "שמור לוגו" : "העלה לספרייה"}
      </button>
    </form>
  );
}
