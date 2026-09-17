import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/cn';

describe('foundation', () => {
  it('merges conflicting tailwind utilities, last one winning', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('drops falsy class values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});
