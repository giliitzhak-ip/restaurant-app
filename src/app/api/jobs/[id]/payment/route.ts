import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { withSystem, withUser } from '@/lib/db';
import {
  agorotToShekels,
  assertPaymentProviderIsSafe,
  calculateFee,
  getPaymentProvider,
  selectFeeRule,
  shekelsToAgorot,
  type FeeRule,
} from '@/domains/payments';
import { logOperation, newRequestId } from '@/lib/logger';

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ action: z.enum(['authorize', 'capture']) });

/**
 * Payment lifecycle (spec §27, §28, §45).
 *
 * Non-negotiables enforced here:
 *   * The amount comes from job_assignments.price_ils — the price the
 *     PROVIDER committed to, read server-side. A client-supplied price is
 *     never accepted, and the request body carries no amount at all.
 *   * Commission is computed from platform_fees rows, not from a constant.
 *   * Every call to the gateway carries a deterministic idempotency key, so a
 *     double-tap or a retry cannot charge twice.
 *   * A job becomes PAID only after a SUCCESSFUL capture (spec §44: "Payment
 *     fails — do not mark PAID").
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const startedAt = Date.now();

  try {
    assertPaymentProviderIsSafe();

    const user = await requireUser();
    const { id } = paramsSchema.parse(await context.params);
    const { action } = await parseJson(request, bodySchema);

    // Read through the user's own connection so RLS confirms they are a party
    // to this job before anything financial happens.
    const context_ = await withUser(user.id, (db) =>
      db.one<{
        status: string;
        customer_id: string;
        provider_id: string | null;
        price_ils: string | null;
        category_id: string | null;
      }>(
        `select j.status::text as status, j.customer_id, a.provider_id,
                a.price_ils, j.category_id
           from jobs j
           left join job_assignments a on a.job_id = j.id
          where j.id = $1`,
        [id],
      ),
    );

    if (!context_) throw new ApiError('NOT_FOUND', 'העבודה לא נמצאה', 404);
    if (context_.customer_id !== user.id) {
      throw new ApiError('FORBIDDEN', 'רק הלקוח יכול לשלם עבור העבודה', 403);
    }
    if (!context_.provider_id || !context_.price_ils) {
      throw new ApiError('NO_ASSIGNMENT', 'אין שיבוץ לעבודה הזו', 409);
    }
    if (!['COMPLETED', 'AWAITING_CUSTOMER_CONFIRMATION', 'PAID'].includes(context_.status)) {
      throw new ApiError(
        'JOB_NOT_PAYABLE',
        'לא ניתן לשלם לפני שהעבודה הושלמה',
        409,
        { status: context_.status },
      );
    }

    const gross = shekelsToAgorot(Number(context_.price_ils));
    const provider = getPaymentProvider();

    const result = await withSystem(async (db) => {
      const feeRules = await db.many<{
        id: string; name: string; fee_type: FeeRule['feeType'];
        category_id: string | null; config: unknown; priority: number;
      }>(
        `select id, name, fee_type, category_id, config, priority
           from platform_fees
          where is_active
            and effective_from <= now()
            and (effective_to is null or effective_to > now())`,
      );

      const rule = selectFeeRule(
        feeRules.map((r) => ({
          id: r.id, name: r.name, feeType: r.fee_type,
          categoryId: r.category_id, config: r.config, priority: r.priority,
        })),
        context_.category_id,
      );
      const fee = calculateFee(gross, rule);

      let payment = await db.one<{
        id: string; status: string; external_ref: string | null; gross_amount: number;
      }>(
        `select id, status::text as status, external_ref, gross_amount
           from payments where job_id = $1`,
        [id],
      );

      if (!payment) {
        payment = await db.one(
          `insert into payments
             (job_id, customer_id, provider_id, gross_amount, platform_fee,
              provider_amount, provider_name, status, is_demo)
           values ($1,$2,$3,$4,$5,$6,$7,'REQUIRES_AUTHORIZATION',$8)
           returning id, status::text as status, external_ref, gross_amount`,
          [
            id, user.id, context_.provider_id, gross, fee.platformFee,
            fee.providerAmount, provider.name, !provider.isReal,
          ],
        );
      }
      if (!payment) throw new Error('Failed to create payment row');

      // Deterministic keys: the same logical operation always reuses one key,
      // which is what makes a retry safe.
      const idempotencyKey = `${action}:${payment.id}:${gross}`;

      if (action === 'authorize') {
        if (payment.status === 'AUTHORIZED' || payment.status === 'CAPTURED') {
          return { payment, fee, replayed: true };
        }

        const authorization = await provider.authorize({
          idempotencyKey,
          amount: gross,
          currency: 'ILS',
          jobId: id,
          customerId: user.id,
        });

        await db.query(
          `insert into payment_transactions
             (payment_id, operation, idempotency_key, amount, status,
              external_ref, error_code, error_message)
           values ($1,'authorize',$2,$3,$4,$5,$6,$7)
           on conflict (idempotency_key) do nothing`,
          [
            payment.id, idempotencyKey, gross,
            authorization.status, authorization.externalRef,
            authorization.errorCode ?? null, authorization.errorMessage ?? null,
          ],
        );

        if (!authorization.ok) {
          await db.query(
            `update payments set status = 'FAILED', failure_code = $2, failure_message = $3
              where id = $1`,
            [payment.id, authorization.errorCode ?? 'UNKNOWN', authorization.errorMessage ?? null],
          );
          return { payment, fee, failure: authorization };
        }

        await db.query(
          `update payments
              set status = 'AUTHORIZED', external_ref = $2, authorized_at = now()
            where id = $1`,
          [payment.id, authorization.externalRef],
        );
        return {
          payment: { ...payment, status: 'AUTHORIZED', external_ref: authorization.externalRef },
          fee,
        };
      }

      // ── capture ──
      if (payment.status === 'CAPTURED') return { payment, fee, replayed: true };
      if (payment.status !== 'AUTHORIZED' || !payment.external_ref) {
        throw new ApiError('NOT_AUTHORIZED', 'יש לאשר את התשלום לפני החיוב', 409);
      }

      const capture = await provider.capture({
        idempotencyKey,
        externalRef: payment.external_ref,
        amount: gross,
      });

      await db.query(
        `insert into payment_transactions
           (payment_id, operation, idempotency_key, amount, status,
            external_ref, error_code, error_message)
         values ($1,'capture',$2,$3,$4,$5,$6,$7)
         on conflict (idempotency_key) do nothing`,
        [
          payment.id, idempotencyKey, gross, capture.status,
          capture.externalRef, capture.errorCode ?? null, capture.errorMessage ?? null,
        ],
      );

      if (!capture.ok) {
        await db.query(
          `update payments set status = 'FAILED', failure_code = $2, failure_message = $3
            where id = $1`,
          [payment.id, capture.errorCode ?? 'UNKNOWN', capture.errorMessage ?? null],
        );
        // Job status is deliberately NOT advanced: a failed capture must
        // never look like a paid job.
        return { payment, fee, failure: capture };
      }

      await db.query(
        `update payments set status = 'CAPTURED', captured_at = now() where id = $1`,
        [payment.id],
      );
      await db.query(`update jobs set final_price_ils = $2 where id = $1`, [
        id, agorotToShekels(gross),
      ]);

      return { payment: { ...payment, status: 'CAPTURED' }, fee, captured: true };
    });

    // Only a genuine capture moves the job to PAID, and only the system may.
    if ('captured' in result && result.captured) {
      await withSystem(
        async (db) => {
          await db.query(
            `update jobs set status = 'PAID' where id = $1 and status = 'COMPLETED'`,
            [id],
          );
        },
        { actorRole: 'system', transitionReason: 'Payment captured' },
      );
    }

    if ('failure' in result && result.failure) {
      logOperation({
        requestId, userId: user.id, jobId: id,
        operation: `payments.${action}`, result: 'error',
        errorCode: result.failure.errorCode ?? 'PAYMENT_FAILED',
        durationMs: Date.now() - startedAt,
      });
      throw new ApiError(
        'PAYMENT_FAILED',
        result.failure.errorMessage ?? 'התשלום נכשל. נסו אמצעי תשלום אחר.',
        402,
        { code: result.failure.errorCode },
      );
    }

    logOperation({
      requestId, userId: user.id, jobId: id,
      operation: `payments.${action}`, result: 'ok',
      durationMs: Date.now() - startedAt,
      meta: { gross, platformFee: result.fee.platformFee, adapter: provider.name },
    });

    return ok({
      status: result.payment.status,
      grossAmount: gross,
      platformFee: result.fee.platformFee,
      providerAmount: result.fee.providerAmount,
      feeExplanation: result.fee.explanation,
      // The UI must be able to say plainly that no real money moved.
      isRealPayment: provider.isReal,
      adapter: provider.name,
    });
  } catch (error) {
    return handleError(error, 'payments', requestId, startedAt);
  }
}
