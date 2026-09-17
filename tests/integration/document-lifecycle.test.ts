import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getDocumentStorage } from '@/domains/documents';
import { runMaintenanceTick } from '@/domains/maintenance/tick';
import { getPool, withUser } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createAdmin,
  createProvider,
} from '../helpers/fixtures';

/**
 * What happens to a document after it is approved (migration 0032).
 *
 * The gate added in 0031 runs at the moment an admin verifies somebody, and
 * nothing looked at the document again afterwards — so a provider verified
 * today with a licence expiring next month stayed VERIFIED for ever and kept
 * receiving work on a licence that no longer existed. A door with no lock
 * behind it.
 */

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n', 'ascii'), Buffer.alloc(32, 0x20)]);

async function approvedDocument(
  providerId: string,
  adminId: string,
  docType: 'license' | 'insurance',
  expiresOn: string | null,
): Promise<string> {
  const storage = getDocumentStorage();
  const id = randomUUID();
  const storagePath = storage.locate(id);
  await withUser(providerId, async (db) => {
    await db.one(
      `insert into provider_documents
         (id, provider_id, doc_type, storage_path, content_type, size_bytes, expires_on)
       values ($1,$2,$3,$4,'application/pdf',$5,$6) returning id`,
      [id, providerId, docType, storagePath, PDF.length, expiresOn],
    );
    await storage.put(db, { documentId: id, storagePath, bytes: PDF, contentType: 'application/pdf' });
  });
  await withUser(adminId, (db) =>
    db.query(
      `update provider_documents
          set status = 'VERIFIED', reviewed_by = $2, reviewed_at = now() where id = $1`,
      [id, adminId],
    ),
  );
  return id;
}

const verified = async (providerId: string) => {
  await adminPool().query(
    `update provider_profiles set verification = 'VERIFIED', state = 'ONLINE' where id = $1`,
    [providerId],
  );
};

const stateOf = async (providerId: string) => {
  const { rows } = await adminPool().query<{ verification: string; state: string }>(
    `select verification::text as verification, state::text as state
       from provider_profiles where id = $1`,
    [providerId],
  );
  return rows[0]!;
};

const notificationsFor = async (providerId: string, kind: string) => {
  const { rows } = await adminPool().query<{ body: string }>(
    'select body from notifications where user_id = $1 and kind = $2',
    [providerId, kind],
  );
  return rows;
};

