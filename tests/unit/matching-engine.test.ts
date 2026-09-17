import { describe, expect, it } from 'vitest';
import { EstimateMapProvider } from '@/domains/geo';
import { MatchingEngine } from '@/domains/matching/engine';
import {
  DEFAULT_MATCHING_WEIGHTS,
  matchingWeightsSchema,
  dispatchConfigSchema,
  DEFAULT_DISPATCH_CONFIG,
} from '@/domains/matching/config';
import type { MatchRequest, ProviderCandidate } from '@/domains/matching/types';

const CUSTOMER = { lat: 32.0742, lon: 34.7749 };

const baseCandidate: ProviderCandidate = {
  providerId: 'p-base',
  fullName: 'בעל מקצוע',
  businessName: null,
  state: 'ONLINE',
  location: { lat: 32.0832, lon: 34.7749 },
  headingDeg: 0,
  speedKmh: 34,
  accuracyM: 12,
  locationAgeSeconds: 15,
  destination: null,
  skills: ['plumbing'],
  priceIls: 290,
  ratingAvg: 4.8,
  ratingCount: 150,
  completedJobs: 200,
  cancelledJobs: 6,
  offersReceived: 250,
  offersAccepted: 200,
  avgResponseSeconds: 20,
  yearsExperience: 10,
  maxRadiusKm: 18,
  inServiceArea: true,
  straightDistanceKm: 1.0,
};

const request: MatchRequest = {
  jobId: 'job-1',
  customerLocation: CUSTOMER,
  locationAccuracyM: 10,
  categorySlug: 'plumbing',
  serviceSlug: 'sink_leak',
  requiredSkills: ['plumbing'],
  urgency: 'high',
  referencePriceIls: 290,
};

function candidate(overrides: Partial<ProviderCandidate>): ProviderCandidate {
  return { ...baseCandidate, ...overrides };
}

const engine = new MatchingEngine(new EstimateMapProvider());

