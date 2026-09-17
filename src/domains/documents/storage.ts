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

/**
 * What a provider is allowed to upload, by magic bytes rather than by the
 * Content-Type the client claims.
 *
 * A client-declared type is a request, not a fact. Accepting it would let a
 * provider upload an HTML file labelled image/png; served back to an admin
 * from our own origin, that is script execution in a session that can
 * approve providers. Every file is therefore identified from its own leading
 * bytes, and the type we store and later serve is the one we recognised.
 */
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedDocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];

/** 10 MB, matching the CHECK constraint in migration 0031. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * Identify a file from its leading bytes, or null if it is none of the four.
 *
 * Deliberately strict and deliberately short: these are the formats a phone
 * camera and a scanner produce. Anything else is refused rather than stored
 * and puzzled over later.
 */
export function sniffDocumentType(bytes: Buffer): AllowedDocumentType | null {
  if (bytes.length < 12) return null;

  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

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
