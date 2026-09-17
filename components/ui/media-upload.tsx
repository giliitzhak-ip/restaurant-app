'use client';

import { useId, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { uploadFile, type UploadBucket, type UploadedFile } from '@/lib/upload-client';

interface MediaUploadProps {
  bucket: UploadBucket;
  value: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  accept?: string;
  max?: number;
  label: string;
  hint?: string;
  kind?: 'image' | 'video' | 'document';
}

/**
 * Multi-file uploader with previews. Uploads happen immediately so the wizard's
 * final submit only carries storage paths, keeping that request small.
 */
export function MediaUpload({
  bucket,
  value,
  onChange,
  accept = 'image/*',
  max = 6,
  label,
  hint,
  kind = 'image',
}: MediaUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);

    const room = max - value.length;
    if (room <= 0) {
      setError(`אפשר להעלות עד ${max} קבצים`);
      return;
    }

    setUploading(true);
    const uploaded: UploadedFile[] = [];

    for (const file of Array.from(fileList).slice(0, room)) {
      try {
        uploaded.push(await uploadFile(bucket, file));
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : 'ההעלאה נכשלה');
      }
    }

    setUploading(false);
    if (uploaded.length) onChange([...value, ...uploaded]);
    if (inputRef.current) inputRef.current.value = '';
  }

  const Icon = kind === 'video' ? Video : ImagePlus;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={max > 1}
        className="sr-only"
        onChange={(event) => handleFiles(event.target.files)}
      />

      <label
        htmlFor={inputId}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-center transition-colors hover:border-accent/60 hover:bg-accent/5',
          uploading && 'pointer-events-none opacity-60',
        )}
      >
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-accent" aria-hidden />
        ) : (
          <Icon className="size-6 text-muted-foreground" aria-hidden />
        )}
        <span className="text-sm font-medium">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
        <span className="num text-xs text-muted-foreground">
          {value.length}/{max}
        </span>
      </label>

      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {value.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((file) => (
            <li key={file.path} className="relative">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-secondary p-2 text-center">
                <span className="line-clamp-3 break-all text-[10px] text-muted-foreground">
                  {file.name}
                </span>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -end-1.5 -top-1.5 size-6"
                aria-label={`הסרת ${file.name}`}
                onClick={() => onChange(value.filter((entry) => entry.path !== file.path))}
              >
                <Trash2 className="size-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
