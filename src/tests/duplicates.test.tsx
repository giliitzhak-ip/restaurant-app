/**
 * מניעת כפילויות ברמת החנות.
 *
 * כל הבדיקות כאן מדמות מה שקורה בלחיצה כפולה בשטח: שתי קריאות
 * באותו tick, לפני שהרינדור הבא קרה. זה המצב שבו המספרים הרצים
 * שוכפלו, כי הם נקראו מתוך ה-state במקום להוקצה.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StoreProvider, useStore } from '../state/store';
import { MATERIALS } from '../data/materials';

/* לכל בדיקה היקף אחסון משלה. בלעדיו מצב של בדיקה אחת נטען בבאה
   אחריה דרך מפתח האחסון המשותף, והמספרים שנבדקים כאן מתערבבים. */
let scopeCounter = 0;

async function setup() {
  scopeCounter += 1;
  const scope = `dup-test-${Date.now()}-${scopeCounter}`;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StoreProvider scope={scope}>{children}</StoreProvider>
  );
  const view = renderHook(() => useStore(), { wrapper });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  return view;
}

beforeEach(() => {
  localStorage.clear();
});

describe('טיוטה ריקה', () => {
  it('לחיצה חוזרת על "יומן חדש" פותחת את הטיוטה הריקה ולא יוצרת עוד אחת', async () => {
    const { result } = await setup();
    let first = '';
    act(() => { first = result.current.createJournal().id; });
    let second = '';
    act(() => { second = result.current.createJournal().id; });
    expect(second).toBe(first);
    expect(result.current.state.journals).toHaveLength(1);
  });

  it('טיוטה שנגעו בה אינה נתפסת מחדש', async () => {
    const { result } = await setup();
    let first = '';
    act(() => { first = result.current.createJournal().id; });
    act(() => { result.current.setJournalPest(first, 'rat'); });
    let second = '';
    act(() => { second = result.current.createJournal().id; });
    expect(second).not.toBe(first);
    expect(result.current.state.journals).toHaveLength(2);
  });

  it('טיוטה שיש לה לקוח אינה נתפסת מחדש', async () => {
    const { result } = await setup();
    let first = '';
    act(() => { first = result.current.createJournal().id; });
    act(() => { result.current.updateJournal(first, { customerId: 'cus_1' }); });
    let second = '';
    act(() => { second = result.current.createJournal().id; });
    expect(second).not.toBe(first);
  });
});

describe('מספרי יומן', () => {
  it('שתי יצירות של יומנים שונים מקבלות מספרים שונים', async () => {
    const { result } = await setup();
    const numbers: number[] = [];
    act(() => {
      /* כל יומן מקבל לקוח מיד, כך שהטיוטה אינה ריקה ואינה נתפסת
         מחדש – זה בדיוק מה שקורה בלחיצה על "פתח יומן ללקוח". */
      for (const customerId of ['cus_1', 'cus_2', 'cus_3']) {
        const journal = result.current.createJournal();
        result.current.updateJournal(journal.id, { customerId });
        numbers.push(journal.journalNumber);
      }
    });
    expect(new Set(numbers).size).toBe(3);
    expect(numbers).toEqual([numbers[0], numbers[0] + 1, numbers[0] + 2]);
  });

  it('המספרים ששמורים ביומנים עצמם ייחודיים', async () => {
    const { result } = await setup();
    act(() => {
      const a = result.current.createJournal();
      result.current.updateJournal(a.id, { customerId: 'cus_1' });
      const b = result.current.createJournal();
      result.current.updateJournal(b.id, { customerId: 'cus_2' });
    });
    const stored = result.current.state.journals.map((j) => j.journalNumber);
    expect(stored).toHaveLength(2);
    expect(new Set(stored).size).toBe(2);
  });

  it('שכפול יומן אינו מקבל את מספר המקור', async () => {
    const { result } = await setup();
    let id = '';
    act(() => { id = result.current.createJournal().id; });
    act(() => { result.current.updateJournal(id, { customerId: 'cus_1' }); });
    let copies: (number | undefined)[] = [];
    act(() => {
      copies = [
        result.current.duplicateJournal(id)?.journalNumber,
        result.current.duplicateJournal(id)?.journalNumber,
      ];
    });
    const source = result.current.state.journals.find((j) => j.id === id)!.journalNumber;
    expect(copies.every((n) => n !== undefined && n !== source)).toBe(true);
    expect(new Set(copies).size).toBe(2);
    const all = result.current.state.journals.map((j) => j.journalNumber);
    expect(new Set(all).size).toBe(all.length);
  });

  it('המונה שבמצב אינו נסוג אחרי הקצאה', async () => {
    const { result } = await setup();
    act(() => {
      const a = result.current.createJournal();
      result.current.updateJournal(a.id, { customerId: 'cus_1' });
      const b = result.current.createJournal();
      result.current.updateJournal(b.id, { customerId: 'cus_2' });
    });
    const max = Math.max(...result.current.state.journals.map((j) => j.journalNumber));
    expect(result.current.state.counters.journalNumber).toBeGreaterThan(max);
  });
});

