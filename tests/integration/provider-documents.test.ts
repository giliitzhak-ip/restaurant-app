import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertDocumentsComplete,
  getDocumentStorage,
  missingRequiredDocuments,
} from '@/domains/documents';
import { getPool, withUser } from '@/lib/db';
import {
  adminPool,
  cleanupTestData,
  closeAdminPool,
  createAdmin,
  createProvider,
} from '../helpers/fixtures';

/**
 * Provider documents (spec §31).
 *
 * `provider_documents` shipped in migration 0007 and its row security in
 * 0011, and nothing ever wrote to it. The registration form told a provider
 * "התחום הזה דורש רישיון וביטוח. המנהל יבקש את המסמכים לפני האימות" and gave
 * them nowhere to put either one, while `verify_provider` would mark a
 * licensed trade VERIFIED with no licence anywhere in the system.
 *
 * So the property under test is the one that makes the feature real: a
 * licensed trade cannot be verified without an approved, unexpired licence,
 * and nobody can approve their own.
 */

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n', 'ascii'), Buffer.alloc(64, 0x20)]);

/** Submit a document the way the provider endpoint does — as the provider. */
async function submit(
  providerId: string,
  docType: 'license' | 'insurance',
  options: { expiresOn?: string | null; bytes?: Buffer } = {},
): Promise<string> {
  const bytes = options.bytes ?? PDF;
  const storage = getDocumentStorage();
  const id = randomUUID();
  const storagePath = storage.locate(id);
  return withUser(providerId, async (db) => {
    const row = await db.one<{ id: string }>(
      `insert into provider_documents
         (id, provider_id, doc_type, storage_path, content_type, size_bytes,
          expires_on, original_filename)
       values ($1,$2,$3,$4,'application/pdf',$5,$6,'license.pdf')
       returning id`,
      [id, providerId, docType, storagePath, bytes.length, options.expiresOn ?? null],
    );
    await storage.put(db, { documentId: row!.id, storagePath, bytes, contentType: 'application/pdf' });
    return row!.id;
  });
}

/** Resolve a document the way the admin action does — as the admin. */
async function review(
  adminId: string,
  documentId: string,
  status: 'VERIFIED' | 'REJECTED',
  expiresOn: string | null = null,
): Promise<void> {
  await withUser(adminId, (db) =>
    db.query(
      `update provider_documents
          set status = $2::verification_status, reviewed_by = $3,
              reviewed_at = now(), expires_on = coalesce($4, expires_on)
        where id = $1`,
      [documentId, status, adminId, expiresOn],
    ),
  );
}

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

