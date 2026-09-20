import { describe, expect, it } from 'vitest';
import { greetingForHour, syncLabel } from '@/features/home/HomePage';
import { isFollowUpOpen, startOfMonthIso } from '@/lib/repo';

/** לוגיקת מסך הבית: ברכה לפי שעה, ניסוח הסטטוס, וחישוב משימות פתוחות. */

describe('ברכה לפי שעת היום', () => {
  it.each([
    [5, 'בוקר טוב'],
    [8, 'בוקר טוב'],
    [11, 'בוקר טוב'],
    [12, 'צהריים טובים'],
    [15, 'צהריים טובים'],
    [16, 'צהריים טובים'],
    [17, 'ערב טוב'],
    [20, 'ערב טוב'],
    [21, 'ערב טוב'],
    [22, 'לילה טוב'],
    [2, 'לילה טוב'],
    [4, 'לילה טוב'],
  ])('שעה %i → %s', (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });

  it('כל השעות מחזירות ברכה בעברית', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(greetingForHour(hour)).toMatch(/[֐-׿]/);
    }
  });
});

describe('ניסוח מצב הסנכרון', () => {
  it.each([
    ['synced', 'מסונכרן'],
    ['pending', 'שומר…'],
    ['local', 'ממתין לחיבור'],
    ['error', 'שגיאת סנכרון'],
  ] as const)('%s → %s', (state, expected) => {
    expect(syncLabel(state)).toBe(expected);
  });
});

describe('משימות פתוחות', () => {
  const today = new Date('2026-09-20T10:00:00Z');

  it('משימה ללא מועד נחשבת פתוחה', () => {
    expect(isFollowUpOpen(null, today)).toBe(true);
    expect(isFollowUpOpen(undefined, today)).toBe(true);
    expect(isFollowUpOpen('', today)).toBe(true);
  });

  it('מועד שעבר — פתוחה', () => {
    expect(isFollowUpOpen('2026-09-10', today)).toBe(true);
  });

  it('מועד היום — פתוחה עד סוף היום', () => {
    expect(isFollowUpOpen('2026-09-20', today)).toBe(true);
  });

  it('מועד עתידי — אינה פתוחה', () => {
    expect(isFollowUpOpen('2026-10-01', today)).toBe(false);
  });

  it('תאריך לא תקין נחשב פתוח, כדי שלא ייעלם מהרשימה', () => {
    expect(isFollowUpOpen('לא-תאריך', today)).toBe(true);
  });
});

describe('תחילת החודש לספירת הארכיון', () => {
  it('מחזיר את היום הראשון בחודש בחצות UTC', () => {
    expect(startOfMonthIso(new Date('2026-09-20T18:30:00Z'))).toBe('2026-09-01T00:00:00.000Z');
  });

  it('עובד גם בתחילת שנה', () => {
    expect(startOfMonthIso(new Date('2026-01-05T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z');
  });
});
