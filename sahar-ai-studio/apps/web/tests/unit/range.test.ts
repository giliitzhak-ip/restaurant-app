import { describe, expect, it } from 'vitest';
import { parseSingleRange } from '@/lib/range';

describe('parseSingleRange', () => {
  it('accepts the forms media elements send', () => {
    expect(parseSingleRange('bytes=0-1')).toBe('bytes=0-1');
    expect(parseSingleRange('bytes=1024-')).toBe('bytes=1024-');
    expect(parseSingleRange('bytes=-500')).toBe('bytes=-500');
  });

  it('ignores invalid or multi-range headers', () => {
    for (const value of [
      null,
      '',
      'bytes=-',
      'bytes=5-1',
      'bytes=0-1,5-9',
      'items=0-1',
      'bytes=a-b',
    ]) {
      expect(parseSingleRange(value)).toBeUndefined();
    }
  });
});
