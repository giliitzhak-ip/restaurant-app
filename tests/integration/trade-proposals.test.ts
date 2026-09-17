import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { approveTradeProposal, rejectTradeProposal } from '@/domains/catalog/trade-proposals';
import { RuleBasedUnderstanding } from '@/domains/jobs/understanding';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { getPool, withSystem, withUser, type DbSession } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createAdmin,
  createCustomer,
  createJob,
  createProvider,
} from '../helpers/fixtures';

const LOC = { lat: 32.0742, lon: 34.7749 };

/** The route's audit callback, so the tested path is the real one. */
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
       (admin_id, action, target_type, target_id, reason, before_state, after_state)
     values (auth.uid(),$1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
    [action, targetType, targetId, reason ?? null, JSON.stringify(before), JSON.stringify(after)],
  );

/** File a proposal the way the provider endpoint does — as the provider. */
async function propose(
  providerId: string,
  name: string,
  priceIls: number | null = 320,
): Promise<string> {
  const row = await withUser(providerId, (db) =>
    db.one<{ id: string }>(
      `insert into trade_proposals (provider_id, proposed_name, price_ils)
       values ($1,$2,$3) returning id`,
      [providerId, name, priceIls],
    ),
  );
  return row!.id;
}

/** Classify a description the way the API does, with catalog phrases merged. */
async function classify(text: string) {
  const rows = await withSystem((db) =>
    db.many<{ category_slug: string; service_slug: string; strong_phrases: string[]; weak_phrases: string[] }>(
      `select c.slug as category_slug, s.slug as service_slug, s.strong_phrases, s.weak_phrases
         from services s join categories c on c.id = s.category_id
        where s.is_active and c.is_active
          and (cardinality(s.strong_phrases) > 0 or cardinality(s.weak_phrases) > 0)`,
    ),
  );
  const extra = rows.map((r) => ({
    category: r.category_slug,
    service: r.service_slug,
    strong: r.strong_phrases,
    weak: r.weak_phrases,
    urgency: 'normal' as const,
  }));
  return new RuleBasedUnderstanding(extra).understandSync(text);
}

/**
 * Provider-proposed trades (spec §17, §33).
 *
 * The catalog ships 7 categories and 23 services, which is not the set of
 * trades people do. A provider whose work is missing is not a weak candidate:
 * the candidate search INNER JOINs provider_categories, so with no declared
 * trade they are absent from every search, permanently.
 *
 * The property that matters most here is the one that is easy to fake:
 * approving a trade has to make the provider genuinely reachable. A service
 * created without trigger phrases is unreachable by any description, so the
 * provider would be told "approved" and still never receive a job.
 */