describe('matching configuration', () => {
  it('ships the spec §14 weights and they sum to exactly 1.0', () => {
    expect(() => matchingWeightsSchema.parse(DEFAULT_MATCHING_WEIGHTS)).not.toThrow();
    expect(DEFAULT_MATCHING_WEIGHTS.routeOpportunity).toBe(0.25);
    expect(DEFAULT_MATCHING_WEIGHTS.skillMatch).toBe(0.2);
    const sum = Object.values(DEFAULT_MATCHING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('rejects weights that do not sum to 1.0', () => {
    expect(() =>
      matchingWeightsSchema.parse({ ...DEFAULT_MATCHING_WEIGHTS, rating: 0.5 }),
    ).toThrow(/sum to exactly 1/);
  });

  it('ships the spec §16 dispatch waves 5km -> 10km -> 20km', () => {
    expect(() => dispatchConfigSchema.parse(DEFAULT_DISPATCH_CONFIG)).not.toThrow();
    expect(DEFAULT_DISPATCH_CONFIG.waves.map((w) => w.radiusKm)).toEqual([5, 10, 20]);
  });
});

describe('MatchingEngine ranking', () => {
  it('ranks the provider already heading there above a closer one driving away', async () => {
    const onTheWay = candidate({
      providerId: 'ram-on-the-way',
      location: { lat: 32.103, lon: 34.7749 },
      headingDeg: 180,
      destination: { lat: 32.056, lon: 34.7749 },
      straightDistanceKm: 3.2,
    });
    const closerDrivingAway = candidate({
      providerId: 'dan-driving-away',
      location: { lat: 32.0832, lon: 34.7749 },
      headingDeg: 0,
      destination: { lat: 32.21, lon: 34.79 },
      straightDistanceKm: 1.0,
      // Give the wrong-way provider EVERY other advantage.
      ratingAvg: 5.0,
      ratingCount: 400,
      priceIls: 240,
      yearsExperience: 15,
      completedJobs: 500,
    });

    const result = await engine.match([closerDrivingAway, onTheWay], request);

    expect(result.ranked).toHaveLength(2);
    expect(result.ranked[0]?.candidate.providerId).toBe('ram-on-the-way');
    expect(result.ranked[0]?.routeOpportunity.isOnTheWay).toBe(true);
    expect(result.ranked[1]?.routeOpportunity.isOnTheWay).toBe(false);
  });

  it('does not simply pick the cheapest provider (spec §15)', async () => {
    const cheapButWrongWay = candidate({
      providerId: 'cheap',
      priceIls: 120,
      headingDeg: 0,
      destination: { lat: 32.3, lon: 34.9 },
      location: { lat: 32.09, lon: 34.775 },
    });
    const dearerOnTheWay = candidate({
      providerId: 'dearer',
      priceIls: 340,
      headingDeg: 180,
      destination: { lat: 32.05, lon: 34.7749 },
      location: { lat: 32.1, lon: 34.7749 },
    });

    const result = await engine.match([cheapButWrongWay, dearerOnTheWay], request);
    expect(result.ranked[0]?.candidate.providerId).toBe('dearer');
  });

  it('does not simply pick the highest-rated provider (spec §15)', async () => {
    const perfectRatingWrongWay = candidate({
      providerId: 'five-star',
      ratingAvg: 5,
      ratingCount: 900,
      headingDeg: 0,
      destination: { lat: 32.3, lon: 34.9 },
      location: { lat: 32.088, lon: 34.775 },
    });
    const goodRatingOnTheWay = candidate({
      providerId: 'on-the-way',
      ratingAvg: 4.4,
      ratingCount: 60,
      headingDeg: 180,
      destination: { lat: 32.05, lon: 34.7749 },
      location: { lat: 32.1, lon: 34.7749 },
    });

    const result = await engine.match([perfectRatingWrongWay, goodRatingOnTheWay], request);
    expect(result.ranked[0]?.candidate.providerId).toBe('on-the-way');
  });

  it('produces a full weighted breakdown that reconstructs the final score', async () => {
    const result = await engine.match([candidate({})], request);
    const top = result.ranked[0];
    expect(top).toBeDefined();

    const components = Object.values(top!.breakdown);
    expect(components).toHaveLength(8);

    const recomputed = components.reduce((sum, c) => sum + c.score * c.weight, 0);
    expect(top!.finalScore).toBeCloseTo(recomputed, 1);

    // Every component must carry an explanation for the debugger (spec §34).
    for (const component of components) {
      expect(component.reason.length).toBeGreaterThan(0);
    }
  });

  it('keeps the final score within 0..100', async () => {
    const result = await engine.match(
      [candidate({ providerId: 'a' }), candidate({ providerId: 'b', priceIls: 900 })],
      request,
    );
    for (const scored of result.ranked) {
      expect(scored.finalScore).toBeGreaterThanOrEqual(0);
      expect(scored.finalScore).toBeLessThanOrEqual(100);
    }
  });
});

describe('MatchingEngine eligibility filters', () => {
  it('excludes a provider whose location is stale rather than guessing', async () => {
    const result = await engine.match(
      [candidate({ providerId: 'stale', locationAgeSeconds: 900 })],
      request,
    );
    expect(result.ranked).toHaveLength(0);
    expect(result.excluded[0]?.reason).toBe('location_stale');
  });

  it('excludes an offline or busy provider', async () => {
    const result = await engine.match(
      [
        candidate({ providerId: 'off', state: 'OFFLINE' }),
        candidate({ providerId: 'busy', state: 'BUSY' }),
      ],
      request,
    );
    expect(result.ranked).toHaveLength(0);
    expect(result.excluded.map((e) => e.reason).sort()).toEqual([
      'provider_state_busy',
      'provider_state_offline',
    ]);
  });

  it('excludes a location fix too imprecise to support a route decision', async () => {
    const result = await engine.match(
      [candidate({ providerId: 'fuzzy', accuracyM: 3000 })],
      request,
    );
    expect(result.excluded[0]?.reason).toBe('location_inaccurate');
  });

  it('respects the radius the provider set for themselves', async () => {
    const result = await engine.match(
      [candidate({ providerId: 'far', straightDistanceKm: 40, maxRadiusKm: 15 })],
      request,
    );
    expect(result.excluded[0]?.reason).toBe('outside_provider_radius');
  });

  it('scores a missing skill down without crashing', async () => {
    const result = await engine.match(
      [candidate({ providerId: 'wrong-trade', skills: ['gardening'], priceIls: null })],
      request,
    );
    expect(result.ranked[0]?.breakdown.skillMatch.score).toBe(0);
  });

  it('returns an empty ranking, not an error, when nobody is eligible', async () => {
    const result = await engine.match([], request);
    expect(result.ranked).toEqual([]);
    expect(result.excluded).toEqual([]);
  });
});
