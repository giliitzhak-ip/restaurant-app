/** Media types the studio accepts, identified from file content (never from the name). */
export type SniffedType = 'mp3' | 'wav' | 'jpeg' | 'png' | 'webp';

export const SNIFF_BYTES = 12;

export const MIME_BY_TYPE: Record<SniffedType, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const EXTENSION_BY_TYPE: Record<SniffedType, string> = {
  mp3: 'mp3',
  wav: 'wav',
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

const ascii = (bytes: Uint8Array, start: number, text: string) =>
  text.split('').every((char, i) => bytes[start + i] === char.charCodeAt(0));

/** Magic-byte detection on the first bytes of a file. */
export function sniffType(head: Uint8Array): SniffedType | null {
  if (head.length < 4) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head[0] === 0x89 && ascii(head, 1, 'PNG\r\n\x1a\n')) return 'png';
  if (head.length >= 12 && ascii(head, 0, 'RIFF') && ascii(head, 8, 'WEBP')) return 'webp';
  if (head.length >= 12 && ascii(head, 0, 'RIFF') && ascii(head, 8, 'WAVE')) return 'wav';
  if (ascii(head, 0, 'ID3')) return 'mp3';
  // MPEG audio frame sync (11 bits set) with layer III.
  const b1 = head[1] ?? 0;
  if (head[0] === 0xff && (b1 & 0xe0) === 0xe0 && (b1 & 0x06) === 0x02) return 'mp3';
  return null;
}

export type UploadCategory = 'audio' | 'image';

export function categoryOf(type: SniffedType): UploadCategory {
  return type === 'mp3' || type === 'wav' ? 'audio' : 'image';
}