describe('provider-proposed trades', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('a pending proposal changes nothing: not classifiable, not matchable', async () => {
    const provider = await createProvider({ name: 'מציע', lat: 32.075, lon: 34.775 });
    await propose(provider.id, 'תיקון מכונות כביסה');

    // No description routes to it, because no service exists yet.
    const understood = await classify('מכונת הכביסה לא מתנקזת');
    expect(understood.service).toBeNull();

    // And nothing was added to the catalog or to the provider's trades.
    const { rows } = await adminPool().query<{ services: string; links: string }>(
      `select (select count(*) from services where slug like 'custom_%')::text as services,
              (select count(*) from provider_services ps
                join services s on s.id = ps.service_id
               where ps.provider_id = $1 and s.slug like 'custom_%')::text as links`,
      [provider.id],
    );
    expect(rows[0]).toEqual({ services: '0', links: '0' });
  });

  it('approval makes the trade reachable by a customer description AND dispatchable', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const provider = await createProvider({ name: 'טכנאי מכונות', lat: 32.075, lon: 34.775 });
    const proposalId = await propose(provider.id, 'תיקון מכונות כביסה', 320);

    const approved = await approveTradeProposal({
      proposalId,
      adminId: admin.id,
      categorySlug: 'electrical',
      phrases: ['מכונת כביסה', 'מכונת הכביסה', 'מייבש כבסים'],
      weakPhrases: ['כביסה'],
      audit,
    });

    expect(approved.categorySlug).toBe('electrical');

    // 1. A customer's own words now route to it — the half that is easy to
    //    leave broken, because everything else looks fine without it.
    const understood = await classify('מכונת הכביסה לא מתנקזת');
    expect(understood.category).toBe('electrical');
    expect(understood.service).toBe(approved.slug);

    // 2. And the provider is actually dispatched for a job in that category.
    const job = await createJob({
      customerId: customer.id,
      ...LOC,
      categorySlug: 'electrical',
      serviceSlug: 'short_circuit',
    });
    const outcome = await runDispatchWave(job);
    expect(outcome.offersCreated).toBeGreaterThan(0);
    const { rows } = await adminPool().query<{ n: string }>(
      'select count(*)::text as n from job_offers where job_id = $1 and provider_id = $2',
      [job, provider.id],
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('does not disturb the built-in classifications', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    const proposalId = await propose(provider.id, 'תיקון מכונות כביסה');
    await approveTradeProposal({
      proposalId, adminId: admin.id, categorySlug: 'electrical',
      phrases: ['מכונת כביסה'], audit,
    });

    for (const [text, category, service] of [
      ['יש לי נזילה מתחת לכיור', 'plumbing', 'sink_leak'],
      ['המזגן לא מקרר', 'air_conditioning', 'ac_not_cooling'],
      ['ננעלתי מחוץ לבית', 'locksmith', 'locked_out'],
      ['יש לי קצר חשמלי', 'electrical', 'short_circuit'],
    ] as const) {
      const understood = await classify(text);
      expect(understood.category, text).toBe(category);
      expect(understood.service, text).toBe(service);
    }
  });

  it('refuses to approve without phrases, because that would be a fake approval', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    const proposalId = await propose(provider.id, 'כיוון פסנתרים');

    await expect(
      approveTradeProposal({
        proposalId, adminId: admin.id, categorySlug: 'cleaning', phrases: [], audit,
      }),
    ).rejects.toThrow(/ביטוי/);

    // Nothing half-created.
    const { rows } = await adminPool().query<{ n: string }>(
      `select count(*)::text as n from services where slug like 'custom_%'`,
    );
    expect(rows[0]!.n).toBe('0');
  });

  it('SECURITY: a provider cannot approve their own proposal', async () => {
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    const proposalId = await propose(provider.id, 'תיקון מכונות כביסה');

    // Running the approval AS THE PROVIDER. RLS is the gate: `services` is
    // writable only where is_admin(), so the insert is refused rather than
    // this depending on a check in application code.
    await expect(
      approveTradeProposal({
        proposalId,
        adminId: provider.id,
        categorySlug: 'electrical',
        phrases: ['מכונת כביסה'],
        audit,
      }),
    ).rejects.toThrow();

    const { rows } = await adminPool().query<{ status: string }>(
      'select status::text as status from trade_proposals where id = $1',
      [proposalId],
    );
    expect(rows[0]!.status).toBe('PENDING');
  });

  it('SECURITY: a provider cannot write their own APPROVED status', async () => {
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    const proposalId = await propose(provider.id, 'תיקון מכונות כביסה');

    // trade_proposals deliberately has no UPDATE policy for the owner. An
    // "own row" update policy would have let them approve themselves.
    const affected = await withUser(provider.id, async (db) => {
      const result = await db.query(
        `update trade_proposals set status = 'APPROVED' where id = $1`,
        [proposalId],
      );
      return result.rowCount ?? 0;
    });
    expect(affected).toBe(0);
  });

  it('SECURITY: a provider cannot see or resolve another provider\'s proposal', async () => {
    const mine = await createProvider({ name: 'שלי', lat: 32.075, lon: 34.775 });
    const theirs = await createProvider({ name: 'שלהם', lat: 32.076, lon: 34.776 });
    const proposalId = await propose(theirs.id, 'תיקון מכונות כביסה');

    const visible = await withUser(mine.id, (db) =>
      db.many('select id from trade_proposals where id = $1', [proposalId]),
    );
    expect(visible).toHaveLength(0);
  });

  it('refuses a second pending proposal for the same trade', async () => {
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    await propose(provider.id, 'תיקון מכונות כביסה');

    // Case and surrounding space are not new information either.
    await expect(propose(provider.id, '  תיקון מכונות כביסה  ')).rejects.toThrow();
  });

  it('a rejection is recorded with its reason, and does not touch the catalog', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    const proposalId = await propose(provider.id, 'משהו שלא נאשר');

    await rejectTradeProposal({
      proposalId, adminId: admin.id, reason: 'כבר קיים בקטלוג תחת שם אחר', audit,
    });

    const { rows } = await adminPool().query<{
      status: string; review_note: string; reviewed_by: string; services: string;
    }>(
      `select tp.status::text as status, tp.review_note, tp.reviewed_by::text as reviewed_by,
              (select count(*) from services where slug like 'custom_%')::text as services
         from trade_proposals tp where tp.id = $1`,
      [proposalId],
    );
    expect(rows[0]!.status).toBe('REJECTED');
    expect(rows[0]!.review_note).toMatch(/כבר קיים/);
    expect(rows[0]!.reviewed_by).toBe(admin.id);
    expect(rows[0]!.services).toBe('0');

    // And it cannot then be approved.
    await expect(
      approveTradeProposal({
        proposalId, adminId: admin.id, categorySlug: 'cleaning', phrases: ['משהו'], audit,
      }),
    ).rejects.toThrow(/כבר טופלה/);
  });

  it('a proposal with no price yields no invented price guidance', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ lat: 32.075, lon: 34.775 });
    const proposalId = await propose(provider.id, 'שירות בלי מחיר', null);

    const approved = await approveTradeProposal({
      proposalId, adminId: admin.id, categorySlug: 'cleaning',
      phrases: ['שירות מיוחד'], audit,
    });

    const { rows } = await adminPool().query<{
      base: string | null; min: string | null; max: string | null;
    }>(
      'select base_price_ils as base, min_price_ils as min, max_price_ils as max from services where id = $1',
      [approved.serviceId],
    );
    // Absent, rather than a band invented around nothing.
    expect(rows[0]).toEqual({ base: null, min: null, max: null });
  });
});
