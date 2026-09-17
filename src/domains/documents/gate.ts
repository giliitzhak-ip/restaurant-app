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

/**
 * A verified provider must have a phone number we have actually reached.
 *
 * The whole product rests on it twice over: it is the number a customer is
 * told to call when the provider is at the door, and the number the delivery
 * outbox texts when a job appears. An unchecked string in that field means a
 * provider who never hears about work and a customer who cannot reach
 * anybody, and neither failure announces itself — the account simply looks
 * quiet.
 *
 * Verification is the right place to insist, because it is the moment a human
 * is already looking at this provider and deciding whether the platform
 * vouches for them.
 */
export async function assertPhoneVerified(
  db: DbSession,
  providerId: string,
): Promise<void> {
  const row = await db.one<{ phone: string | null; verified: boolean }>(
    `select phone, phone_verified_at is not null as verified
       from profiles where id = $1`,
    [providerId],
  );
  if (!row?.phone) {
    throw new ApiError('PHONE_REQUIRED', 'לא ניתן לאמת: אין מספר טלפון בחשבון', 409);
  }
  if (!row.verified) {
    throw new ApiError(
      'PHONE_NOT_VERIFIED',
      'לא ניתן לאמת: מספר הטלפון לא אומת. המקצוען צריך לאשר קוד שנשלח אליו.',
      409,
    );
  }
}
