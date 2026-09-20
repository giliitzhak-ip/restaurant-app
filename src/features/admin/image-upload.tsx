"use client";

import * as React from "react";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { uploadAdminImageAction } from "@/server/actions/admin";

export function ImageUpload({
  value,
  onChange,
  hint,
  label,
  aspect = "square",
  className,
}: {
  value: string;
  onChange: (url: string) => void;
  hint: string;
  label: string;
  aspect?: "square" | "wide";
  className?: string;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setPending(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("hint", hint);
    const result = await uploadAdminImageAction(form);
    setPending(false);
    if (!result.ok) {
      setError(
        result.error === "FILE_TOO_LARGE"
          ? "הקובץ גדול מדי (עד 12MB)"
          : result.error === "UNSUPPORTED_TYPE"
            ? "פורמט לא נתמך — JPG, PNG או WEBP"
            : t.states.errorBody,
      );
      return;
    }
    onChange(result.url);
  };

  return (
    <div className={className}>
      <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink-soft">
        {label}
      </span>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={`${label} — העלאת תמונה`}
          className={cn(
            "press relative shrink-0 overflow-hidden rounded-sm border border-dashed border-line-strong bg-surface hover:border-ink",
            aspect === "square" ? "size-24" : "h-24 w-40",
          )}
        >
          {value ? (
            <Image src={value} alt="" fill sizes="160px" className="object-cover" unoptimized />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 text-xs text-muted">
              {pending ? (
                <Spinner className="size-4" labelled={false} />
              ) : (
                <Upload className="size-4" />
              )}
              העלאה
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="/media/… או כתובת CDN"
            aria-label={`${label} — כתובת`}
            className="h-9 text-xs"
          />
          {value ? (
            <Button
              variant="link"
              size="sm"
              onClick={() => onChange("")}
              className="mt-1.5 text-xs text-muted hover:text-danger"
            >
              <X className="size-3" />
              {t.common.remove}
            </Button>
          ) : null}
          {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
