import { describe, expect, it } from 'vitest';
import { deleteAtPath, getArray, getAtPath, getBoolean, getString, setAtPath } from '@/lib/paths';

/** עדכון שדות לפי נתיב — הבסיס לשמירה האוטומטית ולקפיצה לשדה שגוי. */
describe('עדכון לפי נתיב', () => {
  it('מציב ערך מקונן בלי לשנות את המקור', () => {
    const source = { a: { b: 1 } };
    const next = setAtPath(source, 'a.c', 2);
    expect(next).toEqual({ a: { b: 1, c: 2 } });
    expect(source).toEqual({ a: { b: 1 } });
  });

  it('יוצר מערך כשהמקטע הבא הוא אינדקס', () => {
    const next = setAtPath({}, 'items.0.name', 'א');
    expect(next).toEqual({ items: [{ name: 'א' }] });
  });

  it('מעדכן פריט קיים במערך', () => {
    const source = { items: [{ name: 'א' }, { name: 'ב' }] };
    const next = setAtPath(source, 'items.1.name', 'ג');
    expect((next.items as Array<{ name: string }>)[1]!.name).toBe('ג');
    expect((source.items as Array<{ name: string }>)[1]!.name).toBe('ב');
  });

  it('קורא ערך מקונן', () => {
    expect(getAtPath({ a: { b: [{ c: 5 }] } }, 'a.b.0.c')).toBe(5);
    expect(getAtPath({ a: 1 }, 'x.y')).toBeUndefined();
  });

  it('מסיר פריט ממערך ומשמר את הסדר', () => {
    const next = deleteAtPath({ items: ['א', 'ב', 'ג'] }, 'items.1');
    expect(next.items).toEqual(['א', 'ג']);
  });

  it('מסיר מפתח מאובייקט', () => {
    const next = deleteAtPath({ a: 1, b: 2 }, 'b');
    expect(next).toEqual({ a: 1 });
  });

  it('קוראי העזר מחזירים ברירות מחדש בטוחות', () => {
    expect(getArray({}, 'missing')).toEqual([]);
    expect(getString({}, 'missing')).toBe('');
    expect(getString({ n: 5 }, 'n')).toBe('5');
    expect(getBoolean({ flag: true }, 'flag')).toBe(true);
    expect(getBoolean({ flag: 'true' }, 'flag')).toBe(false);
  });
});
