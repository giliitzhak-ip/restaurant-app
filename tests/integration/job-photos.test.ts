import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertJobImagesComplete,
  getJobImage,
  missingJobImages,
  putJobImage,
} from '@/domains/jobs/images';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { getPool, withUser } from '@/lib/db';
import {
  adminPool,
  advanceJobTo,
  cleanupTestData,
  closeAdminPool,
  createCustomer,
  createJob,
  createProvider,
} from '../helpers/fixtures';

const LOC = { lat: 32.0742, lon: 34.7749 };

/** A one-pixel PNG is a real image; the sniffer accepts it on its bytes. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(40, 0x11),
]);

/**
 * Before/after photos (migration 0034).
 *
 * `job_images` shipped in migration 0004 and `requires_before_after` was sent
 * to the customer's job screen and the provider's offer — so the platform
 * told both sides this kind of work is documented in photos, and there was
 * nowhere to put one and nothing checking. The same shape as the licence:
 * a schema describing a feature, a UI mentioning it, and no code between.
 */
describe('job photos', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  /**
   * A job in progress with a provider on it, which is when photos happen.
   *
   * Built through the real path — dispatch, then accept — rather than by
   * inserting an assignment: `job_assignments.offer_id` is NOT NULL and
   * UNIQUE, so there is no such thing as an assignment without the offer it
   * came from, and a fixture that fakes one is testing a state the product
   * cannot reach.
   */
  async function jobInProgress(categorySlug = 'plumbing', serviceSlug = 'sink_leak') {
    const customer = await createCustomer();
    const provider = await createProvider({
      name: 'מבצע', lat: 32.075, lon: 34.775, categorySlug, serviceSlug,
    });
    const jobId = await createJob({ customerId: customer.id, ...LOC, categorySlug, serviceSlug });
    await runDispatchWave(jobId);

    const offer = await adminPool().query<{ id: string }>(
      `select id from job_offers where job_id = $1 and provider_id = $2`,
      [jobId, provider.id],
    );
    await withUser(provider.id, (db) =>
      db.one('select accept_job_offer($1)', [offer.rows[0]!.id]),
    );
    await advanceJobTo(jobId, 'IN_PROGRESS');
    return { customer, provider, jobId };
  }

  it('a plumbing job owes both photos, and finishing is refused until it has them', async () => {
    const { provider, jobId } = await jobInProgress();

    expect(await withUser(provider.id, (db) => missingJobImages(db, jobId)))
      .toEqual(['after', 'before']);

    await expect(
      withUser(provider.id, (db) => assertJobImagesComplete(db, jobId)),
    ).rejects.toThrow(/PHOTOS_REQUIRED|תיעוד/);

    await withUser(provider.id, (db) =>
      putJobImage(db, {
        jobId, uploadedBy: provider.id, kind: 'before',
        bytes: PNG, contentType: 'image/png',
      }),
    );
    expect(await withUser(provider.id, (db) => missingJobImages(db, jobId))).toEqual(['after']);

    // Half the evidence is still not evidence.
    await expect(
      withUser(provider.id, (db) => assertJobImagesComplete(db, jobId)),
    ).rejects.toThrow(/PHOTOS_REQUIRED|תיעוד/);

    await withUser(provider.id, (db) =>
      putJobImage(db, {
        jobId, uploadedBy: provider.id, kind: 'after',
        bytes: PNG, contentType: 'image/png',
      }),
    );
    expect(await withUser(provider.id, (db) => missingJobImages(db, jobId))).toEqual([]);
    await expect(
      withUser(provider.id, (db) => assertJobImagesComplete(db, jobId)),
    ).resolves.toBeUndefined();
  });

  it('a locksmith job asks for nothing, so nothing blocks it', async () => {
    const { provider, jobId } = await jobInProgress('locksmith', 'locked_out');
    expect(await withUser(provider.id, (db) => missingJobImages(db, jobId))).toEqual([]);
    await expect(
      withUser(provider.id, (db) => assertJobImagesComplete(db, jobId)),
    ).resolves.toBeUndefined();
  });

  it('the bytes go in with the row and come back out', async () => {
    const { provider, jobId } = await jobInProgress();
    const stored = await withUser(provider.id, (db) =>
      putJobImage(db, {
        jobId, uploadedBy: provider.id, kind: 'before',
        bytes: PNG, contentType: 'image/png',
      }),
    );
    // The locator is opaque and not derivable from the id alone — the same
    // reasoning, and the same trap, as the document store.
    expect(stored.storagePath.startsWith(`db://job-image/${stored.id}/`)).toBe(true);

    const read = await withUser(provider.id, (db) => getJobImage(db, stored.storagePath));
    expect(read?.contentType).toBe('image/png');
    expect(read?.bytes.equals(PNG)).toBe(true);
  });

  it('SECURITY: a stranger sees neither the photo nor its bytes', async () => {
    const { provider, jobId } = await jobInProgress();
    const stored = await withUser(provider.id, (db) =>
      putJobImage(db, {
        jobId, uploadedBy: provider.id, kind: 'before',
        bytes: PNG, contentType: 'image/png',
      }),
    );

    // Somebody with an account and no connection to this job. Photos of the
    // inside of a home are as private as a licence scan.
    const stranger = await createProvider({ name: 'זר', lat: 32.2, lon: 34.9 });
    const seen = await withUser(stranger.id, async (db) => ({
      row: await db.one('select id from job_images where id = $1', [stored.id]),
      blob: await db.one('select image_id from job_image_blobs where image_id = $1', [stored.id]),
      file: await getJobImage(db, stored.storagePath),
    }));
    expect(seen.row).toBeNull();
    expect(seen.blob).toBeNull();
    expect(seen.file).toBeNull();
  });

  it('the customer on the job can see what was photographed', async () => {
    const { customer, provider, jobId } = await jobInProgress();
    const stored = await withUser(provider.id, (db) =>
      putJobImage(db, {
        jobId, uploadedBy: provider.id, kind: 'after',
        bytes: PNG, contentType: 'image/png',
      }),
    );
    // The photos are the customer's evidence too, which is the whole point of
    // requiring them.
    const read = await withUser(customer.id, (db) => getJobImage(db, stored.storagePath));
    expect(read?.bytes.equals(PNG)).toBe(true);
  });

  it('a photo can be withdrawn while the job is open and not after it closes', async () => {
    const { provider, jobId } = await jobInProgress();
    const stored = await withUser(provider.id, (db) =>
      putJobImage(db, {
        jobId, uploadedBy: provider.id, kind: 'before',
        bytes: PNG, contentType: 'image/png',
      }),
    );

    const removed = await withUser(provider.id, (db) =>
      db.one<{ id: string }>('delete from job_images where id = $1 returning id', [stored.id]),
    );
    expect(removed?.id).toBe(stored.id);
    // The bytes go with it: no orphaned picture of somebody's home.
    const { rows } = await adminPool().query(
      'select 1 from job_image_blobs where image_id = $1',
      [stored.id],
    );
    expect(rows).toHaveLength(0);

    // Photograph both, finish the job, and the evidence is frozen.
    for (const kind of ['before', 'after'] as const) {
      await withUser(provider.id, (db) =>
        putJobImage(db, { jobId, uploadedBy: provider.id, kind, bytes: PNG, contentType: 'image/png' }),
      );
    }
    await advanceJobTo(jobId, 'COMPLETED');

    const survivor = await adminPool().query<{ id: string }>(
      `select id from job_images where job_id = $1 limit 1`,
      [jobId],
    );
    const gone = await withUser(provider.id, (db) =>
      db.one<{ id: string }>('delete from job_images where id = $1 returning id', [
        survivor.rows[0]!.id,
      ]),
    );
    expect(gone).toBeNull();
  });
});
