import { describe, expect, it } from 'vitest';
import {
  cancelJobSchema,
  createJobSchema,
  createMessageSchema,
  createOfferSchema,
  createReviewSchema,
} from '@/lib/validation/jobs';
import { signUpSchema } from '@/lib/validation/auth';
import { phoneSchema } from '@/lib/validation/common';
import { searchProvidersSchema } from '@/lib/validation/providers';

const validJob = {
  categoryId: '11111111-1111-4111-8111-111111111111',
  title: 'נזילה במטבח',
  description: 'יש נזילה מתחת לכיור כבר יומיים.',
  address: 'הרצל 5, תל אביב',
  lat: 32.08,
  lng: 34.78,
};

describe('createJobSchema', () => {
  it('accepts a complete request', () => {
    expect(createJobSchema.safeParse(validJob).success).toBe(true);
  });

  it('rejects a description that says nothing', () => {
    const result = createJobSchema.safeParse({ ...validJob, description: 'תקלה' });
    expect(result.success).toBe(false);
  });

  it('rejects coordinates outside the world', () => {
    expect(createJobSchema.safeParse({ ...validJob, lat: 120 }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...validJob, lng: -500 }).success).toBe(false);
  });

  it('requires a date when the urgency is "scheduled"', () => {
    expect(
      createJobSchema.safeParse({ ...validJob, urgency: 'scheduled' }).success,
    ).toBe(false);

    expect(
      createJobSchema.safeParse({
        ...validJob,
        urgency: 'scheduled',
        scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
      }).success,
    ).toBe(true);
  });

  it('rejects a scheduled date in the past', () => {
    expect(
      createJobSchema.safeParse({
        ...validJob,
        urgency: 'scheduled',
        scheduledFor: new Date(Date.now() - 86_400_000).toISOString(),
      }).success,
    ).toBe(false);
  });

  it('rejects an inverted budget range', () => {
    expect(
      createJobSchema.safeParse({ ...validJob, budgetMin: 900, budgetMax: 100 }).success,
    ).toBe(false);
  });

  it('caps the number of attachments', () => {
    const media = Array.from({ length: 13 }, (_, index) => ({
      storagePath: `user/${index}.jpg`,
      kind: 'image' as const,
    }));
    expect(createJobSchema.safeParse({ ...validJob, media }).success).toBe(false);
  });
});

describe('createOfferSchema', () => {
  it('accepts a normal quote', () => {
    expect(createOfferSchema.safeParse({ price: 350, etaMinutes: 25 }).success).toBe(true);
  });

  it('rejects a zero or negative price', () => {
    expect(createOfferSchema.safeParse({ price: 0, etaMinutes: 25 }).success).toBe(false);
    expect(createOfferSchema.safeParse({ price: -100, etaMinutes: 25 }).success).toBe(false);
  });

  it('rejects a fractional ETA', () => {
    expect(createOfferSchema.safeParse({ price: 350, etaMinutes: 12.5 }).success).toBe(false);
  });

  it('rejects an ETA beyond a week', () => {
    expect(createOfferSchema.safeParse({ price: 350, etaMinutes: 20_000 }).success).toBe(false);
  });
});

describe('createReviewSchema', () => {
  it('accepts a rating with per-criterion scores', () => {
    const result = createReviewSchema.safeParse({
      rating: 5,
      comment: 'מצוין',
      criteria: { professionalism: 5, price: 4 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a rating outside 1–5', () => {
    expect(createReviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ rating: 6 }).success).toBe(false);
  });

  it('rejects a criterion score outside 1–5', () => {
    expect(
      createReviewSchema.safeParse({ rating: 4, criteria: { price: 9 } }).success,
    ).toBe(false);
  });
});

describe('createMessageSchema', () => {
  it('requires a body for a text message', () => {
    expect(createMessageSchema.safeParse({ messageType: 'text', body: '' }).success).toBe(false);
    expect(createMessageSchema.safeParse({ messageType: 'text', body: 'היי' }).success).toBe(true);
  });

  it('requires a storage path for an image message', () => {
    expect(createMessageSchema.safeParse({ messageType: 'image' }).success).toBe(false);
    expect(
      createMessageSchema.safeParse({ messageType: 'image', storagePath: 'user/a.jpg' }).success,
    ).toBe(true);
  });
});

describe('cancelJobSchema', () => {
  it('insists on a reason', () => {
    expect(cancelJobSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(cancelJobSchema.safeParse({ reason: 'מצאתי פתרון אחר' }).success).toBe(true);
  });
});

describe('signUpSchema', () => {
  const base = {
    email: 'user@example.com',
    password: 'Password123',
    fullName: 'ישראל ישראלי',
    acceptTerms: true as const,
  };

  it('accepts a customer and a provider', () => {
    expect(signUpSchema.safeParse({ ...base, role: 'customer' }).success).toBe(true);
    expect(signUpSchema.safeParse({ ...base, role: 'provider' }).success).toBe(true);
  });

  it('never lets the client ask for the admin role', () => {
    expect(signUpSchema.safeParse({ ...base, role: 'admin' }).success).toBe(false);
  });

  it('requires the terms to be accepted', () => {
    expect(signUpSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
  });

  it('rejects a short password', () => {
    expect(signUpSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('accepts Israeli formats', () => {
    for (const phone of ['0501234567', '+972501234567', '025551234']) {
      expect(phoneSchema.safeParse(phone).success).toBe(true);
    }
  });

  it('rejects malformed numbers', () => {
    for (const phone of ['12345', '05012345678', 'not-a-phone']) {
      expect(phoneSchema.safeParse(phone).success).toBe(false);
    }
  });
});

describe('searchProvidersSchema', () => {
  it('coerces query-string values and applies defaults', () => {
    const result = searchProvidersSchema.parse({ minRating: '4', page: '2' });
    expect(result.minRating).toBe(4);
    expect(result.page).toBe(2);
    expect(result.sort).toBe('recommended');
    expect(result.pageSize).toBe(20);
  });

  it('rejects an unknown sort key', () => {
    expect(searchProvidersSchema.safeParse({ sort: 'cheapest' }).success).toBe(false);
  });
});