describe('provider documents', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('a plumbing provider owes a licence and insurance until both are approved', async () => {
    const admin = await createAdmin();
    // Plumbing requires both (reference data, migration 0013).
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });

    expect(await withUser(admin.id, (db) => missingRequiredDocuments(db, provider.id)))
      .toEqual(['insurance', 'license']);

    const license = await submit(provider.id, 'license');
    // Submitting is not satisfying: a pending document changes nothing.
    expect(await withUser(admin.id, (db) => missingRequiredDocuments(db, provider.id)))
      .toEqual(['insurance', 'license']);

    await review(admin.id, license, 'VERIFIED');
    expect(await withUser(admin.id, (db) => missingRequiredDocuments(db, provider.id)))
      .toEqual(['insurance']);

    await review(admin.id, await submit(provider.id, 'insurance'), 'VERIFIED');
    expect(await withUser(admin.id, (db) => missingRequiredDocuments(db, provider.id)))
      .toEqual([]);
  });

  it('verification is refused while a required document is missing', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });

    await expect(
      withUser(admin.id, (db) => assertDocumentsComplete(db, provider.id)),
    ).rejects.toThrow(/DOCUMENTS_REQUIRED|חסרים מסמכים/);

    await review(admin.id, await submit(provider.id, 'license'), 'VERIFIED');
    await review(admin.id, await submit(provider.id, 'insurance'), 'VERIFIED');

    await expect(
      withUser(admin.id, (db) => assertDocumentsComplete(db, provider.id)),
    ).resolves.toBeUndefined();
  });

  it('an approval that has expired stops counting', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });

    const license = await submit(provider.id, 'license', { expiresOn: tomorrow() });
    await review(admin.id, license, 'VERIFIED');
    await review(admin.id, await submit(provider.id, 'insurance'), 'VERIFIED');
    expect(await withUser(admin.id, (db) => missingRequiredDocuments(db, provider.id)))
      .toEqual([]);

    // Time passes. The approval is still recorded; it is no longer valid.
    await adminPool().query(
      `update provider_documents set expires_on = current_date - 1 where id = $1`,
      [license],
    );
    expect(await withUser(admin.id, (db) => missingRequiredDocuments(db, provider.id)))
      .toEqual(['license']);
  });

  it('the bytes go in and come back out, in the same transaction as the row', async () => {
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });
    const id = await submit(provider.id, 'license');

    const read = await withUser(provider.id, async (db) => {
      const row = await db.one<{ storage_path: string; size_bytes: string }>(
        'select storage_path, size_bytes from provider_documents where id = $1',
        [id],
      );
      // The locator is opaque and not derivable from the id alone.
      expect(row!.storage_path.startsWith(`db://${id}/`)).toBe(true);
      expect(Number(row!.size_bytes)).toBe(PDF.length);
      return getDocumentStorage().get(db, row!.storage_path);
    });

    expect(read?.contentType).toBe('application/pdf');
    expect(read?.bytes.equals(PDF)).toBe(true);
  });

  it('SECURITY: a provider cannot approve their own document', async () => {
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });
    const id = await submit(provider.id, 'license');

    // provider_documents has no owner UPDATE policy at all, so the update
    // matches no row rather than being rejected — either way nothing changes.
    await withUser(provider.id, (db) =>
      db.query(
        `update provider_documents set status = 'VERIFIED', reviewed_at = now() where id = $1`,
        [id],
      ),
    ).catch(() => undefined);

    const { rows } = await adminPool().query<{ status: string }>(
      'select status::text as status from provider_documents where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('PENDING');
  });

  it('SECURITY: a provider cannot read another provider\'s document or its bytes', async () => {
    const mine = await createProvider({ name: 'שלי', lat: 32.075, lon: 34.775 });
    const theirs = await createProvider({ name: 'שלהם', lat: 32.076, lon: 34.776 });
    const id = await submit(theirs.id, 'license');

    const seen = await withUser(mine.id, async (db) => {
      const row = await db.one<{ id: string; storage_path: string }>(
        'select id, storage_path from provider_documents where id = $1',
        [id],
      );
      const blob = await db.one<{ document_id: string }>(
        'select document_id from provider_document_blobs where document_id = $1',
        [id],
      );
      return { row, blob };
    });

    expect(seen.row).toBeNull();
    expect(seen.blob).toBeNull();
  });

  it('a provider may withdraw a pending document but not a reviewed one', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({ name: 'שרברב', lat: 32.075, lon: 34.775 });

    const pending = await submit(provider.id, 'license');
    const removed = await withUser(provider.id, (db) =>
      db.one<{ id: string }>('delete from provider_documents where id = $1 returning id', [pending]),
    );
    expect(removed?.id).toBe(pending);

    // The bytes go with it: ON DELETE CASCADE, so no orphaned private file.
    const { rows: orphans } = await adminPool().query(
      'select 1 from provider_document_blobs where document_id = $1',
      [pending],
    );
    expect(orphans).toHaveLength(0);

    const reviewed = await submit(provider.id, 'license');
    await review(admin.id, reviewed, 'REJECTED');
    const gone = await withUser(provider.id, (db) =>
      db.one<{ id: string }>('delete from provider_documents where id = $1 returning id', [reviewed]),
    );
    // A rejection is a record, not a draft.
    expect(gone).toBeNull();
  });

  it('a cleaner is not asked for a licence', async () => {
    const admin = await createAdmin();
    const provider = await createProvider({
      name: 'מנקה', lat: 32.075, lon: 34.775, categorySlug: 'cleaning', serviceSlug: 'apartment_cleaning',
    });

    // Cleaning requires neither, so nothing is outstanding and verification
    // is not blocked.
    expect(await withUser(admin.id, (db) => missingRequiredDocuments(db, provider.id)))
      .toEqual([]);
    await expect(
      withUser(admin.id, (db) => assertDocumentsComplete(db, provider.id)),
    ).resolves.toBeUndefined();
  });
});
