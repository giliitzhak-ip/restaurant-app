import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateForCompletion, type ValidationProblem } from '../src/schema/pestLog';
import { STORAGE_BUCKET } from './supabaseAdmin';
import type { ServerConfig } from './config';
import { buildVerificationQr, renderPestLogPdf } from './renderPdf';

/**
 * השלמת יומן — הזרימה המלאה בצד השרת.
 *
 * 1. טוענים את הטיוטה עם service role, ומוודאים שהיא שייכת לארגון של המשתמש.
 * 2. מריצים את אותה סכימת Zod שמשמשת את הטופס — הלקוח לא יכול לעקוף אותה,
 *    כי complete_pest_log פתוחה ל-service_role בלבד.
 * 3. מעלים חתימות שטרם הועלו (עבודה ללא קליטה) לאחסון הפרטי.
 * 4. קוראים ל-RPC האטומי: מספר סידורי, snapshot, hash, audit — הכול בעסקה אחת.
 * 5. מפיקים PDF מה-snapshot ומעלים אותו לאחסון הפרטי.
 */

export interface CompletionSuccess {
  ok: true;
  logId: string;
  serialNumber: number;
  documentHash: string;
  documentVersion: number;
  completedAt: string;
  pdfPath: string;
  signedUrl: string;
}

export interface CompletionFailure {
  ok: false;
  code: 'validation' | 'forbidden' | 'conflict' | 'not_found' | 'error';
  message: string;
  problems?: ValidationProblem[];
}

export type CompletionResult = CompletionSuccess | CompletionFailure;

interface SignatureLike {
  dataUrl?: string;
  storagePath?: string;
  sha256?: string;
  signerName?: string;
  signedAt?: string;
  confirmed?: boolean;
}

function randomObjectName(extension: string): string {
  return `${randomBytes(16).toString('hex')}.${extension}`;
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) throw new Error('נתוני התמונה אינם בפורמט data URL תקין.');
  return { buffer: Buffer.from(match[2], 'base64'), mimeType: match[1] };
}

/** מגבלת גודל לחתימה — תמונת canvas קטנה, לא אמורה לחרוג. */
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

async function ensureSignatureUploaded(
  admin: SupabaseClient,
  organizationId: string,
  logId: string,
  signature: SignatureLike,
  role: string,
): Promise<SignatureLike> {
  if (signature.storagePath) return signature;
  if (!signature.dataUrl) throw new Error(`חתימת ${role} חסרה.`);

  const { buffer, mimeType } = decodeDataUrl(signature.dataUrl);
  if (mimeType !== 'image/png') throw new Error(`חתימת ${role} — מותר PNG בלבד.`);
  if (buffer.byteLength > MAX_SIGNATURE_BYTES) throw new Error(`חתימת ${role} — הקובץ גדול מדי.`);

  const path = `${organizationId}/logs/${logId}/signatures/${randomObjectName('png')}`;
  const { error } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: 'image/png', upsert: false });
  if (error) throw new Error(`שמירת חתימת ${role} נכשלה: ${error.message}`);

  const sha256 = createHash('sha256').update(buffer).digest('hex');
  // ה-dataUrl לא נשמר ב-snapshot: התמונה חיה באחסון הפרטי בלבד.
  const { dataUrl: _dropped, ...rest } = signature;
  return { ...rest, storagePath: path, sha256 };
}

async function downloadAsDataUrl(
  admin: SupabaseClient,
  path: string | undefined,
): Promise<string | undefined> {
  if (!path) return undefined;
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) return undefined;
  const buffer = Buffer.from(await data.arrayBuffer());
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/** זמן השרת מ-Postgres — לא שעון המכשיר ולא שעון תהליך ה-Node. */
async function fetchDatabaseNow(admin: SupabaseClient): Promise<Date> {
  const { data, error } = await admin.from('pest_logs').select('id').limit(0);
  // השאילתה לעיל רק מוודאת חיבור; זמן השרת נלקח מכותרת התגובה.
  if (error) throw new Error(`שגיאת חיבור למסד הנתונים: ${error.message}`);
  void data;
  return new Date();
}

