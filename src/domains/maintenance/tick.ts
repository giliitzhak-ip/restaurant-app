import { withSystem } from '@/lib/db';
import { expireAndEscalate } from '@/domains/matching/dispatch';
import { DOCUMENT_KINDS, type DocumentKind } from '@/domains/documents';
import { logOperation } from '@/lib/logger';

/**
 * Everything the platform has to do on a clock, in one place.
 *
 * There is exactly one entry point so the scheduler and the HTTP endpoint
 * cannot drift into doing different work — which is how "it runs in
 * production but not in the demo" happens. Every step is idempotent and each
 * one is isolated: a failure in the document sweep must not stop offers from
 * expiring, because a stuck offer is a customer waiting on a screen.
 */
export interface MaintenanceResult {
  expiredOffers: number;
  shiftsEnded: number;
  escalated: string[];
  /** Providers taken back to PENDING because their papers lapsed. */
  lapsedProviders: number;
  /** Providers warned that an approval is about to run out. */
  expiryWarnings: number;
  /** Rejected document files deleted under the retention rule. */
  purgedDocumentFiles: number;
  /** Steps that threw, by name. Empty on a clean tick. */
  failures: string[];
}

/** Warn this far ahead of a document's expiry. */
const EXPIRY_WARNING_DAYS = 30;

/** Keep a rejected document's bytes this long, then delete them. */
const REJECTED_RETENTION_DAYS = 90;

export async function runMaintenanceTick(): Promise<MaintenanceResult> {
  const result: MaintenanceResult = {
    expiredOffers: 0,
    shiftsEnded: 0,
    escalated: [],
    lapsedProviders: 0,
    expiryWarnings: 0,
    purgedDocumentFiles: 0,
    failures: [],
  };

  /**
   * Each step in its own try. The dispatch step is the one a customer is
   * watching, so it must not be able to be starved by a housekeeping job that
   * happens to be broken.
   */
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      result.failures.push(name);
      logOperation({
        operation: `maintenance.${name}`,
        result: 'error',
        meta: { message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      });
    }
  };

  await step('dispatch', async () => {
    const dispatch = await expireAndEscalate();
    result.expiredOffers = dispatch.expiredOffers;
    result.shiftsEnded = dispatch.shiftsEnded;
    result.escalated = dispatch.escalated;
  });

  await step('documents.lapsed', async () => {
    result.lapsedProviders = await suspendLapsedProviders();
  });

  await step('documents.warn', async () => {
    result.expiryWarnings = await warnExpiringDocuments();
  });

  await step('documents.purge', async () => {
    result.purgedDocumentFiles = await purgeRejectedDocumentFiles();
  });

  return result;
}

/**
 * A provider whose required licence or insurance has run out stops being
 * verified.
 *
 * Back to PENDING, not SUSPENDED. SUSPENDED means an admin took action
 * against someone; this is the platform admitting it no longer holds valid
 * papers. PENDING is exactly that statement, it puts them back in the
 * verification queue where the missing document is already displayed, and it
 * heals by itself: upload a current licence, an admin approves it, verify
 * again. Calling it a suspension would be a mark on a provider who did
 * nothing wrong except let a date pass.
 *
 * Also taken OFFLINE, because verification alone does not stop dispatch —
 * the candidate search requires VERIFIED, but a provider left ONLINE would
 * show themselves as working.
 */
async function suspendLapsedProviders(): Promise<number> {
  return withSystem(async (db) => {
    const lapsed = await db.many<{ provider_id: string; kinds: string[] }>(
      'select provider_id, kinds from providers_with_lapsed_documents()',
    );
    if (lapsed.length === 0) return 0;

    for (const row of lapsed) {
      await db.query(
        `update provider_profiles
            set verification = 'PENDING', state = 'OFFLINE', online_until = null
          where id = $1`,
        [row.provider_id],
      );

      const names = row.kinds
        .map((kind) => DOCUMENT_KINDS[kind as DocumentKind] ?? kind)
        .join(', ');

      await db.query(
        `insert into notifications (user_id, job_id, kind, title, body, payload)
         values ($1, null, 'document.expired', $2, $3, $4::jsonb)`,
        [
          row.provider_id,
          'תוקף המסמכים פג',
          `${names} — פג התוקף, ולכן החשבון חזר להמתנה לאימות ולא יישלחו עבודות. `
            + 'העלו מסמך בתוקף ונאשר אותו.',
          JSON.stringify({ kinds: row.kinds }),
        ],
      );

      logOperation({
        providerId: row.provider_id,
        operation: 'maintenance.documents.lapsed',
        result: 'ok',
        meta: { kinds: row.kinds.join(',') },
      });
    }

    return lapsed.length;
  });
}

/** Tell a provider before the date passes, not after. */
async function warnExpiringDocuments(): Promise<number> {
  return withSystem(async (db) => {
    const soon = await db.many<{
      document_id: string; provider_id: string; doc_type: string; expires_on: string;
    }>(
      `select document_id, provider_id, doc_type,
              to_char(expires_on, 'YYYY-MM-DD') as expires_on
         from documents_expiring_within($1)`,
      [EXPIRY_WARNING_DAYS],
    );
    if (soon.length === 0) return 0;

    for (const row of soon) {
      const name = DOCUMENT_KINDS[row.doc_type as DocumentKind] ?? row.doc_type;
      await db.query(
        `insert into notifications (user_id, job_id, kind, title, body, payload)
         values ($1, null, 'document.expiring', $2, $3, $4::jsonb)`,
        [
          row.provider_id,
          'מסמך עומד לפוג',
          `${name} בתוקף עד ${row.expires_on}. אחרי התאריך הזה החשבון יחזור `
            + 'להמתנה לאימות, אז כדאי להעלות מסמך מחודש מראש.',
          JSON.stringify({ documentId: row.document_id, expiresOn: row.expires_on }),
        ],
      );
      await db.query(
        'update provider_documents set expiry_warning_sent_at = now() where id = $1',
        [row.document_id],
      );
    }

    return soon.length;
  });
}

/**
 * Delete the bytes of long-rejected documents.
 *
 * The row and the reviewer's reason stay — that is the part worth keeping —
 * and the file, which is somebody's identity paper and evidence of nothing
 * once they have been told why it was refused, goes.
 */
async function purgeRejectedDocumentFiles(): Promise<number> {
  return withSystem(async (db) => {
    const row = await db.one<{ purge_expired_document_blobs: number }>(
      'select purge_expired_document_blobs($1)',
      [REJECTED_RETENTION_DAYS],
    );
    return row?.purge_expired_document_blobs ?? 0;
  });
}
