import { pino, type Logger } from 'pino';

/** Keys whose values must never reach log output. */
export const REDACTED_PATHS = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'headers.cookie',
  'cookie',
  '*.apiKey',
  'apiKey',
];

export function createLogger(service: string, level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

export type { Logger };
