import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { uuidV4 } from '@/lib/uuid';

describe('uuidV4', () => {
  it('produces unique RFC 4122 v4 ids accepted by the server schema', () => {
    const ids = new Set(Array.from({ length: 500 }, uuidV4));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(z.string().uuid().safeParse(id).success).toBe(true);
    }
  });
});