describe('document lifecycle', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('an expired licence takes the provider back to PENDING and offline', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });
    const license = await approvedDocument(provider.id, admin.id, 'license', '2030-01-01');
    await approvedDocument(provider.id, admin.id, 'insurance', null);
    await verified(provider.id);

    // Still in date: the sweep leaves them alone.
    await runMaintenanceTick();
    expect(await stateOf(provider.id)).toEqual({ verification: 'VERIFIED', state: 'ONLINE' });

    // The date passes.
    await adminPool().query(
      'update provider_documents set expires_on = current_date - 1 where id = $1',
      [license],
    );

    const result = await runMaintenanceTick();
    // Failures first, always. The tick isolates each step so a broken one
    // cannot starve dispatch — which also means a thrown error shows up as a
    // count of zero and an otherwise baffling assertion. Asserting `failures`
    // before the numbers turns "expected 1, got 0" into the actual reason.
    expect(result.failures).toEqual([]);
    expect(result.lapsedProviders).toBe(1);

    // PENDING rather than SUSPENDED: the platform no longer holds valid
    // papers, which is not the same as an admin acting against someone.
    expect(await stateOf(provider.id)).toEqual({ verification: 'PENDING', state: 'OFFLINE' });

    const told = await notificationsFor(provider.id, 'document.expired');
    expect(told).toHaveLength(1);
    expect(told[0]!.body).toContain('רישיון מקצועי');
  });

  it('a newer valid approval replaces the expired one, and nothing happens', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });
    const old = await approvedDocument(provider.id, admin.id, 'license', '2030-01-01');
    await approvedDocument(provider.id, admin.id, 'insurance', null);
    await verified(provider.id);

    await adminPool().query(
      'update provider_documents set expires_on = current_date - 1 where id = $1',
      [old],
    );
    // They renewed and it was approved before the sweep ran.
    await approvedDocument(provider.id, admin.id, 'license', '2031-01-01');

    const result = await runMaintenanceTick();
    expect(result.lapsedProviders).toBe(0);
    expect(await stateOf(provider.id)).toEqual({ verification: 'VERIFIED', state: 'ONLINE' });
  });

  /* The reason the sweep does not simply ask provider_missing_documents. */
  it('a provider who never had documents is NOT swept — that is the queue\'s job', async () => {
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });
    await verified(provider.id);

    const result = await runMaintenanceTick();
    expect(result.lapsedProviders).toBe(0);
    // Most of the synthetic network is exactly this case: verified, with no
    // document, because the seeder does not fabricate licences. Sweeping on
    // "anything missing" would have un-verified the whole demo network the
    // first time the clock ran.
    expect(await stateOf(provider.id)).toEqual({ verification: 'VERIFIED', state: 'ONLINE' });
  });

  it('an expired document in a kind the trade does not need is ignored', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({
      name: 'מנקה', lat: 32.075, lon: 34.775,
      categorySlug: 'cleaning', serviceSlug: 'apartment_cleaning',
    });
    const id = await approvedDocument(provider.id, admin.id, 'license', '2030-01-01');
    await verified(provider.id);
    await adminPool().query(
      'update provider_documents set expires_on = current_date - 1 where id = $1',
      [id],
    );

    // Cleaning requires no licence, so an expired one is not a reason to stop
    // somebody working.
    const result = await runMaintenanceTick();
    expect(result.lapsedProviders).toBe(0);
    expect(await stateOf(provider.id)).toEqual({ verification: 'VERIFIED', state: 'ONLINE' });
  });

  it('warns before the date, once a week however often the tick runs', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });
    const license = await approvedDocument(provider.id, admin.id, 'license', '2030-01-01');
    await verified(provider.id);

    // Inside the 30-day window.
    await adminPool().query(
      `update provider_documents set expires_on = current_date + 10 where id = $1`,
      [license],
    );

    const first = await runMaintenanceTick();
    expect(first.expiryWarnings).toBe(1);

    // The tick runs every 30 seconds; the provider is not told 2,880 times a day.
    const second = await runMaintenanceTick();
    expect(second.expiryWarnings).toBe(0);
    expect(await notificationsFor(provider.id, 'document.expiring')).toHaveLength(1);

    // A week later it is worth saying again.
    await adminPool().query(
      `update provider_documents set expiry_warning_sent_at = now() - interval '8 days'
        where id = $1`,
      [license],
    );
    const later = await runMaintenanceTick();
    expect(later.expiryWarnings).toBe(1);
  });

  it('a long-rejected document keeps its reason and loses its file', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });
    const id = await approvedDocument(provider.id, admin.id, 'license', null);
    await adminPool().query(
      `update provider_documents
          set status = 'REJECTED', review_notes = 'הרישיון אינו קריא',
              reviewed_at = now() - interval '100 days'
        where id = $1`,
      [id],
    );

    const result = await runMaintenanceTick();
    expect(result.purgedDocumentFiles).toBe(1);

    const { rows } = await adminPool().query<{
      review_notes: string; storage_path: string; size_bytes: string | null; blobs: string;
    }>(
      `select d.review_notes, d.storage_path, d.size_bytes,
              (select count(*)::text from provider_document_blobs b where b.document_id = d.id) as blobs
         from provider_documents d where d.id = $1`,
      [id],
    );
    // The decision survives; the identity paper does not.
    expect(rows[0]!.review_notes).toBe('הרישיון אינו קריא');
    expect(rows[0]!.blobs).toBe('0');
    // And the row stops advertising a file it no longer has.
    expect(rows[0]!.storage_path).toBe('');
    expect(rows[0]!.size_bytes).toBeNull();

    // A recent rejection is left alone: the provider may still be reading it.
    const recent = await approvedDocument(provider.id, admin.id, 'insurance', null);
    await adminPool().query(
      `update provider_documents set status = 'REJECTED', reviewed_at = now() where id = $1`,
      [recent],
    );
    const again = await runMaintenanceTick();
    expect(again.purgedDocumentFiles).toBe(0);
  });

  it('one broken step does not stop the others', async () => {
    // The dispatch step runs first and a customer is watching it, so the
    // housekeeping steps must not be able to starve it. Asserted by the shape
    // of the result rather than by breaking the database: every step reports
    // independently and `failures` names any that threw.
    const result = await runMaintenanceTick();
    expect(result.failures).toEqual([]);
    expect(result).toHaveProperty('expiredOffers');
    expect(result).toHaveProperty('lapsedProviders');
    expect(result).toHaveProperty('purgedDocumentFiles');
  });
});
