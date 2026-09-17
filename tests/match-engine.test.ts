import { describe, expect, it } from 'vitest';
import {
  availabilityScore,
  distanceScore,
  experienceScore,
  firstRadius,
  nextRadius,
  normaliseWeights,
  priceFitScore,
  rankCandidates,
  ratingScore,
  reliabilityScore,
  responseSpeedScore,
  scoreCandidate,
} from '@/lib/services/matching/engine';
import type { MatchCandidate, MatchJobContext } from '@/lib/services/matching/types';
import { SETTINGS_DEFAULTS } from '@/lib/services/settings/schema';

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    providerId: 'p1',
    userId: 'u1',
    businessName: 'עסק',
    ownerName: 'בעלים',
    avatarUrl: null,
    distanceKm: 2,
    isAvailable: true,
    locationAgeSeconds: 60,
    ratingAvg: 4.5,
    ratingCount: 20,
    completedJobs: 25,
    cancelledJobs: 1,
    avgResponseSeconds: 300,
    servesArea: true,
    matchesService: true,
    basePrice: 300,
    yearsExperience: 8,
    isVerified: true,
    ...overrides,
  };
}

const context: MatchJobContext = {
  categoryId: 'cat-1',
  serviceId: 'svc-1',
  urgency: 'now',
  budgetMin: 200,
  budgetMax: 600,
  favoriteProviderIds: [],
  searchRadiusKm: 5,
};

describe('match score components', () => {
  it('scores distance as a linear decay across the search radius', () => {
    expect(distanceScore(0, 5)).toBe(1);
    expect(distanceScore(5, 5)).toBe(0);
    expect(distanceScore(2.5, 5)).toBeCloseTo(0.5, 5);
    // Beyond the radius the score floors rather than going negative.
    expect(distanceScore(20, 5)).toBe(0);
  });

  it('gives an unrated provider a neutral score rather than punishing them', () => {
    expect(ratingScore(0, 0)).toBeGreaterThan(0.5);
    expect(ratingScore(0, 0)).toBeLessThan(0.7);
  });

  it('weights a rating by how many reviews back it', () => {
    const oneFiveStar = ratingScore(5, 1);
    const manyFiveStars = ratingScore(5, 50);
    expect(manyFiveStars).toBeGreaterThan(oneFiveStar);
  });

  it('ranks a low rating below an unrated provider', () => {
    expect(ratingScore(1.5, 20)).toBeLessThan(ratingScore(0, 0));
  });

  it('excludes an unavailable provider from urgent work but not from scheduled work', () => {
    expect(availabilityScore(false, null, 'now')).toBe(0);
    expect(availabilityScore(false, null, 'tomorrow')).toBeGreaterThan(0);
  });

  it('rewards a freshly reported position', () => {
    expect(availabilityScore(true, 30, 'now')).toBeGreaterThan(availabilityScore(true, 3600, 'now'));
  });

  it('scores response speed inversely to the response time', () => {
    expect(responseSpeedScore(0)).toBe(1);
    expect(responseSpeedScore(1800)).toBe(0);
    expect(responseSpeedScore(null)).toBe(0.5);
  });

  it('grows experience logarithmically', () => {
    expect(experienceScore(0)).toBe(0);
    expect(experienceScore(50)).toBeCloseTo(1, 5);
    // The first five jobs are worth more than the last five.
    expect(experienceScore(5) - experienceScore(0)).toBeGreaterThan(
      experienceScore(50) - experienceScore(45),
    );
  });

  it('treats a price inside the budget as a full fit', () => {
    expect(priceFitScore(300, 200, 600)).toBe(1);
    expect(priceFitScore(900, 200, 600)).toBe(0);
    expect(priceFitScore(null, 200, 600)).toBe(0);
  });

  it('only ever penalises for cancellations', () => {
    expect(reliabilityScore(20, 0)).toBe(0);
    expect(reliabilityScore(10, 10)).toBeLessThan(0);
    // Too little history to judge.
    expect(reliabilityScore(1, 1)).toBe(0);
  });
});

