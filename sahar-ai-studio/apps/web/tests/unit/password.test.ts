import { describe, expect, it } from 'vitest';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '@/lib/auth/password';

// Low-cost parameters keep the unit suite fast; production defaults are exercised once below.
const fast = { N: 1024, r: 8, p: 1 };

describe('password hashing', () => {
  it('verifies the correct password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery', fast);
    expect(hash.startsWith('scrypt$1024$8$1$')).toBe(true);
    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('correct horse batterz', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same', fast), hashPassword('same', fast)]);
    expect(a).not.toBe(b);
  });

  it('normalizes Unicode so Hebrew passwords verify regardless of composition', async () => {
    const composed = 'שָׁלוֹם123'.normalize('NFC');
    const decomposed = composed.normalize('NFD');
    const hash = await hashPassword(composed, fast);
    await expect(verifyPassword(decomposed, hash)).resolves.toBe(true);
  });

  it('rejects malformed stored hashes without throwing', async () => {
    for (const stored of [
      '',
      'plain',
      'bcrypt$1$2$3$4$5',
      'scrypt$x$8$1$AAAA$BBBB',
      'scrypt$1024$8$1$AAAA$',
    ]) {
      await expect(verifyPassword('pw', stored)).resolves.toBe(false);
    }
  });

  it('uses strong defaults', async () => {
    const hash = await hashPassword('production-cost');
    expect(hash.startsWith('scrypt$32768$8$1$')).toBe(true);
    await expect(verifyPassword('production-cost', hash)).resolves.toBe(true);
  });

  it('dummy verification always fails', async () => {
    await expect(verifyAgainstDummy('anything')).resolves.toBe(false);
  });
});
