/**
 * זיהוי לקוח דומה. הכלל: מתריעים, לא מאחדים ולא חוסמים.
 */

import { describe, expect, it } from 'vitest';
import { findSimilarCustomers, normalizeForMatch } from '../lib/customerMatch';
import type { Customer } from '../types';

const customer = (over: Partial<Customer> & { name: string; address: string }): Customer => ({
  id: `cus_${over.name}`, customerNumber: '1001', createdAt: 'x', updatedAt: 'x', ...over,
});

const existing: Customer[] = [
  customer({ id: 'cus_1', name: 'מסעדת הגפן', address: 'הרצל 10, תל אביב', phone: '050-1234567' }),
  customer({ id: 'cus_2', name: 'בניין רימון', address: 'האלון 3, חיפה' }),
  customer({ id: 'cus_3', name: 'מרפאת שיניים', address: 'האלון 3, חיפה', phone: '03-7654321' }),
  customer({ id: 'cus_4', name: 'סניף ב', address: 'דיזנגוף 1, תל אביב', archived: true }),
];

describe('נרמול להשוואה', () => {
  it('רווחים, מקפים וגרשיים אינם משנים', () => {
    expect(normalizeForMatch('מסעדת  הגפן')).toBe(normalizeForMatch('מסעדת הגפן'));
    expect(normalizeForMatch('הרצל 10, תל-אביב')).toBe(normalizeForMatch('הרצל 10 תל אביב'));
    expect(normalizeForMatch('דני בע״מ')).toBe(normalizeForMatch('דני בעמ'));
  });
});

describe('איתור דומים', () => {
  it('שם וכתובת זהים – כנראה אותו לקוח', () => {
    const m = findSimilarCustomers(
      { name: 'מסעדת הגפן', address: 'הרצל 10, תל-אביב' }, existing,
    );
    expect(m).toHaveLength(1);
    expect(m[0].strength).toBe('same');
    expect(m[0].reasons).toContain('אותו שם');
    expect(m[0].reasons).toContain('אותה כתובת');
  });

  it('אותו טלפון בשם אחר – ייתכן אותו לקוח', () => {
    const m = findSimilarCustomers(
      { name: 'הגפן מסעדות בעמ', address: 'ויצמן 4, רמת גן', phone: '0501234567' }, existing,
    );
    expect(m[0].strength).toBe('likely');
    expect(m[0].reasons).toEqual(['אותו טלפון']);
  });

  it('אותה כתובת בשם אחר – דומה בלבד, כי זה מצב אמיתי', () => {
    const m = findSimilarCustomers({ name: 'משרד רואי חשבון', address: 'האלון 3, חיפה' }, existing);
    expect(m.every((x) => x.strength === 'possible')).toBe(true);
    expect(m).toHaveLength(2);
  });

  it('לקוח חדש לגמרי אינו מדווח', () => {
    expect(findSimilarCustomers({ name: 'חדש', address: 'רחוב אחר 9, אילת' }, existing)).toEqual([]);
  });

  it('לקוח מאורכב אינו מוצע', () => {
    const m = findSimilarCustomers({ name: 'סניף ב', address: 'דיזנגוף 1, תל אביב' }, existing);
    expect(m).toEqual([]);
  });

  it('טיוטה ריקה אינה מפיקה התראות', () => {
    expect(findSimilarCustomers({ name: '', address: '' }, existing)).toEqual([]);
  });

  it('אינו מאחד ואינו משנה את הרשומות הקיימות', () => {
    const before = JSON.stringify(existing);
    findSimilarCustomers({ name: 'מסעדת הגפן', address: 'הרצל 10, תל אביב' }, existing);
    expect(JSON.stringify(existing)).toBe(before);
  });

  it('מחזיר חמש הצעות לכל היותר', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      customer({ id: `c${i}`, name: `לקוח ${i}`, address: 'הרצל 10, תל אביב' }));
    expect(findSimilarCustomers({ name: 'אחר', address: 'הרצל 10, תל אביב' }, many).length)
      .toBeLessThanOrEqual(5);
  });
});
