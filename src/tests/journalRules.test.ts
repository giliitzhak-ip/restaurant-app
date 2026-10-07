/**
 * כללי הסיום – מקור אמת אחד ללקוח ולשרת.
 * כאן נבדקים גם המצבים שהביקורת סימנה כחסרים: ביקור ללא תכשיר,
 * ולידציה מספרית, ותאריכים.
 */

import { describe, expect, it } from 'vitest';
import {
  blockingOnly, isPastDate, isPositiveNumber, isTreatmentWithoutProduct,
  isValidDate, journalIssues, payloadErrors,
} from '../../shared/journalRules.mjs';
import type { FullJournal, Journal, JournalAction, JournalMaterial } from '../types';

const NOW = new Date('2026-05-01T09:00:00.000Z');

const journal = (over: Partial<Journal> = {}): Journal => ({
  id: 'jrn_1', journalNumber: 1, status: 'draft', startedAt: '2026-05-01T08:00:00.000Z',
  workKind: 'private', visitKind: 'new', exterminatorId: 'ext', exterminatorName: 'יצחק',
  licenseNumber: '123', preTreatmentActions: [], preventionRecommendations: [],
  warrantyKind: 'none', customerAcknowledged: true, createdAt: 'x', updatedAt: 'x', lastStep: 8,
  customerId: 'cus_1', siteAddress: 'הרצל 1', ...over,
});

const action = (kind: JournalAction['kind']): JournalAction =>
  ({ id: `jac_${kind}`, journalId: 'jrn_1', kind, areas: [], equipment: [] });

const material = (over: Partial<JournalMaterial['execution']> = {}): JournalMaterial => ({
  id: 'jmt_1', journalId: 'jrn_1', materialId: 'mat_1', materialNameSnapshot: 'דרגון',
  conditionAnswers: {},
  execution: {
    batchNumber: 'B-1', packageExpiry: '2027-01-01', chosenDoseText: '10 מ"ל',
    materialAmount: '20', waterAmount: '5', coverage: '50', coverageUnit: 'sqm', ...over,
  },
});

function full(over: Partial<FullJournal> = {}): FullJournal {
  return {
    journal: journal(),
    pests: [{ id: 'jps_1', journalId: 'jrn_1', pestId: 'rat', severity: 'low', areas: [], signs: [] }],
    actions: [action('spraying')],
    materials: [material()],
    baitStations: [],
    signatures: [
      { id: 's1', journalId: 'jrn_1', role: 'exterminator', signerName: 'יצחק', image: 'x', signedAt: 'x' },
      { id: 's2', journalId: 'jrn_1', role: 'customer', signerName: 'דני', image: 'x', signedAt: 'x' },
    ],
    attachments: [],
    ...over,
  };
}

const fields = (f: FullJournal) => blockingOnly(journalIssues(f, NOW)).map((i) => i.field);

describe('עזרי ולידציה', () => {
  it('מספר חיובי', () => {
    expect(isPositiveNumber('20')).toBe(true);
    expect(isPositiveNumber('2.5')).toBe(true);
    expect(isPositiveNumber('2,5')).toBe(true);     // פסיק עשרוני
    expect(isPositiveNumber('0')).toBe(false);
    expect(isPositiveNumber('-3')).toBe(false);
    expect(isPositiveNumber('בערך 20')).toBe(false);
    expect(isPositiveNumber('')).toBe(false);
  });

  it('תאריך תקין ותאריך שעבר', () => {
    expect(isValidDate('2026-05-01')).toBe(true);
    expect(isValidDate('לא הוזן')).toBe(false);
    expect(isPastDate('2026-04-30', NOW)).toBe(true);
    expect(isPastDate('2026-06-01', NOW)).toBe(false);
  });
});

describe('יומן מלא עובר', () => {
  it('ללא ממצאים חוסמים', () => {
    expect(fields(full())).toEqual([]);
  });
});