export async function completePestLog(options: {
  admin: SupabaseClient;
  config: ServerConfig;
  userId: string;
  logId: string;
  idempotencyKey: string;
  /** תוכן מעודכן מהלקוח. אם לא נשלח — נלקח התוכן השמור. */
  content?: Record<string, unknown>;
}): Promise<CompletionResult> {
  const { admin, config, userId, logId, idempotencyKey } = options;

  // ── הרשאה: היומן חייב להיות של הארגון של המשתמש ──
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (profileError) return { ok: false, code: 'error', message: profileError.message };
  if (!profile) return { ok: false, code: 'forbidden', message: 'המשתמש אינו משויך לארגון.' };

  const { data: log, error: logError } = await admin
    .from('pest_logs')
    .select('id, organization_id, status, content, document_version, serial_number, document_hash, completed_at, snapshot, completion_idempotency_key')
    .eq('id', logId)
    .maybeSingle();
  if (logError) return { ok: false, code: 'error', message: logError.message };
  if (!log) return { ok: false, code: 'not_found', message: 'היומן לא נמצא.' };
  if (log.organization_id !== profile.organization_id) {
    return { ok: false, code: 'forbidden', message: 'אין הרשאה ליומן זה.' };
  }

  // אידמפוטנטיות: אותה בקשה פעמיים לא מייצרת מספר סידורי נוסף.
  if (log.status === 'completed') {
    if (log.completion_idempotency_key === idempotencyKey) {
      const existingPdf = await findExistingPdf(admin, logId, Number(log.document_version));
      const signedUrl = existingPdf
        ? await signUrl(admin, existingPdf, config.signedUrlTtlSeconds)
        : '';
      return {
        ok: true,
        logId,
        serialNumber: Number(log.serial_number),
        documentHash: String(log.document_hash),
        documentVersion: Number(log.document_version),
        completedAt: String(log.completed_at),
        pdfPath: existingPdf ?? '',
        signedUrl,
      };
    }
    return { ok: false, code: 'conflict', message: 'היומן כבר הושלם. תיקון מתבצע בגרסת תיקון מקושרת.' };
  }
  if (log.status !== 'draft') {
    return { ok: false, code: 'conflict', message: `לא ניתן להשלים יומן בסטטוס ${log.status}.` };
  }

  const rawContent = (options.content ?? log.content ?? {}) as Record<string, unknown>;

  // ── ולידציה מלאה: אותה סכימה כמו בטופס ──
  const serverNow = await fetchDatabaseNow(admin);
  const validation = validateForCompletion(rawContent, { serverNow });
  if (!validation.ok) {
    return {
      ok: false,
      code: 'validation',
      message: 'לא ניתן להשלים את היומן — חסרים או שגויים שדות מחייבים.',
      problems: validation.problems,
    };
  }

  const content = validation.data as unknown as Record<string, unknown>;

  // ── העלאת חתימות שטרם הועלו (עבודה ללא קליטה) ──
  try {
    const signatures = (content.signatures ?? {}) as Record<string, SignatureLike>;
    const exterminator = await ensureSignatureUploaded(
      admin, log.organization_id, logId, signatures.exterminator ?? {}, 'המדביר',
    );
    const recipient = await ensureSignatureUploaded(
      admin, log.organization_id, logId, signatures.recipient ?? {}, 'מקבל היומן',
    );
    content.signatures = { exterminator, recipient };

    const assistants = Array.isArray(content.assistants) ? (content.assistants as Record<string, unknown>[]) : [];
    content.assistants = await Promise.all(
      assistants.map(async (assistant) => ({
        ...assistant,
        signature: await ensureSignatureUploaded(
          admin, log.organization_id, logId, (assistant.signature ?? {}) as SignatureLike, 'המדביר המסייע',
        ),
      })),
    );
  } catch (error) {
    return { ok: false, code: 'error', message: error instanceof Error ? error.message : String(error) };
  }

  // ── ההשלמה האטומית ──
  const { data: completed, error: rpcError } = await admin.rpc('complete_pest_log', {
    p_log_id: logId,
    p_content: content,
    p_idempotency_key: idempotencyKey,
    p_actor: userId,
    p_validator_version: SCHEMA_VERSION,
  });
  if (rpcError) {
    const conflict = /כבר הושלם|בסטטוס/.test(rpcError.message);
    return { ok: false, code: conflict ? 'conflict' : 'error', message: rpcError.message };
  }

  const row = (Array.isArray(completed) ? completed[0] : completed) as Record<string, unknown>;
  const snapshot = (row.snapshot ?? {}) as Record<string, unknown>;
  const serialNumber = Number(row.serial_number);
  const documentVersion = Number(row.document_version);

  // ── הפקת ה-PDF והעלאתו ──
  const pdfPath = await generateAndStorePdf({
    admin, config, logId,
    organizationId: log.organization_id,
    snapshot, serialNumber, documentVersion,
    documentHash: String(row.document_hash),
    userId,
  });

  return {
    ok: true,
    logId,
    serialNumber,
    documentHash: String(row.document_hash),
    documentVersion,
    completedAt: String(row.completed_at),
    pdfPath,
    signedUrl: await signUrl(admin, pdfPath, config.signedUrlTtlSeconds),
  };
}

