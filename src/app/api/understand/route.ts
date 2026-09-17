import { z } from 'zod';
import { clientKey, fail, handleError, ok, parseJson } from '@/lib/api';
import { loadJobUnderstanding } from '@/domains/jobs/understanding-catalog';
import { withAnon } from '@/lib/db';
import { newRequestId } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

const bodySchema = z.object({ text: z.string().min(1).max(2000) });

/**
 * Classify free text into a category and service (spec §32).
 *
 * Read-only and side-effect free: it exists so the customer sees what we
 * understood BEFORE committing to a request, and can correct it.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const limit = await rateLimit(clientKey(request, 'understand'), 60, 60);
    if (!limit.allowed) {
      return fail('RATE_LIMITED', 'יותר מדי בקשות. נסו שוב בעוד רגע.', 429, requestId);
    }

    const { text } = await parseJson(request, bodySchema);
    // Same classifier the job-creation path uses, so the trade the customer
    // is shown before committing is the trade they actually get.
    const jobUnderstanding = await loadJobUnderstanding();
    const understanding = await jobUnderstanding.understand(text);

    // Attach the display names for whatever was recognised.
    const labels = await withAnon(async (db) => {
      if (!understanding.category) return null;
      return db.one<{ category_name: string; service_name: string | null; base_price_ils: string | null }>(
        `select c.name_he as category_name, s.name_he as service_name, s.base_price_ils
           from categories c
           left join services s on s.category_id = c.id and s.slug = $2
          where c.slug = $1`,
        [understanding.category, understanding.service ?? ''],
      );
    });

    return ok({
      understanding,
      categoryName: labels?.category_name ?? null,
      serviceName: labels?.service_name ?? null,
      guidePriceIls: labels?.base_price_ils ? Number(labels.base_price_ils) : null,
    });
  } catch (error) {
    return handleError(error, 'jobs.understand', requestId);
  }
}