describe('מספרי לקוח', () => {
  const draft = (name: string) => ({
    name, contactName: '', phone: '', email: '', address: 'הרצל 1', city: '', notes: '',
  });

  it('שני לקוחות שנוצרו באותו רגע מקבלים מספרים שונים', async () => {
    const { result } = await setup();
    const numbers: string[] = [];
    act(() => {
      numbers.push(result.current.createCustomer(draft('א')).customerNumber);
      numbers.push(result.current.createCustomer(draft('ב')).customerNumber);
    });
    expect(new Set(numbers).size).toBe(2);
  });

  it('מזהה הלקוח קבוע ואינו נגזר מהשם', async () => {
    const { result } = await setup();
    let a = '';
    let b = '';
    act(() => {
      a = result.current.createCustomer(draft('מסעדה')).id;
      b = result.current.createCustomer(draft('מסעדה')).id;
    });
    expect(a).not.toBe(b);   // אותו שם – שני לקוחות נפרדים, ללא מיזוג אוטומטי
    expect(result.current.state.customers).toHaveLength(2);
  });
});

describe('רשומות שיש להן מפתח עסקי', () => {
  it('מסלול לאותו תאריך אינו נוצר פעמיים', async () => {
    const { result } = await setup();
    const ids: string[] = [];
    act(() => {
      ids.push(result.current.createRoute({ date: '2026-05-01', name: 'מסלול', exterminatorId: 'ext_1' }).id);
      ids.push(result.current.createRoute({ date: '2026-05-01', name: 'מסלול', exterminatorId: 'ext_1' }).id);
    });
    expect(ids[0]).toBe(ids[1]);
    expect(result.current.state.routes).toHaveLength(1);
  });

  it('מסלולים לתאריכים שונים נשארים נפרדים', async () => {
    const { result } = await setup();
    act(() => {
      result.current.createRoute({ date: '2026-05-01', name: 'א', exterminatorId: 'ext_1' });
      result.current.createRoute({ date: '2026-05-02', name: 'ב', exterminatorId: 'ext_1' });
    });
    expect(result.current.state.routes).toHaveLength(2);
  });

  it('תבנית לקוח באותו שם מתעדכנת ואינה נוספת פעמיים', async () => {
    const { result } = await setup();
    let customerId = '';
    act(() => { customerId = result.current.createCustomer({
      name: 'מסעדה', contactName: '', phone: '', email: '', address: 'הרצל 1', city: '', notes: '',
    }).id; });
    const tpl = () => ({
      name: 'תבנית · מסעדה', customerId, fixedAreas: [], baitStationLocations: [],
      commonPestIds: [], frequencyDays: 90,
    });
    act(() => {
      result.current.saveCustomerTemplate(tpl());
      result.current.saveCustomerTemplate(tpl());
    });
    expect(result.current.state.customerTemplates).toHaveLength(1);
  });

  it('אותו מזיק ואותה פעולה אינם נרשמים פעמיים לאותו יומן', async () => {
    const { result } = await setup();
    let id = '';
    act(() => { id = result.current.createJournal().id; });
    act(() => {
      result.current.setJournalPest(id, 'rat');
      result.current.setJournalPest(id, 'rat');
      result.current.toggleJournalAction(id, 'spraying');
    });
    expect(result.current.state.journalPests.filter((p) => p.journalId === id)).toHaveLength(1);
    expect(result.current.state.journalActions.filter((a) => a.journalId === id)).toHaveLength(1);
  });

  it('חתימה באותו תפקיד מתעדכנת ואינה נוספת פעמיים', async () => {
    const { result } = await setup();
    let id = '';
    act(() => { id = result.current.createJournal().id; });
    act(() => {
      result.current.saveSignature({
        journalId: id, role: 'customer', signerName: 'א', image: 'data:1', signedAt: 'x',
      });
      result.current.saveSignature({
        journalId: id, role: 'customer', signerName: 'א', image: 'data:2', signedAt: 'y',
      });
    });
    const sigs = result.current.state.signatures.filter((s) => s.journalId === id);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].image).toBe('data:2');
  });

  it('צילום אחד בלבד לכל יומן, גם אחרי ניסיון סיום חוזר', async () => {
    const { result } = await setup();
    let id = '';
    act(() => { id = result.current.createJournal().id; });
    act(() => { result.current.completeJournal(id); });
    act(() => { result.current.completeJournal(id); });
    expect(result.current.state.journalSnapshots.filter((s) => s.journalId === id).length)
      .toBeLessThanOrEqual(1);
  });
});

describe('בחירת תכשיר', () => {
  it('בחירת אותו תכשיר פעמיים יוצרת שתי רשומות מכוונות עם מזהים שונים', async () => {
    /* שימוש בשתי אצוות של אותו תכשיר הוא מצב אמיתי, ולכן אין חסימה.
       מה שכן נדרש: מזהים נפרדים, כדי שנתוני הביצוע לא יתערבבו. */
    const { result } = await setup();
    let id = '';
    act(() => { id = result.current.createJournal().id; });
    const material = MATERIALS.find((m) => m.id === 'mat_dragon')!;
    const recs: string[] = [];
    act(() => {
      recs.push(result.current.selectMaterial(id, material).id);
      recs.push(result.current.selectMaterial(id, material).id);
    });
    expect(new Set(recs).size).toBe(2);
    expect(result.current.state.journalMaterials.filter((m) => m.journalId === id)).toHaveLength(2);
  });
});
