import type { DbSession } from '@/lib/db';

/**
 * DocumentStorage abstraction.
 *
 * Provider documents are identity papers: a licence, an insurance
 * certificate, a business registration. They are private, they are read back
 * rarely, and they must never be reachable by anyone who is not the provider
 * or an admin. So the interface deliberately has no notion of a URL — there
 * is no public address to leak, and nothing here can produce one. Bytes go in
 * behind an authorization check and come out behind another.
 *
 * `storagePath` is opaque to every caller. The database backend returns
 * `db://<uuid>`; an object store would return its own key. Nothing outside an
 * implementation may parse it.
 */
export interface StoredDocument {
  readonly storagePath: string;
  readonly sizeBytes: number;
}

export interface PutDocumentRequest {
  /** The row the bytes belong to. Written in the same transaction. */
  readonly documentId: string;
  /** The locator already recorded on that row, from `locate`. */
  readonly storagePath: string;
  readonly bytes: Buffer;
  readonly contentType: string;
}

export interface FetchedDocument {
  readonly bytes: Buffer;
  readonly contentType: string;
}

export interface DocumentStorage {
  readonly name: string;
  /**
   * The locator for a document id, computed before the row is written.
   *
   * Deliberately not something `put` returns afterwards. `provider_documents`
   * has no owner UPDATE policy — that is what stops a provider approving
   * their own licence — so a provider cannot come back and fill in
   * `storage_path` on a row they just inserted. The path therefore has to be
   * known in time to go into the INSERT, and an upload that tried to patch it
   * in afterwards left every document unreadable.
   */
  locate(documentId: string): string;
  /**
   * Store the bytes for a document row.
   *
   * Takes the caller's transaction so the row and its bytes commit together
   * or not at all: a document row with no file is an empty promise in the
   * reviewer's queue, and orphaned bytes are a private file nobody can
   * account for.
   */
  put(db: DbSession, request: PutDocumentRequest): Promise<StoredDocument>;
  /** Read the bytes back. Null when the locator resolves to nothing. */
  get(db: DbSession, storagePath: string): Promise<FetchedDocument | null>;
}

/*
 * File-type identification and the private-file headers moved to
 * @/domains/files/sniff when job photos needed exactly the same reasoning.
 * Re-exported here so the documents module keeps one import surface, and so
 * there is one implementation of "what is this file really" rather than two
 * that can drift.
 */
export {
  sniffFileType as sniffDocumentType,
  MAX_UPLOAD_BYTES as MAX_DOCUMENT_BYTES,
  privateFileHeaders,
  FILE_TYPES,
  type SniffedType as AllowedDocumentType,
} from '@/domains/files/sniff';

/** The document kinds a provider submits, and what each one is called. */
export const DOCUMENT_KINDS = {
  license: 'רישיון מקצועי',
  insurance: 'ביטוח אחריות מקצועית',
  identity: 'תעודת זהות',
  business_registration: 'רישום עוסק / חברה',
  payout: 'אישור ניהול חשבון',
  other: 'מסמך נוסף',
} as const;

export type DocumentKind = keyof typeof DOCUMENT_KINDS;
