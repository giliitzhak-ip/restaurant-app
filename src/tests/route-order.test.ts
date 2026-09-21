import { describe, expect, it } from 'vitest';
import { parseAddress, suggestedOrder } from '../lib/routeOrder';

describe('סדר מומלץ לפי כתובות', () => {
  it('מפרק כתובת לעיר, רחוב ומספר', () => {
    const a = parseAddress('הרצל 10, תל אביב');
    expect(a.number).toBe(10);
    expect(a.street).toContain('הרצל');
    expect(a.city).toContain('תל אביב');
  });

  it('מקבץ לפי עיר ואז לפי רחוב ומספר בית', () => {
    const stops = [
      { id: 'c', address: 'הרצל 22, תל אביב' },
      { id: 'a', address: 'האלון 3, חיפה' },
      { id: 'b', address: 'הרצל 4, תל אביב' },
      { id: 'd', address: 'האלון 11, חיפה' },
    ];
    const order = suggestedOrder(stops);
    // שתי הכתובות בחיפה צמודות, ובתוכן לפי מספר בית
    expect(order.indexOf('d') - order.indexOf('a')).toBe(1);
    expect(order.indexOf('c') - order.indexOf('b')).toBe(1);
  });

  it('אינו נופל על כתובת ריקה או חלקית', () => {
    const order = suggestedOrder([
      { id: 'x', address: '' },
      { id: 'y', address: 'ללא מספר' },
    ]);
    expect(order).toHaveLength(2);
  });
});
