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

  /* ── A trade that is none of the seven categories ──────────────────────
     Before this the reviewer's only options were to reject something real or
     to file it somewhere wrong, and wrong is not cosmetic: the category
     carries the working radius, the default duration and whether a licence
     and insurance are demanded before verification. */
  it('approval can create the category, with the flags the reviewer stated', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const provider = await createProvider({ name: 'מוביל', lat: 32.075, lon: 34.775 });
    const proposalId = await propose(provider.id, 'הובלת דירה', 1200);

    const approved = await approveTradeProposal({
      proposalId,
      adminId: admin.id,
      newCategory: {
        nameHe: 'הובלות',
        requiresLicense: false,
        requiresInsurance: true,
        defaultRadiusKm: 60,
      },
      phrases: ['הובלת דירה', 'להעביר דירה', 'מוביל'],
      audit,
    });

    expect(approved.categoryCreated).toBe(true);
    expect(approved.categoryName).toBe('הובלות');

    const { rows } = await adminPool().query<{
      slug: string; name_he: string; name_en: string | null;
      requires_license: boolean; requires_insurance: boolean; requires_documents: boolean;
      default_radius_km: string; required_skills: string[]; sort_order: number;
    }>(
      `select slug, name_he, name_en, requires_license, requires_insurance,
              requires_documents, default_radius_km, required_skills, sort_order
         from categories where slug = $1`,
      [approved.categorySlug],
    );
    const category = rows[0]!;
    expect(category.name_he).toBe('הובלות');
    // No English name was invented for it (migration 0029).
    expect(category.name_en).toBeNull();
    expect(category.requires_license).toBe(false);
    expect(category.requires_insurance).toBe(true);
    // Insurance alone is still a document to produce before verification.
    expect(category.requires_documents).toBe(true);
    expect(Number(category.default_radius_km)).toBe(60);
    // A category with no required skill scores everyone in it the same
    // neutral 80, so a new trade gets one of its own.
    expect(category.required_skills).toEqual([approved.categorySlug]);
    // It sorts after the seven shipped ones rather than jumping the list.
    expect(category.sort_order).toBeGreaterThan(70);

    // And the whole point: a customer describing the work reaches this
    // provider through a real dispatch.
    const understood = await classify('אני צריך להעביר דירה');
    expect(understood.category).toBe(approved.categorySlug);
    expect(understood.service).toBe(approved.slug);

    const jobId = await createJob({
      customerId: customer.id, ...LOC,
      categorySlug: approved.categorySlug, serviceSlug: approved.slug,
    });
    const outcome = await runDispatchWave(jobId);
    expect(outcome.offersCreated).toBeGreaterThan(0);
  });

  it('a second proposal under the same name joins that category, not a twin', async () => {
    const admin = await createAdmin();
    const first = await createProvider({ name: 'מוביל א', lat: 32.075, lon: 34.775 });
    const second = await createProvider({ name: 'מוביל ב', lat: 32.076, lon: 34.776 });

    const one = await approveTradeProposal({
      proposalId: await propose(first.id, 'הובלת דירה', 1200),
      adminId: admin.id,
      newCategory: { nameHe: 'הובלות', requiresLicense: false, requiresInsurance: true },
      phrases: ['הובלת דירה'],
      audit,
    });

    // Same name, differently cased and padded — still the same trade.
    const two = await approveTradeProposal({
      proposalId: await propose(second.id, 'פינוי מחסן', 600),
      adminId: admin.id,
      newCategory: { nameHe: '  הובלות ', requiresLicense: true, requiresInsurance: false },
      phrases: ['פינוי מחסן'],
      audit,
    });

    expect(two.categoryCreated).toBe(false);
    expect(two.categorySlug).toBe(one.categorySlug);

    const { rows } = await adminPool().query<{ n: string }>(
      `select count(*)::text as n from categories
        where is_active and lower(btrim(name_he)) = 'הובלות'`,
    );
    expect(rows[0]!.n).toBe('1');
  });

  it('refuses both a category and a new one, and refuses neither', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ name: 'מציע', lat: 32.075, lon: 34.775 });

    await expect(
      approveTradeProposal({
        proposalId: await propose(provider.id, 'הובלת פסנתר', 900),
        adminId: admin.id,
        categorySlug: 'plumbing',
        newCategory: { nameHe: 'הובלות', requiresLicense: false, requiresInsurance: false },
        phrases: ['הובלת פסנתר'],
        audit,
      }),
    ).rejects.toThrow(/CATEGORY_AMBIGUOUS|תחום/);

    await expect(
      approveTradeProposal({
        proposalId: await propose(provider.id, 'הובלת כספת', 900),
        adminId: admin.id,
        phrases: ['הובלת כספת'],
        audit,
      }),
    ).rejects.toThrow(/CATEGORY_REQUIRED|תחום/);
  });

  /* The bug this asserts against was invisible: the provider was findable,
     and then ranked ~18 points below every competitor forever, for a skill
     the approval had just asserted they have. */
  it('an approved provider holds the category skill, so skill match is not zero', async () => {
    const admin = await createAdmin();
    const customer = await createCustomer();
    const provider = await createProvider({ name: 'טכנאי', lat: 32.075, lon: 34.775 });

    const approved = await approveTradeProposal({
      proposalId: await propose(provider.id, 'תיקון תנור', 400),
      adminId: admin.id,
      categorySlug: 'electrical',
      phrases: ['תיקון תנור', 'התנור לא מתחמם'],
      audit,
    });

    const { rows: skillRows } = await adminPool().query<{ skills: string[] }>(
      `select pc.skills from provider_categories pc
         join categories c on c.id = pc.category_id
        where pc.provider_id = $1 and c.slug = 'electrical'`,
      [provider.id],
    );
    expect(skillRows[0]!.skills).toContain('electrical');

    const jobId = await createJob({
      customerId: customer.id, ...LOC,
      categorySlug: 'electrical', serviceSlug: approved.slug,
    });
    await runDispatchWave(jobId);

    const { rows } = await adminPool().query<{ skill_score: string }>(
      `select skill_score::text from matching_events
        where job_id = $1 and provider_id = $2`,
      [jobId, provider.id],
    );
    expect(Number(rows[0]!.skill_score)).toBe(100);
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
