import 'server-only';
import { createLogger } from '@sahar/shared/logger';

const globalForLogger = globalThis as unknown as {
  __saharWebLogger?: ReturnType<typeof createLogger>;
};

export const logger = (globalForLogger.__saharWebLogger ??= createLogger('web'));
