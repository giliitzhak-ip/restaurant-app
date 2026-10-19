import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashSessionToken, isWellFormedToken } from '@/lib/auth/tokens';

describe('session tokens', () => {
  it('generates unique 256-bit URL-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateSessionToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(isWellFormedToken(token)).toBe(true);
  });

  it('stores only a deterministic SHA-256 hash', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it('rejects malformed cookie values before touching the database', () => {
    for (const value of [undefined, '', 'short', `${'a'.repeat(43)}!`, 'a'.repeat(44)]) {
      expect(isWellFormedToken(value)).toBe(false);
    }
  });
});
