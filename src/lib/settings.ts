import { z } from 'zod';
import { withSystem, type DbSession } from './db';
import {
  DEFAULT_DISPATCH_CONFIG,
  DEFAULT_MATCHING_THRESHOLDS,
  DEFAULT_MATCHING_WEIGHTS,
  dispatchConfigSchema,
  matchingThresholdsSchema,
  matchingWeightsSchema,
  type DispatchConfig,
  type MatchingThresholds,
  type MatchingWeights,
} from '@/domains/matching/config';
import { logOperation } from './logger';

/**
 * Runtime configuration loader (spec §14: weights must be configurable and
 * never hard-coded into frontend code).
 *
 * Settings live in the `settings` table, which is admin-only under RLS, so
 * they are read here on the server with the system role and never shipped to
 * a customer's browser.
 *
 * A malformed or missing row falls back to the documented default and logs
 * the fact — a bad config row must not take matching down.
 */
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { value: unknown; expiresAt: number }>();

async function readSetting<S extends z.ZodType>(
  db: DbSession,
  key: string,
  schema: S,
  fallback: z.infer<S>,
): Promise<z.infer<S>> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as z.infer<S>;
  }

  const row = await db.one<{ value: unknown }>('select value from settings where key = $1', [key]);

  let value: z.infer<S> = fallback;
  if (!row) {
    logOperation({
      operation: 'settings.load',
      result: 'invalid',
      errorCode: 'SETTING_MISSING',
      meta: { key },
    });
  } else {
    const parsed = schema.safeParse(row.value);
    if (parsed.success) {
      value = parsed.data;
    } else {
      logOperation({
        operation: 'settings.load',
        result: 'invalid',
        errorCode: 'SETTING_INVALID',
        meta: { key, issue: parsed.error.issues[0]?.message ?? 'unknown' },
      });
    }
  }

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export interface MatchingConfiguration {
  readonly weights: MatchingWeights;
  readonly thresholds: MatchingThresholds;
  readonly dispatch: DispatchConfig;
}

export async function loadMatchingConfiguration(
  db?: DbSession,
): Promise<MatchingConfiguration> {
  const load = async (session: DbSession): Promise<MatchingConfiguration> => ({
    weights: await readSetting(
      session, 'matching.weights', matchingWeightsSchema, DEFAULT_MATCHING_WEIGHTS,
    ),
    thresholds: await readSetting(
      session, 'matching.thresholds', matchingThresholdsSchema, DEFAULT_MATCHING_THRESHOLDS,
    ),
    dispatch: await readSetting(
      session, 'dispatch.waves', dispatchConfigSchema, DEFAULT_DISPATCH_CONFIG,
    ),
  });

  return db ? load(db) : withSystem(load);
}

export const locationIntervalsSchema = z.object({
  OFFLINE: z.number().int().positive().nullable(),
  ONLINE: z.number().int().positive().nullable(),
  EN_ROUTE: z.number().int().positive().nullable(),
  BUSY: z.number().int().positive().nullable(),
});

export type LocationIntervals = z.infer<typeof locationIntervalsSchema>;

/** Spec §18 defaults. */
export const DEFAULT_LOCATION_INTERVALS: LocationIntervals = {
  OFFLINE: null,
  ONLINE: 60,
  EN_ROUTE: 10,
  BUSY: 120,
};

export const jobTimeoutsSchema = z.object({
  customerConfirmSeconds: z.number().int().positive(),
  autoCompleteAfterHours: z.number().int().positive(),
  searchGiveUpSeconds: z.number().int().positive(),
});

export type JobTimeouts = z.infer<typeof jobTimeoutsSchema>;

export const DEFAULT_JOB_TIMEOUTS: JobTimeouts = {
  customerConfirmSeconds: 120,
  autoCompleteAfterHours: 24,
  searchGiveUpSeconds: 300,
};

export async function loadLocationIntervals(db?: DbSession): Promise<LocationIntervals> {
  const load = (session: DbSession) =>
    readSetting(session, 'location.update_intervals', locationIntervalsSchema, DEFAULT_LOCATION_INTERVALS);
  return db ? load(db) : withSystem(load);
}

export async function loadJobTimeouts(db?: DbSession): Promise<JobTimeouts> {
  const load = (session: DbSession) =>
    readSetting(session, 'job.timeouts', jobTimeoutsSchema, DEFAULT_JOB_TIMEOUTS);
  return db ? load(db) : withSystem(load);
}

/** Clear the cache (tests, and after an admin writes a setting). */
export function invalidateSettingsCache(): void {
  cache.clear();
}
