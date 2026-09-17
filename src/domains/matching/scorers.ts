import { clamp, round, scaleLinear } from '@/domains/geo/math';
import type { MatchRequest, ProviderCandidate } from './types';

/**
 * Individual scoring signals (spec §13). Each returns 0..100 with a
 * human-readable reason so the matching debugger (spec §34) can explain a
 * ranking instead of just asserting it.
 *
 * Every scorer is a pure function: no I/O, no React, no database. That is
 * what makes the matching engine unit-testable (spec §13, §49).
 */
export interface SignalScore {
  readonly score: number;
  readonly reason: string;
}

/** SkillMatcher — does this provider actually do this work? */
export function scoreSkillMatch(
  candidate: ProviderCandidate,
  request: MatchRequest,
): SignalScore {
  const required = request.requiredSkills;
  if (required.length === 0) {
    return { score: 80, reason: 'לא הוגדרו מיומנויות נדרשות' };
  }

  const held = new Set(candidate.skills.map((s) => s.toLowerCase()));
  const matched = required.filter((s) => held.has(s.toLowerCase()));
  const ratio = matched.length / required.length;

  // A provider offering an explicit price for the exact service has
  // demonstrably configured themselves for it — stronger evidence than a
  // category-level skill tag alone.
  const hasExplicitPrice = candidate.priceIls !== null;
  const base = ratio * 100;
  const score = clamp(hasExplicitPrice ? Math.min(100, base + 10) : base, 0, 100);

  return {
    score: round(score, 2),
    reason:
      ratio === 1
        ? hasExplicitPrice
          ? 'התאמה מלאה למיומנויות, עם מחיר מוגדר לשירות'
          : 'התאמה מלאה למיומנויות'
        : `התאמה חלקית: ${matched.length}/${required.length} מיומנויות`,
  };
}

/** AvailabilityMatcher — can they take it right now? */
export function scoreAvailability(
  candidate: ProviderCandidate,
  maxLocationAgeSeconds: number,
): SignalScore {
  if (candidate.state !== 'ONLINE') {
    return { score: 0, reason: `אינו פנוי (${candidate.state})` };
  }

  // Freshness of the location fix is part of availability: a provider we
  // cannot currently locate is not dependably available (spec §18).
  const freshness = scaleLinear(candidate.locationAgeSeconds, 0, maxLocationAgeSeconds, 100, 40);
  const areaBonus = candidate.inServiceArea ? 0 : -25;
  const score = clamp(freshness + areaBonus, 0, 100);

  return {
    score: round(score, 2),
    reason: candidate.inServiceArea
      ? `זמין, מיקום עודכן לפני ${Math.round(candidate.locationAgeSeconds)} שניות`
      : 'זמין אך מחוץ לאזור השירות שהגדיר',
  };
}

/** ETACalculator scoring — sooner is better, with diminishing returns. */
export function scoreEta(etaMinutes: number | null): SignalScore {
  if (etaMinutes === null) {
    // Routing unavailable. Score neutrally rather than inventing a number
    // (spec §44) so the candidate is neither rewarded nor eliminated.
    return { score: 50, reason: 'לא ניתן לחשב זמן הגעה — ניקוד ניטרלי' };
  }
  const score = scaleLinear(etaMinutes, 5, 45, 100, 10);
  return {
    score: round(clamp(score, 0, 100), 2),
    reason: `זמן הגעה משוער ${Math.round(etaMinutes)} דקות`,
  };
}

/** ReliabilityScorer — do they show up, and do they answer? */
export function scoreReliability(candidate: ProviderCandidate): SignalScore {
  const totalJobs = candidate.completedJobs + candidate.cancelledJobs;

  // New providers get a deliberately mid-range prior: neither punished out of
  // the market nor trusted like a proven one.
  if (totalJobs < 5) {
    return { score: 60, reason: 'היסטוריה מוגבלת — ניקוד התחלתי' };
  }

  const completionRate = candidate.completedJobs / totalJobs;
  const acceptanceRate =
    candidate.offersReceived > 0 ? candidate.offersAccepted / candidate.offersReceived : 0.5;

  const responsiveness =
    candidate.avgResponseSeconds === null
      ? 60
      : scaleLinear(candidate.avgResponseSeconds, 5, 60, 100, 30);

  const score = clamp(
    completionRate * 55 + acceptanceRate * 20 + (responsiveness / 100) * 25,
    0,
    100,
  );

  return {
    score: round(score, 2),
    reason: `${Math.round(completionRate * 100)}% השלמה, ${Math.round(acceptanceRate * 100)}% היענות`,
  };
}

/** RatingScorer — quality as judged by customers, damped by sample size. */
export function scoreRating(candidate: ProviderCandidate): SignalScore {
  if (candidate.ratingAvg === null || candidate.ratingCount === 0) {
    return { score: 60, reason: 'אין דירוגים עדיין — ניקוד התחלתי' };
  }

  // Bayesian shrinkage toward the platform mean so a single 5★ review does
  // not outrank a long, strong record.
  const priorMean = 4.5;
  const priorWeight = 10;
  const adjusted =
    (candidate.ratingAvg * candidate.ratingCount + priorMean * priorWeight) /
    (candidate.ratingCount + priorWeight);

  const score = scaleLinear(adjusted, 3.0, 5.0, 0, 100);
  return {
    score: round(clamp(score, 0, 100), 2),
    reason: `דירוג ${candidate.ratingAvg.toFixed(1)} מתוך ${candidate.ratingCount} ביקורות`,
  };
}

/** PriceScorer — cheaper scores higher, but it is only 5% of the decision. */
export function scorePrice(
  candidate: ProviderCandidate,
  referencePriceIls: number | null,
): SignalScore {
  if (candidate.priceIls === null) {
    return { score: 50, reason: 'לא הוגדר מחיר לשירות — ניקוד ניטרלי' };
  }
  if (referencePriceIls === null || referencePriceIls <= 0) {
    return { score: 60, reason: 'אין מחיר ייחוס להשוואה' };
  }

  const ratio = candidate.priceIls / referencePriceIls;
  // 0.7x reference → 100, 1.3x reference → 0.
  const score = scaleLinear(ratio, 0.7, 1.3, 100, 0);
  const delta = Math.round((ratio - 1) * 100);

  return {
    score: round(clamp(score, 0, 100), 2),
    reason:
      delta === 0
        ? 'מחיר זהה למחיר הייחוס'
        : delta < 0
          ? `${Math.abs(delta)}% מתחת למחיר הייחוס`
          : `${delta}% מעל מחיר הייחוס`,
  };
}

/** ExperienceScorer — years in the trade plus volume delivered. */
export function scoreExperience(candidate: ProviderCandidate): SignalScore {
  const years = scaleLinear(candidate.yearsExperience, 0, 15, 30, 100);
  const volume = scaleLinear(candidate.completedJobs, 0, 300, 30, 100);
  const score = clamp(years * 0.6 + volume * 0.4, 0, 100);
  return {
    score: round(score, 2),
    reason: `${candidate.yearsExperience} שנות ניסיון, ${candidate.completedJobs} עבודות שהושלמו`,
  };
}