describe('ביקור ללא תכשיר', () => {
  it('ניטור בלבד אינו דורש תכשיר', () => {
    const f = full({ actions: [action('monitoring')], materials: [] });
    expect(isTreatmentWithoutProduct(f.journal, f.actions)).toBe(true);
    expect(fields(f)).toEqual([]);
  });

  it('איטום ומלכודות אינם דורשים תכשיר', () => {
    const f = full({ actions: [action('sealing'), action('traps')], materials: [] });
    expect(fields(f)).toEqual([]);
  });

  it('ריסוס ללא תכשיר מקבל הערה לא חוסמת', () => {
    const f = full({ materials: [] });
    expect(fields(f)).toEqual([]);
    expect(journalIssues(f, NOW).map((i) => i.field)).toContain('materials');
  });

  it('סימון "לא נעשה שימוש בתכשיר" מחייב תיעוד סיבה', () => {
    const f = full({ journal: journal({ noProductUsed: true }), materials: [] });
    expect(fields(f)).toEqual(['noProductReason']);
  });

  it('סימון עם סיבה מתועדת עובר', () => {
    const f = full({
      journal: journal({ noProductUsed: true, noProductReason: 'ביקור ניטור בלבד' }),
      materials: [],
    });
    expect(fields(f)).toEqual([]);
  });

  it('סימון יחד עם תכשיר ביומן הוא סתירה חוסמת', () => {
    const f = full({ journal: journal({ noProductUsed: true, noProductReason: 'ניטור' }) });
    expect(fields(f)).toContain('noProductUsed');
  });
});

describe('ולידציה מספרית ותאריכית', () => {
  it('כמות חומר שאינה מספר נחסמת', () => {
    expect(fields(full({ materials: [material({ materialAmount: 'בערך חצי' })] })))
      .toEqual(['amount:jmt_1']);
  });

  it('כמות מים שאינה מספר נחסמת, אך כמות מים ריקה מותרת', () => {
    expect(fields(full({ materials: [material({ waterAmount: 'דלי' })] })))
      .toEqual(['water:jmt_1']);
    expect(fields(full({ materials: [material({ waterAmount: '' })] }))).toEqual([]);
  });

  it('היקף טיפול אפס נחסם', () => {
    expect(fields(full({ materials: [material({ coverage: '0' })] })))
      .toEqual(['coverage:jmt_1']);
  });

  it('תאריך תפוגה לא תקין נחסם', () => {
    expect(fields(full({ materials: [material({ packageExpiry: 'אין' })] })))
      .toEqual(['expiry:jmt_1']);
  });

  it('תאריך תפוגה שעבר אינו חוסם תיעוד, אבל מסומן', () => {
    const f = full({ materials: [material({ packageExpiry: '2026-01-01' })] });
    expect(fields(f)).toEqual([]);
    const issue = journalIssues(f, NOW).find((i) => i.field === 'expiry:jmt_1');
    expect(issue?.blocking).toBe(false);
    expect(issue?.message).toContain('עבר');
  });

  it('תאריך ביצוע לא תקין נחסם', () => {
    expect(fields(full({ journal: journal({ startedAt: 'מתישהו' }) }))).toContain('startedAt');
  });

  it('תאריך ביצוע בעתיד מקבל הערה לא חוסמת', () => {
    const f = full({ journal: journal({ startedAt: '2026-09-01T08:00:00.000Z' }) });
    expect(fields(f)).toEqual([]);
    expect(journalIssues(f, NOW).find((i) => i.field === 'startedAt')?.blocking).toBe(false);
  });
});

describe('ולידציה של מטען סנכרון – אותם כללים שבשרת', () => {
  it('יומן ללא סטטוס חוקי נדחה', () => {
    expect(payloadErrors('journals', { journalNumber: 1, startedAt: '2026-05-01', status: 'מה' }))
      .toContain('סטטוס יומן לא חוקי.');
  });

  it('יומן שהושלם חייב אישור לקוח', () => {
    const errors = payloadErrors('journals', {
      journalNumber: 1, startedAt: '2026-05-01', status: 'completed',
      customerId: 'c', licenseNumber: '1',
    });
    expect(errors).toContain('יומן שהושלם חייב לכלול אישור לקוח על קבלת ההנחיות.');
  });

  it('יומן שהושלם ללא תכשיר חייב סיבה מתועדת', () => {
    const errors = payloadErrors('journals', {
      journalNumber: 1, startedAt: '2026-05-01', status: 'completed',
      customerId: 'c', licenseNumber: '1', customerAcknowledged: true, noProductUsed: true,
    });
    expect(errors).toContain('יומן ללא תכשיר חייב לכלול תיעוד מדוע לא נעשה שימוש בתכשיר.');
  });

  it('תאריך ביצוע לא תקין נדחה גם בסנכרון', () => {
    expect(payloadErrors('journals', { journalNumber: 1, startedAt: 'מתישהו', status: 'draft' }))
      .toContain('תאריך ביצוע העבודה אינו תקין.');
  });

  it('טיוטה חלקית נקלטת', () => {
    expect(payloadErrors('journals', { journalNumber: 1, startedAt: '2026-05-01', status: 'draft' }))
      .toEqual([]);
  });
});
