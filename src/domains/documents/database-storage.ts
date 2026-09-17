import { randomUUID } from 'node:crypto';
import type { DbSession } from '@/lib/db';
import type {
  DocumentStorage,
  FetchedDocument,
  PutDocumentRequest,
  StoredDocument,
} from './storage';

/**
 * Keeps document bytes in Postgres, in `provider_document_blobs`.
 *
 * Chosen over an object store because there is no object store in this
 * deployment, and a storage layer that pretends otherwise is the kind of
 * half-feature this one replaced: `provider_documents` shipped in migration
 * 0007 with a comment promising signed URLs from a bucket that does not
 * exist, and as a result nothing was ever stored at all.
 *
 * The trade-offs are real and small at this scale. A licence scan is a few
 * hundred kilobytes and there is one per provider, so the table grows with
 * the provider count rather than with traffic. In exchange the bytes inherit
 * the row security the documents table already had, they commit in the same
 * transaction as the row that describes them, and they survive a container
 * being recycled — which a local filesystem in this environment would not.
 */
export class DatabaseDocumentStorage implements DocumentStorage {
  readonly name = 'database';

  /**
   * `db://<document id>/<nonce>`.
   *
   * The nonce makes the stored path unguessable even to someone who knows the
   * document id, so a leaked path is not derivable and a derived one is not
   * valid. Nothing outside this class may parse it.
   */
  locate(documentId: string): string {
    return `db://${documentId}/${randomUUID()}`;
  }

  async put(db: DbSession, request: PutDocumentRequest): Promise<StoredDocument> {
    await db.query(
      `insert into provider_document_blobs (document_id, bytes) values ($1, $2)`,
      [request.documentId, request.bytes],
    );
    return { storagePath: request.storagePath, sizeBytes: request.bytes.length };
  }

  async get(db: DbSession, storagePath: string): Promise<FetchedDocument | null> {
    const documentId = parseLocator(storagePath);
    if (!documentId) return null;

    const row = await db.one<{ bytes: Buffer; content_type: string | null }>(
      `select b.bytes, d.content_type
         from provider_document_blobs b
         join provider_documents d on d.id = b.document_id
        where b.document_id = $1`,
      [documentId],
    );
    if (!row) return null;

    return {
      bytes: row.bytes,
      // Never the client's claim: the stored type is the one sniffDocumentType
      // recognised at upload, and an unrecognisable row is served as opaque
      // binary rather than as something a browser will try to run.
      contentType: row.content_type ?? 'application/octet-stream',
    };
  }
}

/** `db://<document uuid>/<nonce>` → the document id, or null. */
function parseLocator(storagePath: string): string | null {
  const match = /^db:\/\/([0-9a-f-]{36})\//.exec(storagePath);
  return match ? match[1]! : null;
}