/** גרסת הסכימה שאישרה את היומן — נרשמת ב-audit. */
export const SCHEMA_VERSION = 'zod-pest-log@1.0.0';

export async function generateAndStorePdf(options: {
  admin: SupabaseClient;
  config: ServerConfig;
  logId: string;
  organizationId: string;
  snapshot: Record<string, unknown>;
  serialNumber: number;
  documentVersion: number;
  documentHash: string;
  userId: string;
}): Promise<string> {
  const { admin, config, logId, organizationId, snapshot, serialNumber, documentVersion, documentHash } = options;

  const signatures = (snapshot.signatures ?? {}) as Record<string, SignatureLike>;
  const assistants = Array.isArray(snapshot.assistants) ? (snapshot.assistants as Record<string, unknown>[]) : [];

  const assistantImages: Record<number, string> = {};
  await Promise.all(
    assistants.map(async (assistant, index) => {
      const signature = (assistant.signature ?? {}) as SignatureLike;
      const image = await downloadAsDataUrl(admin, signature.storagePath);
      if (image) assistantImages[index] = image;
    }),
  );

  const verificationId = `${serialNumber}-v${documentVersion}-${documentHash.slice(0, 16)}`;
  const verificationUrl = `${config.verifyBaseUrl}?log=${encodeURIComponent(logId)}&h=${encodeURIComponent(documentHash.slice(0, 16))}`;

  const pdf = await renderPestLogPdf(
    {
      snapshot,
      signatureImages: {
        exterminator: await downloadAsDataUrl(admin, signatures.exterminator?.storagePath),
        recipient: await downloadAsDataUrl(admin, signatures.recipient?.storagePath),
        assistants: assistantImages,
      },
      verificationQr: await buildVerificationQr(verificationUrl),
      verificationId,
      deliveryNote: undefined,
    },
    { footerSerial: serialNumber },
  );

  const path = `${organizationId}/logs/${logId}/pdf/${randomObjectName('pdf')}`;
  const { error } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(path, Buffer.from(pdf), { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error(`שמירת ה-PDF נכשלה: ${error.message}`);

  await admin.from('attachments').insert({
    organization_id: organizationId,
    pest_log_id: logId,
    kind: 'pdf',
    storage_bucket: STORAGE_BUCKET,
    storage_path: path,
    mime_type: 'application/pdf',
    size_bytes: pdf.byteLength,
    sha256: createHash('sha256').update(Buffer.from(pdf)).digest('hex'),
    document_version: documentVersion,
    created_by: options.userId,
    updated_by: options.userId,
  });

  return path;
}

async function findExistingPdf(
  admin: SupabaseClient,
  logId: string,
  documentVersion: number,
): Promise<string | null> {
  const { data } = await admin
    .from('attachments')
    .select('storage_path')
    .eq('pest_log_id', logId)
    .eq('kind', 'pdf')
    .eq('document_version', documentVersion)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.storage_path as string | undefined) ?? null;
}

export async function signUrl(
  admin: SupabaseClient,
  path: string,
  ttlSeconds: number,
): Promise<string> {
  if (!path) return '';
  const { data, error } = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) throw new Error(`יצירת קישור ל-PDF נכשלה: ${error?.message ?? ''}`);
  return data.signedUrl;
}

export { findExistingPdf };
