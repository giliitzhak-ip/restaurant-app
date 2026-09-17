import type { NextRequest } from 'next/server';
import { route } from '@/lib/api/handler';
import { jsonOk, parseBody } from '@/lib/api/response';
import { requireSession } from '@/lib/api/guards';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { classifyJobSchema } from '@/lib/validation/jobs';
import { getJobClassifier } from '@/lib/services/ai/job-classifier';
import { getCatalogue } from '@/lib/services/catalogue';

/**
 * POST /api/ai/classify — free text in, category/service/urgency suggestion out.
 *
 * Backed today by a deterministic keyword classifier. Swapping in an LLM means
 * calling `setJobClassifier` with a different implementation of the same
 * interface; this route and the wizard do not change.
 */
export const POST = route(async (request: NextRequest) => {
  const { session } = await requireSession();
  checkRateLimit(`classify:${session.userId}`, RATE_LIMITS.search);

  const { text } = await parseBody(request, classifyJobSchema);
  const catalogue = await getCatalogue();

  const result = await getJobClassifier().classify({
    text,
    categorySlugs: catalogue.map((category) => category.slug),
    serviceSlugs: Object.fromEntries(
      catalogue.map((category) => [category.slug, category.services.map((s) => s.slug)]),
    ),
  });

  const category = result.categorySlug
    ? catalogue.find((entry) => entry.slug === result.categorySlug)
    : null;
  const service =
    category && result.serviceSlug
      ? category.services.find((entry) => entry.slug === result.serviceSlug)
      : null;

  return jsonOk({
    ...result,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    serviceId: service?.id ?? null,
    serviceName: service?.name ?? null,
  });
});
