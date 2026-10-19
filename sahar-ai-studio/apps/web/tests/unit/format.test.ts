import { describe, expect, it } from 'vitest';
import { formatBytes, formatTime } from '@/lib/format';

describe('formatTime', () => {
  it('formats minutes, seconds and tenths', () => {
    expect(formatTime(0)).toBe('0:00.0');
    expect(formatTime(83_456)).toBe('1:23.4');
    expect(formatTime(600_000)).toBe('10:00.0');
    expect(formatTime(59_999, { tenths: false })).toBe('0:59');
    expect(formatTime(-5)).toBe('0:00.0');
  });
});

describe('formatBytes', () => {
  it('uses binary units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
