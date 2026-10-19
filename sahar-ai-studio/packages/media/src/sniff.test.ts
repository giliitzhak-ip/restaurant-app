import { describe, expect, it } from 'vitest';
import { categoryOf, sniffType } from './sniff';

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(
    values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])),
  );

describe('sniffType', () => {
  it('detects supported formats from content', () => {
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('jpeg');
    expect(sniffType(bytes(0x89, 'PNG\r\n\x1a\n', 0, 0, 0, 0))).toBe('png');
    expect(sniffType(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('webp');
    expect(sniffType(bytes('RIFF', 0, 0, 0, 0, 'WAVE'))).toBe('wav');
    expect(sniffType(bytes('ID3', 4, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('mp3');
    expect(sniffType(bytes(0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('mp3');
  });

  it('rejects other content regardless of the claimed extension', () => {
    expect(sniffType(bytes('%PDF-1.7', 0, 0, 0, 0))).toBeNull();
    expect(sniffType(bytes('<html>', 0, 0, 0, 0, 0, 0))).toBeNull();
    expect(sniffType(bytes('RIFF', 0, 0, 0, 0, 'AVI '))).toBeNull();
    expect(sniffType(bytes(0, 0, 0, 0x18, 'ftypheic'))).toBeNull(); // HEIC, MP4
    expect(sniffType(bytes(0xff, 0xf1, 0x50, 0x80, 0, 0, 0, 0, 0, 0, 0, 0))).toBeNull(); // AAC ADTS
    expect(sniffType(bytes(1, 2))).toBeNull();
  });

  it('categorizes types', () => {
    expect(categoryOf('mp3')).toBe('audio');
    expect(categoryOf('webp')).toBe('image');
  });
});
