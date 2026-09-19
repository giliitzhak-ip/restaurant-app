import { describe, expect, it } from 'vitest';
import { PRODUCT_VERIFICATION_STALE_DAYS, productWarnings } from '@/schema/product';

/**
 * מאגר התכשירים: אין להסתמך עליו כמידע עדכני. כאן נבדק שהאזהרות
 * אכן מוצגות, ושתכשיר שאינו בתוקף חוסם.
 */
const NOW = new Date('2026-09-11T00:00:00Z');

const base = {
  tradeName: 'תכשיר דוגמה',
  registrationStatus: 'registered' as const,
  validUntil: '2027-01-01',
  verifiedAt: '2026-09-01T00:00:00Z',
  isActive: true,
};

describe('אזהרות תכשיר', () => {
  it('תכשיר רשום, בתוקף ומאומת לאחרונה — אין אזהרות', () => {
    expect(productWarnings(base, NOW)).toHaveLength(0);
  });

  it('רישום שבוטל — אזהרה חוסמת', () => {
    const warnings = productWarnings({ ...base, registrationStatus: 'revoked' }, NOW);
    expect(warnings[0]!.severity).toBe('blocking');
    expect(warnings[0]!.message).toContain('בוטל');
  });

  it('תוקף רישום שפג — אזהרה חוסמת', () => {
    const warnings = productWarnings({ ...base, registrationStatus: 'expired' }, NOW);
    expect(warnings.some((w) => w.severity === 'blocking')).toBe(true);
  });

  it('תאריך תוקף שעבר — אזהרה חוסמת', () => {
    const warnings = productWarnings({ ...base, validUntil: '2026-01-01' }, NOW);
    expect(warnings.some((w) => w.severity === 'blocking' && w.message.includes('תוקף'))).toBe(true);
  });

  it('סטטוס רישום שלא אומת — אזהרה שאינה חוסמת', () => {
    const warnings = productWarnings({ ...base, registrationStatus: 'unknown' }, NOW);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('warning');
    expect(warnings[0]!.message).toContain('לא אומת');
  });

  it('אימות מיושן — אזהרה שאינה חוסמת', () => {
    const stale = new Date(NOW.getTime() - (PRODUCT_VERIFICATION_STALE_DAYS + 10) * 86_400_000);
    const warnings = productWarnings({ ...base, verifiedAt: stale.toISOString() }, NOW);
    expect(warnings.some((w) => w.message.includes('לא אומת מול המקור הרשמי'))).toBe(true);
  });

  it('תכשיר לא פעיל — אזהרה', () => {
    expect(productWarnings({ ...base, isActive: false }, NOW).some((w) => w.message.includes('לא פעיל'))).toBe(true);
  });

  it('תכשיר בלי תאריך תוקף אינו נחסם בגלל התוקף', () => {
    const warnings = productWarnings({ ...base, validUntil: null }, NOW);
    expect(warnings.some((w) => w.message.includes('תוקף'))).toBe(false);
  });
});
