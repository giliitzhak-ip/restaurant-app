import { withSystem, type DbSession } from '@/lib/db';
import {
  JobUnderstandingService,
  RuleBasedUnderstanding,
  type ServiceRule,
  type Urgency,
} from '@/domains/jobs/understanding';

/**
 * Classifier rules that live in the catalog rather than in code.
 *
 * When an admin approves a provider-proposed trade, they attach the phrasings
 * a customer would actually use. Without that step the new service exists and
 * is unreachable: no description would ever route to it, the provider would be
 * told "approved" and would still never receive a job. So the classifier reads
 * those phrases and merges them with its built-in rules.
 *
 * Cached briefly, for the same reason the settings cache exists: this is read
 * on every classification and the catalog changes a few times a week. An
 * approval invalidates it immediately, so a reviewer sees the effect of their
 * own decision without waiting.
 */
const CACHE_MS = 30_000;

let cached: { rules: ServiceRule[]; at: number } | null = null;

interface CatalogRuleRow {
  category_slug: string;
  service_slug: string;
  urgency: Urgency | null;
  strong_phrases: string[] | null;
  weak_phrases: string[] | null;
}

async function readCatalogRules(db: DbSession): Promise<ServiceRule[]> {
  const rows = await db.many<CatalogRuleRow>(
    `select c.slug as category_slug,
            s.slug as service_slug,
            s.default_urgency::text as urgency,
            s.strong_phrases,
            s.weak_phrases
       from services s
       join categories c on c.id = s.category_id
      where s.is_active
        and c.is_active
        and (cardinality(s.strong_phrases) > 0 or cardinality(s.weak_phrases) > 0)`,
  );

  return rows.map((row) => ({
    category: row.category_slug,
    service: row.service_slug,
    strong: row.strong_phrases ?? [],
    weak: row.weak_phrases ?? [],
    urgency: row.urgency ?? 'normal',
  }));
}

/** Drop the cache — called when an admin changes the catalog. */
export function invalidateCatalogRulesCache(): void {
  cached = null;
}

/**
 * The classifier the API routes use: built-in rules plus whatever the catalog
 * adds. A database failure here degrades to the built-in rules rather than
 * failing the request, because a customer describing a burst pipe should not
 * be blocked by a catalog read — but it is logged rather than swallowed,
 * since silently losing the approved trades is exactly the kind of quiet
 * degradation that hides for weeks.
 */
export async function loadJobUnderstanding(): Promise<JobUnderstandingService> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return new JobUnderstandingService(new RuleBasedUnderstanding(cached.rules));
  }

  const rules = await withSystem(readCatalogRules);
  cached = { rules, at: now };
  return new JobUnderstandingService(new RuleBasedUnderstanding(rules));
}
