import { ApiError } from '@/lib/api';
import type { DbSession } from '@/lib/db';
import { DOCUMENT_KINDS, type DocumentKind } from './storage';

/**
 * Which required documents a provider still owes.
 *
 * Thin by design: the rule lives in `provider_missing_documents` in migration
 * 0031, where both the verification gate and the admin queue read the same
 * answer. A second implementation in TypeScript is how the queue and the gate
 * would come to disagree, and a reviewer would see "ready" on a provider the
 * verify action then refuses.
 */
export async function missingRequiredDocuments(
  db: DbSession,
  providerId: string,
): Promise<string[]> {
  const row = await db.one<{ missing: string[] }>(
    'select provider_missing_documents($1) as missing',
    [providerId],
  );
  return row?.missing ?? [];
}

/**
 * Refuse to proceed while a required document is missing or expired.
 *
 * This is what makes `requires_license` more than a sentence on a form. It
 * guards verification only: suspending or rejecting a provider must never be
 * blocked by paperwork, because taking somebody out of the market is the
 * action you least want to be unable to take.
 */
export async function assertDocumentsComplete(
  db: DbSession,
  providerId: string,
): Promise<void> {
  const missing = await missingRequiredDocuments(db, providerId);
  if (missing.length === 0) return;

  throw new ApiError(
    'DOCUMENTS_REQUIRED',
    `לא ניתן לאמת: חסרים מסמכים מאושרים — ${missing
      .map((kind) => DOCUMENT_KINDS[kind as DocumentKind] ?? kind)
      .join(', ')}`,
    409,
    { missing },
  );
}
