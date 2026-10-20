import { describe, expect, it } from 'vitest';
import { contentDisposition, takeFilename } from '@/lib/content-disposition';

describe('content disposition', () => {
  it('keeps Hebrew names via filename* and gives an ASCII fallback', () => {
    const header = contentDisposition('attachment', 'לילה של זהב - scene 2 - take 1 - TEST.mp4');
    expect(header).toMatch(
      /^attachment; filename="scene 2 - take 1 - TEST.mp4"; filename\*=UTF-8''/,
    );
    expect(decodeURIComponent(header.split("UTF-8''")[1]!)).toBe(
      'לילה של זהב - scene 2 - take 1 - TEST.mp4',
    );
  });

  it('strips quotes and path characters', () => {
    expect(contentDisposition('inline', 'a"b\\c.mp4')).toContain('filename="abc.mp4"');
    expect(takeFilename('a/b:c', 0, 3, false)).toBe('a b c - scene 1 - take 3.mp4');
    expect(takeFilename('', 1, 1, true)).toBe('sahar - scene 2 - take 1 - TEST.mp4');
  });
});
