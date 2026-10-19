import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseServerEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  AUTH_SECRET: 'x'.repeat(32),
};

describe('parseServerEnv', () => {
  it('applies safe defaults', () => {
    const env = parseServerEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SESSION_TTL_DAYS).toBe(30);
    expect(env.ALLOW_REGISTRATION).toBe(true);
    expect(env.MAX_AUDIO_UPLOAD_MB).toBe(100);
  });

  it('treats empty provider keys as not configured', () => {
    const env = parseServerEnv({ ...base, HEDRA_API_KEY: '', FAL_KEY: '   ' });
    expect(env.HEDRA_API_KEY).toBeUndefined();
    expect(env.FAL_KEY).toBeUndefined();
  });

  it('parses boolean strings strictly', () => {
    expect(parseServerEnv({ ...base, ALLOW_REGISTRATION: 'false' }).ALLOW_REGISTRATION).toBe(false);
    expect(() => parseServerEnv({ ...base, ALLOW_REGISTRATION: 'nope' })).toThrow(
      EnvValidationError,
    );
  });

  it('rejects a short AUTH_SECRET and reports every problem', () => {
    try {
      parseServerEnv({ AUTH_SECRET: 'short' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const issues = (error as EnvValidationError).issues.join('\n');
      expect(issues).toContain('AUTH_SECRET');
      expect(issues).toContain('DATABASE_URL');
      expect(issues).toContain('REDIS_URL');
    }
  });
});