describe('candidate ranking', () => {
  it('produces a score between 0 and 100', () => {
    const { score } = scoreCandidate(candidate(), context);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('prefers a closer provider when everything else matches', () => {
    const near = scoreCandidate(candidate({ providerId: 'near', distanceKm: 1 }), context);
    const far = scoreCandidate(candidate({ providerId: 'far', distanceKm: 4.5 }), context);
    expect(near.score).toBeGreaterThan(far.score);
  });

  it('does not rank on distance alone', () => {
    // Closer, but unavailable, unrated and inexperienced.
    const closeButPoor = scoreCandidate(
      candidate({
        providerId: 'close',
        distanceKm: 0.5,
        isAvailable: false,
        ratingAvg: 2,
        ratingCount: 30,
        completedJobs: 0,
        cancelledJobs: 5,
        avgResponseSeconds: 2400,
      }),
      context,
    );
    const fartherButStrong = scoreCandidate(
      candidate({ providerId: 'strong', distanceKm: 4 }),
      context,
    );
    expect(fartherButStrong.score).toBeGreaterThan(closeButPoor.score);
  });

  it('gives favourites a configurable boost', () => {
    const plain = scoreCandidate(candidate(), context);
    const favourite = scoreCandidate(candidate(), {
      ...context,
      favoriteProviderIds: ['p1'],
    });
    expect(favourite.score).toBeGreaterThan(plain.score);
  });

  it('drops unverified providers when verified_only is set', () => {
    const ranked = rankCandidates(
      [candidate({ providerId: 'a' }), candidate({ providerId: 'b', isVerified: false })],
      context,
    );
    expect(ranked.map((entry) => entry.candidate.providerId)).toEqual(['a']);
  });

  it('caps the shortlist at max_providers_per_job', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      candidate({ providerId: `p${index}`, distanceKm: index * 0.1 }),
    );
    const ranked = rankCandidates(many, context);
    expect(ranked).toHaveLength(SETTINGS_DEFAULTS.matching.max_providers_per_job);
  });

  it('is deterministic for identical candidates', () => {
    const pool = [
      candidate({ providerId: 'b' }),
      candidate({ providerId: 'a' }),
      candidate({ providerId: 'c' }),
    ];
    const first = rankCandidates(pool, context).map((entry) => entry.candidate.providerId);
    const second = rankCandidates([...pool].reverse(), context).map(
      (entry) => entry.candidate.providerId,
    );
    expect(first).toEqual(second);
  });

  it('keeps an out-of-radius provider whose declared service area covers the job', () => {
    const ranked = rankCandidates(
      [candidate({ providerId: 'far', distanceKm: 80, servesArea: true })],
      context,
    );
    expect(ranked).toHaveLength(1);
  });
});

describe('radius expansion', () => {
  const matching = SETTINGS_DEFAULTS.matching;

  it('starts at the smallest step', () => {
    expect(firstRadius(matching)).toBe(5);
  });

  it('widens 5 → 10 → 20 and then stops', () => {
    expect(nextRadius(5, matching)).toBe(10);
    expect(nextRadius(10, matching)).toBe(20);
    expect(nextRadius(20, matching)).toBeNull();
  });
});

describe('weight normalisation', () => {
  it('leaves weights that already sum to 1 untouched', () => {
    expect(normaliseWeights(SETTINGS_DEFAULTS.match_weights)).toEqual(
      SETTINGS_DEFAULTS.match_weights,
    );
  });

  it('rescales weights that do not sum to 1', () => {
    const doubled = Object.fromEntries(
      Object.entries(SETTINGS_DEFAULTS.match_weights).map(([key, value]) => [key, value * 2]),
    ) as typeof SETTINGS_DEFAULTS.match_weights;

    const normalised = normaliseWeights(doubled);
    const total = Object.values(normalised).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('falls back to defaults when every weight is zero', () => {
    const zeroed = Object.fromEntries(
      Object.keys(SETTINGS_DEFAULTS.match_weights).map((key) => [key, 0]),
    ) as typeof SETTINGS_DEFAULTS.match_weights;
    expect(normaliseWeights(zeroed)).toEqual(SETTINGS_DEFAULTS.match_weights);
  });
});
