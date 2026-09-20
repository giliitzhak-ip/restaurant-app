import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteBlob, getBlob, putBlob } from '@/lib/db/idb';
import { PHOTO_KIND_LABELS } from '@/schema/enums';
import { compressImage, uploadFile, validateUpload, MAX_FILE_BYTES } from '@/lib/storage';
import { sha256Blob } from '@/lib/hash';
import { newUuid } from '@/lib/ids';
import { serverNowIso } from '@/lib/time';
import { getArray, getString } from '@/lib/paths';
import { Alert } from '@/components/Common';
import { TextField } from '@/components/Fields';
import type { DraftApi } from '@/state/useDraft';

/**
 * תמונות מצורפות ליומן.
 *
 * עובד גם ללא קליטה: התמונה נדחסת ונשמרת מיד ב-IndexedDB, ומועלית
 * לאחסון הפרטי כשיש חיבור. הנתיב באחסון נשמר בתוך היומן, כך שהיומן
 * מצביע על הקובץ ולא מכיל אותו.
 */

export interface PhotoAttachmentsProps {
  draft: DraftApi;
  logId: string;
  organizationId: string | null;
}

interface PreviewState {
  [localBlobId: string]: string;
}

export function PhotoAttachments({ draft, logId, organizationId }: PhotoAttachmentsProps): React.JSX.Element {
  const { content, setField, removeAt, appendTo, readOnly } = draft;
  const attachments = getArray(content, 'attachments');
  const [previews, setPreviews] = useState<PreviewState>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  // סיווג התמונה, כפי שהיה בגרסה הקודמת: מפגע / פעולת מניעה / תיעוד כללי.
  const [photoKind, setPhotoKind] = useState<'hazard' | 'prevention' | 'general'>('general');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const createdUrls = useRef<string[]>([]);

  // תצוגות מקדימות מתוך ה-blobs השמורים מקומית.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: PreviewState = {};
      for (const attachment of attachments) {
        const localBlobId = getString(attachment, 'localBlobId');
        if (!localBlobId || previews[localBlobId]) continue;
        const stored = await getBlob(localBlobId);
        if (!stored) continue;
        const url = URL.createObjectURL(stored.blob);
        createdUrls.current.push(url);
        next[localBlobId] = url;
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setPreviews((current) => ({ ...current, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments.length]);

  useEffect(
    () => () => {
      for (const url of createdUrls.current) URL.revokeObjectURL(url);
      createdUrls.current = [];
    },
    [],
  );

  /** מעלה לאחסון כל תמונה שטרם הועלתה. נקרא בכניסה וכשהחיבור חוזר. */
  const uploadPending = useCallback(async () => {
    if (!organizationId || readOnly) return;
    if (!navigator.onLine) return;

    const pending = attachments
      .map((attachment, index) => ({ attachment, index }))
      .filter(({ attachment }) => !getString(attachment, 'storagePath') && getString(attachment, 'localBlobId'));

    if (pending.length === 0) return;
    setUploadingCount(pending.length);

    for (const { attachment, index } of pending) {
      const localBlobId = getString(attachment, 'localBlobId');
      try {
        const stored = await getBlob(localBlobId);
        if (!stored) continue;
        const result = await uploadFile(organizationId, stored.blob, { logId });
        setField(`attachments.${index}.storagePath`, result.path);
        setField(`attachments.${index}.sha256`, result.sha256);
        await putBlob({ ...stored, uploadedPath: result.path });
      } catch (caught) {
        // נשאר מקומי; ננסה שוב בפעם הבאה. לא מאבדים את התמונה.
        setError(caught instanceof Error ? caught.message : String(caught));
        break;
      }
    }
    setUploadingCount(0);
  }, [attachments, logId, organizationId, readOnly, setField]);

  useEffect(() => {
    void uploadPending();
    const handleOnline = () => void uploadPending();
    globalThis.addEventListener('online', handleOnline);
    return () => globalThis.removeEventListener('online', handleOnline);
  }, [uploadPending]);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_BYTES * 4) {
          setError(`הקובץ "${file.name}" גדול מדי מכדי להיות מעובד.`);
          continue;
        }

        // דחיסה מבוקרת: שומרת על יחס הגובה-רוחב ומצמצמת את הנפח.
        const compressed = await compressImage(file);
        const validation = validateUpload(compressed);
        if (!validation.ok) {
          setError(validation.error);
          continue;
        }

        const localBlobId = newUuid();
        await putBlob({
          id: localBlobId,
          blob: compressed,
          mimeType: compressed.type,
          sizeBytes: compressed.size,
          logId,
          kind: 'photo',
          sha256: await sha256Blob(compressed),
          createdAt: serverNowIso(),
          uploadedPath: null,
        });

        appendTo('attachments', {
          photoKind,
          kind: 'photo',
          localBlobId,
          mimeType: compressed.type,
          sizeBytes: compressed.size,
          capturedAt: serverNowIso(),
        });
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (index: number, localBlobId: string) => {
    removeAt(`attachments.${index}`);
    if (localBlobId) await deleteBlob(localBlobId);
  };

  return (
    <section className="card" aria-labelledby="photos-heading">
      <h2 id="photos-heading">תמונות</h2>
      <p className="card-sub">
        תמונות נדחסות ונשמרות במכשיר מיד, ומועלות לאחסון הפרטי כשיש חיבור.
      </p>

      {error ? <Alert kind="error">{error}</Alert> : null}
      {uploadingCount > 0 ? <Alert kind="info">מעלה {uploadingCount} תמונות לאחסון…</Alert> : null}

      <div className="field">
        <label htmlFor="photo-kind">סיווג התמונות הבאות</label>
        <select
          id="photo-kind"
          value={photoKind}
          disabled={readOnly || busy}
          onChange={(event) => setPhotoKind(event.target.value as 'hazard' | 'prevention' | 'general')}
        >
          {Object.entries(PHOTO_KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="hint">הסיווג נשמר לכל תמונה ומופיע גם ב-PDF.</div>
      </div>

      <div className="field">
        <label htmlFor="photo-input">הוספת תמונות</label>
        <input
          id="photo-input"
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          disabled={readOnly || busy}
          onChange={(event) => void addFiles(event.target.files)}
        />
        <div className="hint">ניתן לצלם במקום או לבחור מהגלריה. מותר JPG, PNG, WEBP.</div>
      </div>

      {attachments.length === 0 ? (
        <p className="muted small">לא צורפו תמונות.</p>
      ) : (
        attachments.map((attachment, index) => {
          const localBlobId = getString(attachment, 'localBlobId');
          const storagePath = getString(attachment, 'storagePath');
          const preview = previews[localBlobId];
          return (
            <div className="repeat-item" key={localBlobId || index}>
              <div className="repeat-item-head">
                <h4>תמונה {index + 1}</h4>
                <span className="tag">
                  {PHOTO_KIND_LABELS[
                    (getString(attachment, 'photoKind') || 'general') as keyof typeof PHOTO_KIND_LABELS
                  ] ?? 'תיעוד כללי'}
                </span>
                <span className={`tag ${storagePath ? 'tag-success' : 'tag-warning'}`}>
                  {storagePath ? 'נשמרה באחסון' : 'נשמרה במכשיר'}
                </span>
              </div>

              {preview ? (
                <img
                  src={preview}
                  alt={getString(attachment, 'caption') || `תמונה ${index + 1}`}
                  style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 6, display: 'block' }}
                />
              ) : null}

              <TextField
                path={`attachments.${index}.caption`}
                label="כותרת לתמונה"
                disabled={readOnly}
                value={getString(attachment, 'caption')}
                onChange={(value) => setField(`attachments.${index}.caption`, value)}
              />

              <div className="row">
                <span className="small dim">
                  {(Number(getString(attachment, 'sizeBytes') || 0) / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={readOnly}
                  onClick={() => void remove(index, localBlobId)}
                >
                  הסרת התמונה
                </button>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
