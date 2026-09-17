import { describe, expect, it } from 'vitest';
import {
  availabilityPhrase,
  type AvailabilitySummary,
} from '@/domains/availability/summary';

/**
 * Availability, in one sentence (spec §55, §72).
 *
 * This is the only availability statement a customer ever sees, so it is the
 * place where a small imprecision becomes a lie. The case that prompted these
 * tests: the profile of a provider who had just ACCEPTED the customer's own
 * job read "אין זמינות בשבועיים הקרובים", because BUSY is not available now
 * and the seeded provider had declared no weekly hours, so the fortnight scan
 * found nothing. Every part of that computation was right and the sentence
 * was still false.
 */
const base: AvailabilitySummary = {
  availableNow: false,
  openUntil: null,
  onlineUntil: null,
  nextAvailableAt: null,
  state: 'OFFLINE',
  hasPlan: false,
};

// A fixed "now" so the day arithmetic is not a function of the test clock.
// Thursday 17 September 2026, 12:00 Israel time.
const NOW = new Date('2026-09-17T09:00:00.000Z');
const TZ = 'Asia/Jerusalem';

const phrase = (patch: Partial<AvailabilitySummary>) =>
  availabilityPhrase({ ...base, ...patch }, NOW, TZ);

describe('availabilityPhrase', () => {
  it('leads with the end of the shift when available now', () => {
    expect(phrase({ availableNow: true, state: 'ONLINE', openUntil: '17:00' })).toBe(
      'זמין עד 17:00',
    );
  });

  it('prefers a declared shift end over the planned window end', () => {
    // The provider said "accepting jobs until 14:30"; the plan runs to 17:00.
    // Their own choice is the stricter and more recent statement.
    expect(
      phrase({
        availableNow: true,
        state: 'ONLINE',
        openUntil: '17:00',
        onlineUntil: '2026-09-17T11:30:00.000Z',
        hasPlan: true,
      }),
    ).toBe('זמין עד 14:30');
  });

  it('says "available now" when there is no end to state', () => {
    expect(phrase({ availableNow: true, state: 'ONLINE' })).toBe('זמין כרגע');
  });

  it('REGRESSION: a provider on a job is busy now, not unavailable for a fortnight', () => {
    expect(phrase({ state: 'BUSY' })).toBe('בעבודה כרגע');
    expect(
      phrase({ state: 'BUSY', hasPlan: true, nextAvailableAt: '2026-09-17T12:30:00.000Z' }),
    ).toBe('בעבודה כרגע · פנוי מ-15:30');
  });

  it('distinguishes "we do not know" from "there is none"', () => {
    // No weekly hours declared and switched off: nothing to assert.
    expect(phrase({ state: 'OFFLINE', hasPlan: false })).toBe('לא פרסם שעות קבועות');
    // Hours declared, and genuinely nothing free inside the lookahead.
    expect(phrase({ state: 'OFFLINE', hasPlan: true })).toBe('אין זמינות בשבועיים הקרובים');
  });

  it('names today, tomorrow and a weekday, in the platform timezone', () => {
    expect(phrase({ hasPlan: true, nextAvailableAt: '2026-09-17T14:00:00.000Z' })).toBe(
      'זמין מ-17:00',
    );
    expect(phrase({ hasPlan: true, nextAvailableAt: '2026-09-18T05:00:00.000Z' })).toBe(
      'זמין מחר מ-08:00',
    );
    // Sunday 20 September, 08:00 local.
    expect(phrase({ hasPlan: true, nextAvailableAt: '2026-09-20T05:00:00.000Z' })).toBe(
      'זמין ביום ראשון מ-08:00',
    );
  });

  it('reads the clock in the platform timezone, not the runtime default', () => {
    // 22:30 UTC is 01:30 the NEXT day in Israel, so this must not read as
    // "today at 22:30" — the day boundary is a local one.
    expect(phrase({ hasPlan: true, nextAvailableAt: '2026-09-17T22:30:00.000Z' })).toBe(
      'זמין מחר מ-01:30',
    );
  });
});
