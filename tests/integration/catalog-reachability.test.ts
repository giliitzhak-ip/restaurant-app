import { afterAll, describe, expect, it } from 'vitest';
import { RuleBasedUnderstanding, type ServiceRule } from '@/domains/jobs/understanding';
import { getPool, withSystem } from '@/lib/db';
import { closeAdminPool } from '../helpers/fixtures';

/**
 * Every service in the catalog must be reachable by a customer's words.
 *
 * This is the property that makes a catalog entry real. A service the
 * classifier can never route to is worse than an absent one: the providers who
 * price it believe they are reachable, the reviewer believes coverage
 * improved, and no customer ever lands there. It cannot be seen by reading
 * the row — only by classifying.
 *
 * So: for every service that carries trigger phrases, each of those phrases
 * must actually resolve to that service. Not "to something plausible" — to
 * that one. A phrase that loses to a different rule is a phrase that does
 * nothing, and a phrase that wins for the wrong service is worse than doing
 * nothing.
 */

async function catalogRules(): Promise<ServiceRule[]> {
  const rows = await withSystem((db) =>
    db.many<{
      category_slug: string; service_slug: string; urgency: string;
      strong_phrases: string[]; weak_phrases: string[];
    }>(
      `select c.slug as category_slug, s.slug as service_slug,
              s.default_urgency::text as urgency, s.strong_phrases, s.weak_phrases
         from services s join categories c on c.id = s.category_id
        where s.is_active and c.is_active
          and (cardinality(s.strong_phrases) > 0 or cardinality(s.weak_phrases) > 0)`,
    ),
  );
  return rows.map((row) => ({
    category: row.category_slug,
    service: row.service_slug,
    strong: row.strong_phrases,
    weak: row.weak_phrases,
    urgency: row.urgency as ServiceRule['urgency'],
  }));
}

describe('catalog reachability', () => {
  afterAll(async () => {
    await closeAdminPool();
    await getPool().end();
  });

  it('every trigger phrase resolves to the service that declares it', async () => {
    const rules = await catalogRules();
    const classifier = new RuleBasedUnderstanding(rules);

    // Sanity: an empty rule set would make this pass vacuously.
    expect(rules.length).toBeGreaterThan(30);

    const misrouted: string[] = [];
    for (const rule of rules) {
      for (const phrase of rule.strong) {
        const result = classifier.understandSync(phrase);
        if (result.service !== rule.service) {
          misrouted.push(
            `"${phrase}" (${rule.service}) → ${result.service ?? 'nothing'}`,
          );
        }
      }
    }

    expect(misrouted).toEqual([]);
  });

  it('a realistic sentence around each phrase still reaches it', async () => {
    // A phrase in isolation is the easy case. Real descriptions carry filler,
    // and token matching has to survive it.
    const rules = await catalogRules();
    const classifier = new RuleBasedUnderstanding(rules);

    const misrouted: string[] = [];
    for (const rule of rules) {
      const phrase = rule.strong[0];
      if (!phrase) continue;
      const sentence = `שלום, אני צריך ${phrase} בהקדם בבקשה`;
      const result = classifier.understandSync(sentence);
      if (result.service !== rule.service) {
        misrouted.push(`"${sentence}" (${rule.service}) → ${result.service ?? 'nothing'}`);
      }
    }

    expect(misrouted).toEqual([]);
  });

  it('the original catalog still classifies exactly as before', async () => {
    const classifier = new RuleBasedUnderstanding(await catalogRules());

    // The 23 curated services are matched by the built-in TypeScript rules.
    // Adding 39 services with phrases must not move any of them.
    const canonical: [string, string, string][] = [
      ['יש לי נזילה מתחת לכיור', 'plumbing', 'sink_leak'],
      ['הצינור התפוצץ ויש הצפה', 'plumbing', 'burst_pipe'],
      ['יש סתימה בצינור', 'plumbing', 'blocked_drain'],
      ['האסלה לא עובדת', 'plumbing', 'toilet_repair'],
      ['אין מים חמים מהדוד', 'plumbing', 'boiler_issue'],
      ['יש לי קצר חשמלי', 'electrical', 'short_circuit'],
      ['הפסקת חשמל בדירה', 'electrical', 'power_outage'],
      ['תיקון שקע', 'electrical', 'socket_repair'],
      ['המזגן לא מקרר', 'air_conditioning', 'ac_not_cooling'],
      ['המזגן מטפטף מים', 'air_conditioning', 'ac_leaking'],
      ['ננעלתי מחוץ לבית', 'locksmith', 'locked_out'],
      ['ננעלתי מחוץ לרכב', 'locksmith', 'car_lockout'],
      ['יש לי תיקנים במטבח', 'pest_control', 'cockroaches'],
      ['יש נמלים בכל הבית', 'pest_control', 'ants'],
      ['צריך ניקיון אחרי שיפוץ', 'cleaning', 'post_renovation'],
      ['גיזום עצים בגינה', 'gardening', 'tree_pruning'],
    ];

    const moved: string[] = [];
    for (const [text, category, service] of canonical) {
      const result = classifier.understandSync(text);
      if (result.category !== category || result.service !== service) {
        moved.push(`"${text}" expected ${service}, got ${result.service ?? 'nothing'}`);
      }
    }
    expect(moved).toEqual([]);
  });

  it('no shipped service is left without a way to be found', async () => {
    // The migration asserts this too; asserting it here means a later
    // migration cannot quietly add a silent service.
    const rows = await withSystem((db) =>
      db.many<{ slug: string }>(
        `select s.slug
           from services s
          where s.is_active
            and s.slug not like 'custom_%'
            and cardinality(s.strong_phrases) = 0
            and s.slug not in (
              'boiler_issue','burst_pipe','toilet_repair','blocked_drain','sink_leak',
              'light_fixture','socket_repair','short_circuit','power_outage',
              'ac_install','ac_leaking','ac_service','ac_not_cooling',
              'car_lockout','lock_replacement','locked_out',
              'rodents','ants','cockroaches',
              'post_renovation','apartment_cleaning',
              'tree_pruning','garden_maintenance'
            )`,
      ),
    );
    expect(rows.map((r) => r.slug)).toEqual([]);
  });
});
