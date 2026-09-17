import { z } from 'zod';

/**
 * Matching configuration (spec §14).
 *
 * Weights live in the `settings` table and are loaded server-side. This file
 * holds the schema and the documented defaults used when the table has no
 * row — it is NOT a place to tune behaviour in frontend code.
 */
export const matchingWeightsSchema = z
  .object({
    routeOpportunity: z.number().min(0).max(1),
    skillMatch: z.number().min(0).max(1),
    availability: z.number().min(0).max(1),
    eta: z.number().min(0).max(1),
    reliability: z.number().min(0).max(1),
    rating: z.number().min(0).max(1),
    price: z.number().min(0).max(1),
    experience: z.number().min(0).max(1),
  })
  .refine(
    (w) => {
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      return Math.abs(sum - 1) < 1e-6;
    },
    { message: 'Matching weights must sum to exactly 1.0' },
  );

export type MatchingWeights = z.infer<typeof matchingWeightsSchema>;

/** Spec §14 defaults. */
export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  routeOpportunity: 0.25,
  skillMatch: 0.20,
  availability: 0.15,
  eta: 0.10,
  reliability: 0.10,
  rating: 0.10,
  price: 0.05,
  experience: 0.05,
};

export const matchingThresholdsSchema = z.object({
  maxLocationAgeSeconds: z.number().int().positive(),
  maxLocationAccuracyMeters: z.number().positive(),
  minRouteOpportunityDeviationMinutes: z.number().nonnegative(),
  candidateHardLimit: z.number().int().positive(),
  minScoreToOffer: z.number().min(0).max(100),
});

export type MatchingThresholds = z.infer<typeof matchingThresholdsSchema>;

export const DEFAULT_MATCHING_THRESHOLDS: MatchingThresholds = {
  maxLocationAgeSeconds: 120,
  maxLocationAccuracyMeters: 500,
  minRouteOpportunityDeviationMinutes: 6,
  candidateHardLimit: 50,
  minScoreToOffer: 25,
};

export const dispatchWaveSchema = z.object({
  wave: z.number().int().positive(),
  radiusKm: z.number().positive(),
  maxProviders: z.number().int().positive(),
  responseTimeoutSeconds: z.number().int().positive(),
});

export const dispatchConfigSchema = z.object({
  waves: z.array(dispatchWaveSchema).min(1),
  minCandidatesPerWave: z.number().int().nonnegative(),
  offerTtlSeconds: z.number().int().positive(),
});

export type DispatchWave = z.infer<typeof dispatchWaveSchema>;
export type DispatchConfig = z.infer<typeof dispatchConfigSchema>;

/** Spec §16 defaults: 5km → 10km → 20km. */
export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  waves: [
    { wave: 1, radiusKm: 5, maxProviders: 5, responseTimeoutSeconds: 45 },
    { wave: 2, radiusKm: 10, maxProviders: 5, responseTimeoutSeconds: 45 },
    { wave: 3, radiusKm: 20, maxProviders: 8, responseTimeoutSeconds: 60 },
  ],
  minCandidatesPerWave: 1,
  offerTtlSeconds: 60,
};
