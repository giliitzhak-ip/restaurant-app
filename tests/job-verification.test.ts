import { describe, expect, it } from 'vitest';
import {
  autoConfirmDue,
  checkArrival,
  isPriceGapFlagged,
  priceGap,
  verificationState,
} from '@/lib/services/jobs/verification';
import { SETTINGS_DEFAULTS } from '@/lib/services/settings/defaults';

const verification = SETTINGS_DEFAULTS.verification;

// Dizengoff Center, Tel Aviv, and a point a short walk away.
const JOB = { lat: 32.0749, lng: 34.7748 };

describe('checkArrival', () => {
  it('verifies a check-in inside the tolerance', () => {
    const result = checkArrival(JOB, { lat: 32.0751, lng: 34.775 }, verification);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verified).toBe(true);
    expect(result.distanceM).toBeLessThan(verification.arrival_radius_m);
  });

  it('records the distance of a check-in that is too far, rather than discarding it', () => {
    // Haifa — about 85 km away.
    const result = checkArrival(JOB, { lat: 32.794, lng: 34.9896 }, verification);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verified).toBe(false);
    expect(result.distanceM).toBeGreaterThan(80_000);
  });

  it('honours a wider tolerance when the settings allow it', () => {
    const lenient = { ...verification, arrival_radius_m: 2000 };
    // ~1.1 km north of the job.
    const result = checkArrival(JOB, { lat: 32.0849, lng: 34.7748 }, lenient);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verified).toBe(true);
  });

  it('rejects a missing or nonsensical position', () => {
    expect(checkArrival(JOB, null, verification)).toEqual({ ok: false, error: 'invalid_location' });
    expect(checkArrival(JOB, { lat: 999, lng: 0 }, verification)).toEqual({
      ok: false,
      error: 'invalid_location',
    });
    expect(checkArrival(null, JOB, verification)).toEqual({
      ok: false,
      error: 'job_has_no_location',
    });
  });
});

describe('priceGap', () => {
  it('measures the gap in both directions', () => {
    expect(priceGap(1000, 1200)).toBeCloseTo(0.2);
    expect(priceGap(1000, 800)).toBeCloseTo(0.2);
  });

  it('is undecidable without both numbers', () => {
    expect(priceGap(null, 800)).toBeNull();
    expect(priceGap(1000, null)).toBeNull();
    expect(priceGap(0, 800)).toBeNull();
  });

  it('flags only a gap above the configured threshold', () => {
    expect(isPriceGapFlagged(1000, 1200, verification)).toBe(false); // 20% < 25%
    expect(isPriceGapFlagged(1000, 1400, verification)).toBe(true);
    expect(isPriceGapFlagged(1000, null, verification)).toBe(false);
  });
});

describe('verificationState', () => {
  const completedAt = '2026-01-01T10:00:00Z';

  it('is verified once every required signal is present', () => {
    const state = verificationState(
      {
        arrivalVerifiedAt: '2026-01-01T09:00:00Z',
        completionPhotos: 1,
        customerConfirmedAt: '2026-01-01T11:00:00Z',
        completedAt,
      },
      verification,
    );

    expect(state.level).toBe('verified');
    expect(state.missing).toEqual([]);
    expect(state.suspectedNoShow).toBe(false);
  });

  it('names exactly what is missing', () => {
    const state = verificationState(
      {
        arrivalVerifiedAt: null,
        completionPhotos: 0,
        customerConfirmedAt: null,
        completedAt,
      },
      { ...verification, require_completion_photo: true },
    );

    expect(state.level).toBe('unverified');
    expect(state.missing).toEqual(['arrival', 'photo', 'confirmation']);
  });

  it('counts a single independent signal as partial, not unverified', () => {
    const state = verificationState(
      {
        arrivalVerifiedAt: '2026-01-01T09:00:00Z',
        completionPhotos: 0,
        customerConfirmedAt: null,
        completedAt,
      },
      verification,
    );

    expect(state.level).toBe('partial');
    expect(state.missing).toEqual(['confirmation']);
  });

  it('only suspects a no-show once the confirmation window has passed', () => {
    const evidence = {
      arrivalVerifiedAt: null,
      completionPhotos: 0,
      customerConfirmedAt: null,
      completedAt,
    };

    // Two hours after completion: the customer simply has not replied yet.
    expect(
      verificationState(evidence, verification, new Date('2026-01-01T12:00:00Z')).suspectedNoShow,
    ).toBe(false);

    // Three days later, with no arrival, no photo and no confirmation.
    expect(
      verificationState(evidence, verification, new Date('2026-01-04T12:00:00Z')).suspectedNoShow,
    ).toBe(true);
  });

  it('never suspects a no-show when any signal exists', () => {
    const state = verificationState(
      {
        arrivalVerifiedAt: '2026-01-01T09:00:00Z',
        completionPhotos: 0,
        customerConfirmedAt: null,
        completedAt,
      },
      verification,
      new Date('2026-01-04T12:00:00Z'),
    );

    expect(state.suspectedNoShow).toBe(false);
  });
});

describe('autoConfirmDue', () => {
  it('comes due after the configured hours', () => {
    const completedAt = '2026-01-01T10:00:00Z';

    expect(autoConfirmDue(completedAt, verification, new Date('2026-01-02T09:00:00Z'))).toBe(false);
    expect(autoConfirmDue(completedAt, verification, new Date('2026-01-03T11:00:00Z'))).toBe(true);
  });

  it('is never due for a job that has not completed', () => {
    expect(autoConfirmDue(null, verification)).toBe(false);
    expect(autoConfirmDue('not-a-date', verification)).toBe(false);
  });
});
