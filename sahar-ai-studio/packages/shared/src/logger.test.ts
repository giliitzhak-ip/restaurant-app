import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACTED_PATHS } from './logger';

describe('logger redaction', () => {
  it('never prints secrets', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = pino({ redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } }, stream);
    log.info({ password: 'hunter2', user: { passwordHash: 'abc' }, apiKey: 'sk-1' }, 'x');
    const out = lines.join('');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('sk-1');
    expect(out).not.toContain('"abc"');
    expect(out).toContain('[REDACTED]');
  });
});
