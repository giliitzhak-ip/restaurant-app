import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireRole } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { invalidateSettingsCache } from '@/lib/settings';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { logOperation, newRequestId } from '@/lib/logger';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verify_provider'), providerId: z.uuid(), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal('suspend_provider'), providerId: z.uuid(), reason: z.string().min(3).max(500) }),
  z.object({ action: z.literal('reject_provider'), providerId: z.uuid(), reason: z.string().min(3).max(500) }),
  z.object({ action: z.literal('cancel_job'), jobId: z.uuid(), reason: z.string().min(3).max(500) }),
  z.object({ action: z.literal('redispatch_job'), jobId: z.uuid(), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal('update_setting'), key: z.string().min(1).max(100), value: z.unknown() }),
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

    const audit = async (
      action: string,
      targetType: string,
      targetId: string | null,
      before: unknown,
      after: unknown,
      reason?: string,
    ) => {
      await withUser(admin.id, async (db) => {
        await db.query(
          `insert into admin_actions
             (admin_id, action, target_type, target_id, reason,
              before_state, after_state, request_id)
           values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
          [
            admin.id, action, targetType, targetId, reason ?? null,
            JSON.stringify(before ?? null), JSON.stringify(after ?? null), requestId,
          ],
        );
      });
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

        const result = await withUser(admin.id, async (db) => {
          const before = await db.one<{ verification: string; state: string }>(
            `select verification::text as verification, state::text as state
               from provider_profiles where id = $1`,
            [body.providerId],
          );
          if (!before) throw new ApiError('NOT_FOUND', 'המקצוען לא נמצא', 404);

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
          return before;
        });

        await audit(
          body.action, 'provider', body.providerId,
          result, { verification: nextStatus },
          'reason' in body ? body.reason : undefined,
        );

        logOperation({
          requestId, userId: admin.id, providerId: body.providerId,
          operation: `admin.${body.action}`, result: 'ok',
        });
        return ok({ providerId: body.providerId, verification: nextStatus });
      }

      case 'cancel_job': {
        const before = await withUser(admin.id, (db) =>
          db.one<{ status: string }>(`select status::text as status from jobs where id = $1`, [
            body.jobId,
          ]),
        );
        if (!before) throw new ApiError('NOT_FOUND', 'העבודה לא נמצאה', 404);

        await withUser(
          admin.id,
          async (db) => {
            await db.query(
              `update jobs set status = 'CANCELLED_BY_SYSTEM',
                               cancellation_reason = $2, cancelled_by = $3
                where id = $1`,
              [body.jobId, body.reason, admin.id],
            );
          },
          { actorRole: 'admin', transitionReason: `Admin cancelled: ${body.reason}` },
        );

        await audit('cancel_job', 'job', body.jobId, before, { status: 'CANCELLED_BY_SYSTEM' }, body.reason);
        return ok({ jobId: body.jobId, status: 'CANCELLED_BY_SYSTEM' });
      }

      case 'redispatch_job': {
        const before = await withUser(admin.id, (db) =>
          db.one<{ status: string; dispatch_wave: number }>(
            `select status::text as status, dispatch_wave from jobs where id = $1`,
            [body.jobId],
          ),
        );
        if (!before) throw new ApiError('NOT_FOUND', 'העבודה לא נמצאה', 404);

        // Put the job back into SEARCHING through a legal transition, then
        // run a fresh wave.
        if (before.status !== 'SEARCHING') {
          await withUser(
            admin.id,
            async (db) => {
              await db.query(`update jobs set status = 'SEARCHING' where id = $1`, [body.jobId]);
            },
            { actorRole: 'admin', transitionReason: 'Admin re-dispatch' },
          );
        }

        const outcome = await runDispatchWave(body.jobId, { waveOverride: 1 });
        await audit('redispatch_job', 'job', body.jobId, before, outcome, body.reason);
        return ok(outcome);
      }

      case 'update_setting': {
        const before = await withUser(admin.id, (db) =>
          db.one<{ value: unknown }>('select value from settings where key = $1', [body.key]),
        );

        await withUser(admin.id, async (db) => {
          await db.query(
            `insert into settings (key, value, updated_by)
             values ($1, $2::jsonb, $3)
             on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
            [body.key, JSON.stringify(body.value), admin.id],
          );
        });

        // Matching reads settings through a short-lived cache; drop it so the
        // change takes effect on the next dispatch rather than up to 15s later.
        invalidateSettingsCache();

        await audit('update_setting', 'setting', null, before?.value ?? null, body.value, body.key);
        return ok({ key: body.key, value: body.value });
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
