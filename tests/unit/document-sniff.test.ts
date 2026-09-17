import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_BYTES, sniffDocumentType } from '@/domains/documents';

/**
 * A file's type comes from its own leading bytes, never from the Content-Type
 * the browser sent.
 *
 * The audience for these files is an admin session that can verify providers
 * and read every document in the queue. A provider who could upload an HTML
 * file labelled image/png would be uploading script into that session.
 */
describe('document type sniffing', () => {
  const pad = (head: number[]) =>
    Buffer.concat([Buffer.from(head), Buffer.alloc(32)]);

  it('recognises the four accepted formats from their magic bytes', () => {
    expect(sniffDocumentType(pad([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe('application/pdf');
    expect(sniffDocumentType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      sniffDocumentType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
    expect(
      sniffDocumentType(
        Buffer.concat([
          Buffer.from('RIFF', 'ascii'),
          Buffer.from([0x00, 0x00, 0x00, 0x00]),
          Buffer.from('WEBP', 'ascii'),
          Buffer.alloc(16),
        ]),
      ),
    ).toBe('image/webp');
  });

  it('refuses HTML, whatever it is called', () => {
    // The attack: served back from our own origin, this executes in whatever
    // session opens it.
    const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');
    expect(sniffDocumentType(html)).toBeNull();
  });

  it('refuses SVG, which is markup that browsers render', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'utf8');
    expect(sniffDocumentType(svg)).toBeNull();
  });

  it('refuses an executable and a zip', () => {
    expect(sniffDocumentType(pad([0x4d, 0x5a]))).toBeNull(); // MZ
    expect(sniffDocumentType(pad([0x7f, 0x45, 0x4c, 0x46]))).toBeNull(); // ELF
    expect(sniffDocumentType(pad([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // PK
  });

  it('refuses a file too short to identify rather than guessing', () => {
    expect(sniffDocumentType(Buffer.from([0x25, 0x50, 0x44]))).toBeNull();
    expect(sniffDocumentType(Buffer.alloc(0))).toBeNull();
  });

  it('is not fooled by a PDF signature that starts one byte in', () => {
    expect(sniffDocumentType(pad([0x00, 0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it('caps at the size the CHECK constraint allows', () => {
    // Migration 0031 constrains size_bytes to 1..10485760; a mismatch here
    // means an upload the API accepts and the database rejects.
    expect(MAX_DOCUMENT_BYTES).toBe(10_485_760);
  });
});
