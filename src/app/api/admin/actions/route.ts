import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withSystem, withUser, type DbSession } from '@/lib/db';
import { invalidateSettingsCache } from '@/lib/settings';
import { approveTradeProposal, rejectTradeProposal } from '@/domains/catalog/trade-proposals';
import {
  assertDocumentsComplete,
  missingRequiredDocuments,
  DOCUMENT_KINDS,
  type DocumentKind,
} from '@/domains/documents';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { logOperation, newRequestId } from '@/lib/logger';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verify_provider'), providerId: z.uuid(), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal('suspend_provider'), providerId: z.uuid(), reason: z.string().min(3).max(500) }),
  z.object({ action: z.literal('reject_provider'), providerId: z.uuid(), reason: z.string().min(3).max(500) }),
  z.object({ action: z.literal('cancel_job'), jobId: z.uuid(), reason: z.string().min(3).max(500) }),
  z.object({ action: z.literal('redispatch_job'), jobId: z.uuid(), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal('update_setting'), key: z.string().min(1).max(100), value: z.unknown() }),

  /**
   * Resolve a provider-proposed trade.
   *
   * `phrases` is required, not optional, and that is the whole point. The
   * classifier routes a customer's description to a service by matching
   * phrasings; a service approved without any can never be reached by any
   * description, so the provider would be told "approved" and still never
   * receive a job. Requiring them at the type level makes the fake approval
   * unrepresentable.
   */
  z.object({
    action: z.literal('approve_trade'),
    proposalId: z.uuid(),
    /** Which existing category it becomes a service of. */
    categorySlug: z.string().min(1).max(60).optional(),
    /**
     * Or a category the admin is naming now, for a trade that genuinely is
     * none of the existing ones.
     *
     * The licence and insurance flags are required rather than defaulted,
     * because a category decides what a provider must produce before they
     * can be verified. Defaulting them to false would quietly let a new
     * regulated trade in without papers; defaulting them to true would demand
     * papers from a mover. Neither is a safe guess, so the reviewer states
     * it.
     */
    newCategory: z
      .object({
        nameHe: z.string().trim().min(2).max(60),
        requiresLicense: z.boolean(),
        requiresInsurance: z.boolean(),
        defaultRadiusKm: z.number().min(1).max(200).optional(),
        defaultDurationMin: z.number().int().min(15).max(600).optional(),
      })
      .optional(),
    /** Customer phrasings that should route here. At least one. */
    phrases: z.array(z.string().trim().min(2).max(80)).min(1).max(20),
    /** Supporting phrasings, never decisive on their own. */
    weakPhrases: z.array(z.string().trim().min(2).max(80)).max(20).optional(),
    /** Override the name the provider wrote, e.g. to normalise it. */
    serviceName: z.string().trim().min(2).max(80).optional(),
    urgency: z.enum(['low', 'normal', 'high', 'emergency']).optional(),
    durationMin: z.number().int().min(15).max(600).optional(),
    note: z.string().max(500).optional(),
  }).refine(
    (body) => (body.categorySlug === undefined) !== (body.newCategory === undefined),
    { message: 'יש לבחור תחום קיים או ליצור חדש — לא שניהם ולא אף אחד' },
  ),
  z.object({
    action: z.literal('reject_trade'),
    proposalId: z.uuid(),
    reason: z.string().min(3).max(500),
  }),

  /**
   * Resolve a document a provider submitted (spec §31).
   *
   * Separate from verifying the provider, and necessarily so: a document is
   * checked against its issuing registry, a provider is verified once every
   * document their trades require has been checked. Collapsing the two would
   * mean approving papers by approving a person.
   */
  z.object({
    action: z.literal('approve_document'),
    documentId: z.uuid(),
    /** Correct the expiry if the reviewer read a different date on the file. */
    expiresOn: z.iso.date().optional(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('reject_document'),
    documentId: z.uuid(),
    reason: z.string().min(3).max(500),
  }),
]);

