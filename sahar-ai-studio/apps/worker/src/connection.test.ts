import { describe, expect, it } from 'vitest';
import { connectionFromUrl } from './connection';

describe('connectionFromUrl', () => {
  it('parses host, port, credentials and db', () => {
    expect(connectionFromUrl('redis://user:p%40ss@cache.internal:6380/2')).toMatchObject({
      host: 'cache.internal',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it('defaults port/db and enables TLS for rediss://', () => {
    const options = connectionFromUrl('rediss://cache.example.com');
    expect(options).toMatchObject({ host: 'cache.example.com', port: 6379, db: 0, tls: {} });
  });

  it('rejects non-redis URLs', () => {
    expect(() => connectionFromUrl('http://localhost:6379')).toThrow(/protocol/);
  });
});
