import { z } from 'zod';
import { ApiError, handleError, ok, parseJson } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { EstimateMapProvider, getMapProvider } from '@/domains/geo';
import { MatchingEngine } from '@/domains/matching/engine';
import {
  DEFAULT_MATCHING_THRESHOLDS,
  DEFAULT_MATCHING_WEIGHTS,
  matchingWeightsSchema,
} from '@/domains/matching/config';
import type { MatchRequest, ProviderCandidate } from '@/domains/matching/types';
import { newRequestId } from '@/lib/logger';

/**
 * MATCHING LAB (spec §35, §60).
 *
 * Runs the REAL MatchingEngine over hypothetical providers. No database
 * writes, no dispatch, no offers — which is what makes it safe to explore
 * and useful for validating the algorithm.
 *
 * Because it calls the same engine the dispatcher calls, a result here is
 * evidence about production behaviour rather than a separate model that could
 * drift.
 *
 * Restricted to admins, or to anyone when DEMO_MODE is on (it is a
 * development tool and exposes raw scoring, per spec §34).
 */
const providerSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  headingDeg: z.number().min(0).max(360).nullable().default(null),
  speedKmh: z.number().min(0).max(300).nullable().default(30),
  destinationLat: z.number().min(-90).max(90).nullable().default(null),
  destinationLon: z.number().min(-180).max(180).nullable().default(null),
  state: z.enum(['ONLINE', 'OFFLINE', 'BUSY']).default('ONLINE'),
  skills: z.array(z.string().max(40)).max(10).default(['plumbing']),
  priceIls: z.number().min(0).max(100_000).nullable().default(290),
  ratingAvg: z.number().min(1).max(5).nullable().default(4.7),
  ratingCount: z.number().int().min(0).max(100_000).default(100),
  completedJobs: z.number().int().min(0).max(100_000).default(150),
  cancelledJobs: z.number().int().min(0).max(100_000).default(5),
  yearsExperience: z.number().int().min(0).max(70).default(8),
  locationAgeSeconds: z.number().min(0).max(100_000).default(15),
  accuracyM: z.number().min(0).max(100_000).nullable().default(15),
  maxRadiusKm: z.number().min(0.1).max(200).default(25),
  inServiceArea: z.boolean().default(true),
});

const bodySchema = z.object({
  customer: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  requiredSkills: z.array(z.string().max(40)).max(10).default(['plumbing']),
  referencePriceIls: z.number().min(0).max(100_000).nullable().default(290),
  urgency: z.enum(['low', 'normal', 'high', 'emergency']).default('high'),
  providers: z.array(providerSchema).min(1).max(25),
  /** Override the weights to explore sensitivity. Must still sum to 1. */
  weights: matchingWeightsSchema.optional(),
});

export async function POST(request: Request) {
  const requestId = newRequestId();
  try {
    const user = await getCurrentUser();
    const demoMode = process.env.DEMO_MODE === 'true';
    if (!demoMode && user?.role !== 'admin') {
      throw new ApiError('FORBIDDEN', 'המעבדה זמינה למנהלים בלבד', 403);
    }

    const body = await parseJson(request, bodySchema);

    const candidates: ProviderCandidate[] = body.providers.map((p) => ({
      providerId: p.id,
      fullName: p.name,
      businessName: null,
      state: p.state,
      location: { lat: p.lat, lon: p.lon },
      headingDeg: p.headingDeg,
      speedKmh: p.speedKmh,
      accuracyM: p.accuracyM,
      locationAgeSeconds: p.locationAgeSeconds,
      destination:
        p.destinationLat !== null && p.destinationLon !== null
          ? { lat: p.destinationLat, lon: p.destinationLon }
          : null,
      skills: p.skills,
      priceIls: p.priceIls,
      ratingAvg: p.ratingAvg,
      ratingCount: p.ratingCount,
      completedJobs: p.completedJobs,
      cancelledJobs: p.cancelledJobs,
      offersReceived: p.completedJobs + p.cancelledJobs + 20,
      offersAccepted: p.completedJobs,
      avgResponseSeconds: 25,
      yearsExperience: p.yearsExperience,
      maxRadiusKm: p.maxRadiusKm,
      inServiceArea: p.inServiceArea,
      straightDistanceKm: 0, // recomputed below from the coordinates
    }));

    // Fill in straight-line distance so the radius filter behaves as it does
    // in production, where SQL supplies it.
    const { haversineKm } = await import('@/domains/geo/math');
    const withDistance = candidates.map((c) => ({
      ...c,
      straightDistanceKm: haversineKm(c.location, body.customer),
    }));

    const request_: MatchRequest = {
      jobId: 'lab',
      customerLocation: body.customer,
      locationAccuracyM: 10,
      categorySlug: 'lab',
      serviceSlug: null,
      requiredSkills: body.requiredSkills,
      urgency: body.urgency,
      referencePriceIls: body.referencePriceIls,
    };

    // Deterministic provider by default so lab runs are reproducible; the
    // configured provider is used when it is a real routing engine.
    const maps = process.env.MAP_PROVIDER === 'osrm' ? getMapProvider() : new EstimateMapProvider();

    const engine = new MatchingEngine(maps, {
      weights: body.weights ?? DEFAULT_MATCHING_WEIGHTS,
      thresholds: DEFAULT_MATCHING_THRESHOLDS,
    });

    const result = await engine.match(withDistance, request_);

    return ok({
      mapProvider: maps.name,
      weightsUsed: result.weightsUsed,
      evaluatedAt: result.evaluatedAt,
      ranked: result.ranked.map((scored, index) => ({
        rank: index + 1,
        providerId: scored.candidate.providerId,
        name: scored.candidate.fullName,
        finalScore: scored.finalScore,
        etaMinutes: scored.etaMinutes,
        etaConfidence: scored.etaConfidence,
        routeDistanceKm: scored.routeDistanceKm,
        straightDistanceKm: Number(scored.candidate.straightDistanceKm.toFixed(2)),
        priceIls: scored.priceIls,
        routeOpportunity: scored.routeOpportunity,
        breakdown: scored.breakdown,
      })),
      excluded: result.excluded.map((e) => ({
        providerId: e.candidate.providerId,
        name: e.candidate.fullName,
        reason: e.reason,
      })),
    });
  } catch (error) {
    return handleError(error, 'matching.lab', requestId);
  }
}