/**
 * Admin actions (spec §33).
 *
 * EVERY action writes an admin_actions row with before and after state. The
 * audit row is written in the same transaction as the change, so an
 * unaudited admin action is not possible.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();

  try {
    const admin = await requireRole('admin');
    const body = await parseJson(request, bodySchema);

    /**
     * Write the audit row. Takes the CALLER'S transaction rather than opening
     * its own, so the record and the change commit together or not at all.
     *
     * An earlier version audited in a separate transaction. When the INSERT
     * was denied by RLS, verify_provider had already committed: the provider
     * was verified, no trail existed, and the caller was told it failed.
     * Spec §33 is not satisfiable by a best-effort log.
     */
    const audit = (
      db: DbSession,
      action: string,
      targetType: string,
      targetId: string | null,
      before: unknown,
      after: unknown,
      reason?: string,
    ) =>
      db.query(
        `insert into admin_actions
           (admin_id, action, target_type, target_id, reason,
            before_state, after_state, request_id)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
        [
          admin.id, action, targetType, targetId, reason ?? null,
          JSON.stringify(before ?? null), JSON.stringify(after ?? null), requestId,
        ],
      );

    /**
     * Tell a provider what was decided.
     *
     * Deliberately OUTSIDE the admin's transaction, and as the system.
     * `notifications` has no INSERT policy at all — it is a table users read
     * and the system writes — so an admin cannot insert one, and including it
     * in the transaction rolled the whole approval back: the action could
     * never succeed.
     *
     * Unlike the audit row, a notification is a courtesy rather than the
     * record of authority. Losing one must not undo a decision that was
     * correctly made and correctly audited, so a failure here is logged and
     * the decision stands — the provider still sees the status on their own
     * screen.
     */
    const notifyProvider = async (
      providerId: string,
      kind: string,
      title: string,
      text: string,
      payload: Record<string, unknown>,
    ) => {
      try {
        await withSystem((db) =>
          db.query(
            `insert into notifications (user_id, job_id, kind, title, body, payload)
             values ($1, null, $2, $3, $4, $5::jsonb)`,
            [providerId, kind, title, text, JSON.stringify(payload)],
          ),
        );
      } catch (error) {
        logOperation({
          requestId, userId: admin.id, operation: 'admin.notify', result: 'error',
          meta: {
            kind,
            message: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
          },
        });
      }
    };

    switch (body.action) {
      case 'verify_provider':
      case 'suspend_provider':
      case 'reject_provider': {
        const nextStatus =
          body.action === 'verify_provider'
            ? 'VERIFIED'
            : body.action === 'suspend_provider'
              ? 'SUSPENDED'
              : 'REJECTED';

        await withUser(admin.id, async (db) => {
          const before = await db.one<{ verification: string; state: string }>(
            `select verification::text as verification, state::text as state
               from provider_profiles where id = $1`,
            [body.providerId],
          );
          if (!before) throw new ApiError('NOT_FOUND', 'המקצוען לא נמצא', 404);

          /*
           * Verifying a licensed trade with no approved licence is the thing
           * the documents feature exists to prevent, so it is refused here
           * rather than merely discouraged in the UI. `requires_license` was
           * a sentence on a form until this call could fail.
           *
           * Suspending and rejecting are unaffected: taking someone out of
           * the market must never be blocked by missing paperwork.
           */
          if (nextStatus === 'VERIFIED') {
            await assertDocumentsComplete(db, body.providerId);
          }

          await db.query(
            `update provider_profiles
                set verification = $2::verification_status,
                    verified_at = case when $2 = 'VERIFIED' then now() else verified_at end,
                    state = case when $2 <> 'VERIFIED' then 'OFFLINE'::provider_state else state end
              where id = $1`,
            [body.providerId, nextStatus],
          );

          if ('reason' in body && body.reason) {
            await db.query(
              `insert into provider_admin_notes (provider_id, suspended_reason, note, author_id)
               values ($1,$2,$3,$4)`,
              [body.providerId, nextStatus === 'SUSPENDED' ? body.reason : null, body.reason, admin.id],
            );
          }

          await audit(
            db, body.action, 'provider', body.providerId,
            before, { verification: nextStatus },
            'reason' in body ? body.reason : undefined,
          );
        });

        logOperation({
          requestId, userId: admin.id, providerId: body.providerId,
          operation: `admin.${body.action}`, result: 'ok',
        });
        return ok({ providerId: body.providerId, verification: nextStatus });
      }

      case 'cancel_job': {
        await withUser(
          admin.id,
          async (db) => {
            const before = await db.one<{ status: string }>(
              `select status::text as status from jobs where id = $1`,
              [body.jobId],
            );
            if (!before) throw new ApiError('NOT_FOUND', 'העבודה לא נמצאה', 404);

            await db.query(
              `update jobs set status = 'CANCELLED_BY_SYSTEM',
                               cancellation_reason = $2, cancelled_by = $3
                where id = $1`,
              [body.jobId, body.reason, admin.id],
            );

            await audit(
              db, 'cancel_job', 'job', body.jobId,
              before, { status: 'CANCELLED_BY_SYSTEM' }, body.reason,
            );
          },
          { actorRole: 'admin', transitionReason: `Admin cancelled: ${body.reason}` },
        );

        return ok({ jobId: body.jobId, status: 'CANCELLED_BY_SYSTEM' });
      }

      case 'redispatch_job': {
        // The audit records the ORDER to re-dispatch, committed with the
        // status change. The dispatch itself runs afterwards in its own
        // transaction, so a dispatch failure still leaves a trail of who
        // ordered it.
        const before = await withUser(
          admin.id,
          async (db) => {
            const current = await db.one<{ status: string; dispatch_wave: number }>(
              `select status::text as status, dispatch_wave from jobs where id = $1`,
              [body.jobId],
            );
            if (!current) throw new ApiError('NOT_FOUND', 'העבודה לא נמצאה', 404);

            if (current.status !== 'SEARCHING') {
              await db.query(`update jobs set status = 'SEARCHING' where id = $1`, [body.jobId]);
            }

            await audit(
              db, 'redispatch_job', 'job', body.jobId,
              current, { status: 'SEARCHING', requestedWave: 1 }, body.reason,
            );
            return current;
          },
          { actorRole: 'admin', transitionReason: 'Admin re-dispatch' },
        );

        const outcome = await runDispatchWave(body.jobId, { waveOverride: 1 });
        return ok({ ...outcome, previousStatus: before.status });
      }

      case 'update_setting': {
        await withUser(admin.id, async (db) => {
          const before = await db.one<{ value: unknown }>(
            'select value from settings where key = $1',
            [body.key],
          );

          await db.query(
            `insert into settings (key, value, updated_by)
             values ($1, $2::jsonb, $3)
             on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
            [body.key, JSON.stringify(body.value), admin.id],
          );

          await audit(
            db, 'update_setting', 'setting', null,
            before?.value ?? null, body.value, body.key,
          );
        });

        // Matching reads settings through a short-lived cache; drop it so the
        // change takes effect on the next dispatch rather than up to 15s later.
        invalidateSettingsCache();

        return ok({ key: body.key, value: body.value });
      }

      /* ── Provider-proposed trades ──────────────────────────────────────
         The catalog write itself lives in @/domains/catalog/trade-proposals
         so it can be tested against a real database: the authorization, the
         atomicity and whether the approved trade is actually reachable are
         all properties of the transaction, not of this HTTP wrapper. */
      case 'approve_trade': {
        const result = await approveTradeProposal({
          proposalId: body.proposalId,
          adminId: admin.id,
          categorySlug: body.categorySlug,
          newCategory: body.newCategory,
          phrases: body.phrases,
          weakPhrases: body.weakPhrases,
          serviceName: body.serviceName,
          urgency: body.urgency,
          durationMin: body.durationMin,
          note: body.note,
          audit,
        });

        await notifyProvider(
          result.providerId,
          'trade.approved',
          'המקצוע שהצעת אושר',
          `${result.name} נוסף תחת ${result.categoryName}. מעכשיו אפשר לקבל עבודות בו.`,
          {
            serviceId: result.serviceId,
            categorySlug: result.categorySlug,
            categoryCreated: result.categoryCreated,
          },
        );

        logOperation({
          requestId, userId: admin.id,
          operation: 'admin.approve_trade', result: 'ok',
          meta: {
            proposalId: body.proposalId, slug: result.slug,
            phrases: body.phrases.length,
            categorySlug: result.categorySlug,
            categoryCreated: result.categoryCreated,
          },
        });

        return ok(result);
      }

      /* ── Provider documents ───────────────────────────────────────────
         Only an admin may UPDATE provider_documents — the table has no
         owner UPDATE policy at all — so a provider reaching this code path
         writes nothing. */
      case 'approve_document':
      case 'reject_document': {
        const approving = body.action === 'approve_document';

        const resolved = await withUser(admin.id, async (db) => {
          const before = await db.one<{
            provider_id: string; doc_type: string; status: string;
            expires_on: string | null; provider_name: string;
          }>(
            `select d.provider_id, d.doc_type, d.status::text as status,
                    d.expires_on, p.full_name as provider_name
               from provider_documents d
               join profiles p on p.id = d.provider_id
              where d.id = $1`,
            [body.documentId],
          );
          if (!before) throw new ApiError('NOT_FOUND', 'המסמך לא נמצא', 404);
          if (before.status !== 'PENDING') {
            throw new ApiError('ALREADY_RESOLVED', 'המסמך כבר נבדק', 409, {
              status: before.status,
            });
          }

          const expiresOn = approving && 'expiresOn' in body && body.expiresOn
            ? body.expiresOn
            : before.expires_on;

          // An approval that is already expired is not an approval, and
          // provider_missing_documents would ignore it — so it fails here,
          // where the reviewer can see why, rather than silently.
          if (approving && expiresOn) {
            const today = new Date().toISOString().slice(0, 10);
            if (expiresOn < today) {
              throw new ApiError(
                'DOCUMENT_EXPIRED',
                'תוקף המסמך פג — אין לאשר מסמך שאינו בתוקף',
                422,
              );
            }
          }

          await db.query(
            `update provider_documents
                set status = $2::verification_status,
                    reviewed_by = $3, reviewed_at = now(),
                    review_notes = $4,
                    expires_on = $5
              where id = $1`,
            [
              body.documentId,
              approving ? 'VERIFIED' : 'REJECTED',
              admin.id,
              approving ? ('note' in body ? body.note ?? null : null) : body.reason,
              expiresOn,
            ],
          );

          // What the provider still owes AFTER this decision, so the response
          // can tell the reviewer whether verification is now possible.
          const stillMissing = await missingRequiredDocuments(db, before.provider_id);

          await audit(
            db, body.action, 'provider_document', body.documentId,
            { status: 'PENDING', docType: before.doc_type },
            {
              status: approving ? 'VERIFIED' : 'REJECTED',
              docType: before.doc_type,
              providerId: before.provider_id,
              stillMissing,
            },
            approving
              ? ('note' in body ? body.note : undefined)
              : body.reason,
          );

          return { ...before, missing: stillMissing };
        });

        const kindName = DOCUMENT_KINDS[resolved.doc_type as DocumentKind] ?? resolved.doc_type;
        await notifyProvider(
          resolved.provider_id,
          approving ? 'document.approved' : 'document.rejected',
          approving ? 'המסמך אושר' : 'המסמך לא אושר',
          approving
            ? resolved.missing.length === 0
              ? `${kindName} אושר. כל המסמכים הנדרשים הושלמו.`
              : `${kindName} אושר. עוד חסר: ${resolved.missing
                  .map((kind) => DOCUMENT_KINDS[kind as DocumentKind] ?? kind)
                  .join(', ')}.`
            : `${kindName}: ${body.reason}`,
          { documentId: body.documentId, docType: resolved.doc_type },
        );

        logOperation({
          requestId, userId: admin.id, providerId: resolved.provider_id,
          operation: `admin.${body.action}`, result: 'ok',
          // No document number and no filename: this is the one place that
          // data must not end up.
          meta: { docType: resolved.doc_type, stillMissing: resolved.missing.length },
        });

        return ok({
          documentId: body.documentId,
          status: approving ? 'VERIFIED' : 'REJECTED',
          providerId: resolved.provider_id,
          stillMissing: resolved.missing,
        });
      }

      case 'reject_trade': {
        const { providerId } = await rejectTradeProposal({
          proposalId: body.proposalId,
          adminId: admin.id,
          reason: body.reason,
          audit,
        });

        // A rejection the provider cannot see is a rejection they re-submit,
        // so the reason travels with it.
        await notifyProvider(
          providerId,
          'trade.rejected',
          'המקצוע שהצעת לא אושר',
          body.reason,
          { proposalId: body.proposalId },
        );

        logOperation({
          requestId, userId: admin.id,
          operation: 'admin.reject_trade', result: 'ok',
          meta: { proposalId: body.proposalId },
        });

        return ok({ proposalId: body.proposalId, status: 'REJECTED' });
      }
    }
  } catch (error) {
    return handleError(error, 'admin.action', requestId);
  }
}

/** Recent admin actions, for the audit view. */
export async function GET() {
  const requestId = newRequestId();
  try {
    const admin = await requireRole('admin');
    const actions = await withUser(admin.id, (db) =>
      db.many(
        `select a.id, a.action, a.target_type, a.target_id, a.reason,
                a.before_state, a.after_state, a.created_at, p.full_name as admin_name
           from admin_actions a
           join profiles p on p.id = a.admin_id
          order by a.created_at desc
          limit 100`,
      ),
    );
    return ok({ actions });
  } catch (error) {
    return handleError(error, 'admin.actions.list', requestId);
  }
}
