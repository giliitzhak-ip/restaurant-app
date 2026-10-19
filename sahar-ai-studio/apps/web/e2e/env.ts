import { tmpdir } from 'node:os';
import path from 'node:path';

/** Isolated Redis logical database so e2e runs never share queues or counters with dev. */
export const E2E_REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/15';

export const FIXTURE_DIR = path.join(tmpdir(), 'sahar-e2e-fixtures');
export const fixture = (name: string) => path.join(FIXTURE_DIR, name);
