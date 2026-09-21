import { describe, expect, it, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StoreProvider, useStore } from '../state/store';
import { MATERIALS } from '../data/materials';
import { validateJournal, blockingIssues } from '../lib/validation';

const wrapper = ({ children }: { children: ReactNode }) => <StoreProvider>{children}</StoreProvider>;

async function setup() {
  const view = renderHook(() => useStore(), { wrapper });
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  return view;
}

beforeEach(() => {
  localStorage.clear();
});

describe('בדיקה 1: יצירת לקוח ויומן מקצה לקצה', () => {
  it('יוצר לקוח, משייך אותו ליומן ומשלים את היומן', async () => {
    const { result } = await setup();

    let customerId = '';
    let journalId = '';

    act(() => {
      const customer = result.current.createCustomer({
        name: 'מסעדת הגפן', contactName: 'דנה', phone: '050-1234567',
        address: 'הרצל 10, תל אביב', city: 'תל אביב', email: '', notes: '',
      });
      customerId = customer.id;
    });

    act(() => {
      const journal = result.current.createJournal();
      journalId = journal.id;
    });

    act(() => {
      result.current.updateJournal(journalId, {
        customerId,
        siteAddress: 'הרצל 10, תל אביב',
        licenseNumber: '12345',
        exterminatorName: 'יצחק',
      });
      result.current.setJournalPest(journalId, 'german_roach', { severity: 'medium' });
      result.current.toggleJournalAction(journalId, 'spraying');
    });

    act(() => {
      const material = MATERIALS.find((m) => m.id === 'mat_dragon')!;
      const record = result.current.selectMaterial(journalId, material);
      result.current.updateJournalMaterial(record.id, {
        execution: {
          batchNumber: 'B-2201', packageExpiry: '2027-01-01', chosenDoseText: '30 מ״ל ל-5 ליטר',
          materialAmount: '30', waterAmount: '5', coverage: '80', coverageUnit: 'sqm',
        },
      });
    });

    act(() => {
      result.current.saveSignature({
        journalId, role: 'exterminator', signerName: 'יצחק',
        image: 'data:image/png;base64,AAA', signedAt: new Date().toISOString(),
      });
      result.current.saveSignature({
        journalId, role: 'customer', signerName: 'דנה',
        image: 'data:image/png;base64,BBB', signedAt: new Date().toISOString(),
      });
      result.current.updateJournal(journalId, { customerAcknowledged: true });
    });

    const full = result.current.getFullJournal(journalId)!;
    expect(blockingIssues(validateJournal(full))).toHaveLength(0);

    act(() => result.current.completeJournal(journalId));
    expect(result.current.state.journals.find((j) => j.id === journalId)?.status).toBe('completed');
  });

  it('חוסם סיום יומן כשחסרים נתוני ביצוע, אך מאפשר טיוטה', async () => {
    const { result } = await setup();
    let journalId = '';
    act(() => { journalId = result.current.createJournal().id; });

    act(() => {
      const material = MATERIALS.find((m) => m.id === 'mat_draker')!;
      result.current.selectMaterial(journalId, material);
    });

    const issues = validateJournal(result.current.getFullJournal(journalId)!);
    const messages = blockingIssues(issues).map((i) => i.message);
    expect(messages.some((m) => m.includes('מספר אצווה'))).toBe(true);
    expect(messages.some((m) => m.includes('תאריך תפוגה'))).toBe(true);
    // הטיוטה עצמה נשמרה בכל מקרה
    expect(result.current.state.journals.find((j) => j.id === journalId)?.status).toBe('draft');
  });
});

describe('בדיקה 4 + 7: בחירת חומר והחלפתו', () => {
  it('בחירת חומר מכניסה רשומה אמיתית עם מזהה החומר', async () => {
    const { result } = await setup();
    let journalId = '';
    act(() => { journalId = result.current.createJournal().id; });

    act(() => {
      result.current.selectMaterial(journalId, MATERIALS.find((m) => m.id === 'mat_dragon')!);
    });

    const rows = result.current.state.journalMaterials.filter((m) => m.journalId === journalId);
    expect(rows).toHaveLength(1);
    expect(rows[0].materialId).toBe('mat_dragon');
    expect(rows[0].materialNameSnapshot).toBe('דרגון');
    // המזהה הוא המפתח, לא השם
    expect(rows[0].id).not.toBe('דרגון');
  });

  it('אפשר לבחור כמה חומרים לאותו יומן', async () => {
    const { result } = await setup();
    let journalId = '';
    act(() => { journalId = result.current.createJournal().id; });

    act(() => {
      result.current.selectMaterial(journalId, MATERIALS.find((m) => m.id === 'mat_dragon')!);
      result.current.selectMaterial(journalId, MATERIALS.find((m) => m.id === 'mat_pastion_plus')!);
    });

    const rows = result.current.state.journalMaterials.filter((m) => m.journalId === journalId);
    expect(rows.map((r) => r.materialId)).toEqual(['mat_dragon', 'mat_pastion_plus']);
  });

  it('החלפת חומר מנקה רק את נתוני החומר שהוחלף', async () => {
    const { result } = await setup();
    let journalId = '';
    let firstId = '';
    let secondId = '';

    act(() => { journalId = result.current.createJournal().id; });
    act(() => {
      firstId = result.current.selectMaterial(journalId, MATERIALS.find((m) => m.id === 'mat_dragon')!).id;
      secondId = result.current.selectMaterial(journalId, MATERIALS.find((m) => m.id === 'mat_pastion_plus')!).id;
    });

    const exec = {
      batchNumber: 'B-1', packageExpiry: '2026-01-01', chosenDoseText: '10',
      materialAmount: '10', waterAmount: '5', coverage: '50', coverageUnit: 'sqm' as const,
    };
    act(() => {
      result.current.updateJournalMaterial(firstId, { execution: { ...exec } });
      result.current.updateJournalMaterial(secondId, { execution: { ...exec, batchNumber: 'B-2' } });
    });

    act(() => {
      result.current.replaceJournalMaterial(firstId, MATERIALS.find((m) => m.id === 'mat_draker')!);
    });

    const first = result.current.state.journalMaterials.find((m) => m.id === firstId)!;
    const second = result.current.state.journalMaterials.find((m) => m.id === secondId)!;

    expect(first.materialId).toBe('mat_draker');
    expect(first.execution.batchNumber).toBe('');
    expect(first.execution.chosenDoseId).toBeUndefined();
    expect(first.conditionAnswers).toEqual({});
    // החומר השני לא נגע
    expect(second.materialId).toBe('mat_pastion_plus');
    expect(second.execution.batchNumber).toBe('B-2');
  });
});

describe('בדיקה 8: טעינה מיומן אחרון', () => {
  it('מעתיקה פרטים קבועים ואינה מעתיקה אצווה, תפוגה, כמויות או חתימות', async () => {
    const { result } = await setup();
    let customerId = '';
    let oldJournalId = '';
    let newJournalId = '';

    act(() => {
      customerId = result.current.createCustomer({
        name: 'בניין רימון', address: 'האלון 3, חיפה', phone: '', email: '',
        contactName: '', city: '', notes: '',
      }).id;
    });

    act(() => { oldJournalId = result.current.createJournal().id; });
    act(() => {
      result.current.updateJournal(oldJournalId, {
        customerId,
        siteAddress: 'האלון 3, חיפה',
        siteAccessNotes: 'קוד שער 1234',
        preventionRecommendations: ['איטום סדקים וחורים בקירות ובריצוף'],
        warrantyKind: 'months',
        warrantyValue: '3',
        findingsNotes: 'נמצאה פעילות במטבח',
      });
      const rec = result.current.selectMaterial(oldJournalId, MATERIALS.find((m) => m.id === 'mat_dragon')!);
      result.current.updateJournalMaterial(rec.id, {
        execution: {
          batchNumber: 'OLD-999', packageExpiry: '2026-05-05', chosenDoseText: '25',
          materialAmount: '25', waterAmount: '5', coverage: '60', coverageUnit: 'sqm',
        },
      });
      result.current.saveSignature({
        journalId: oldJournalId, role: 'customer', signerName: 'דייר',
        image: 'data:image/png;base64,OLD', signedAt: new Date().toISOString(),
      });
    });

    act(() => { newJournalId = result.current.createJournal().id; });
    act(() => { result.current.updateJournal(newJournalId, { customerId }); });

    let report: { copied: string[]; cleared: string[] } | null = null;
    act(() => { report = result.current.loadFromLastJournal(newJournalId, customerId); });

    expect(report).not.toBeNull();

    const journal = result.current.state.journals.find((j) => j.id === newJournalId)!;
    // הועתק
    expect(journal.siteAddress).toBe('האלון 3, חיפה');
    expect(journal.siteAccessNotes).toBe('קוד שער 1234');
    expect(journal.preventionRecommendations).toEqual(['איטום סדקים וחורים בקירות ובריצוף']);
    expect(journal.warrantyKind).toBe('months');
    // נוקה
    expect(journal.findingsNotes).toBeUndefined();
    expect(journal.customerAcknowledged).toBe(false);

    const newMaterials = result.current.state.journalMaterials.filter((m) => m.journalId === newJournalId);
    expect(newMaterials).toHaveLength(1);
    expect(newMaterials[0].materialId).toBe('mat_dragon');
    expect(newMaterials[0].execution.batchNumber).toBe('');
    expect(newMaterials[0].execution.packageExpiry).toBe('');
    expect(newMaterials[0].execution.materialAmount).toBe('');
    expect(newMaterials[0].execution.chosenDoseText).toBe('');

    expect(result.current.state.signatures.filter((s) => s.journalId === newJournalId)).toHaveLength(0);
    // היומן הקודם לא נפגע
    expect(
      result.current.state.journalMaterials.find((m) => m.journalId === oldJournalId)?.execution.batchNumber,
    ).toBe('OLD-999');
  });
});

describe('בדיקה 11: מסלול עבודה', () => {
  it('שומר את סדר הלקוחות ואת הסטטוסים', async () => {
    const { result } = await setup();
    const ids: string[] = [];

    act(() => {
      for (const name of ['לקוח א', 'לקוח ב', 'לקוח ג']) {
        ids.push(result.current.createCustomer({
          name, address: `${name} 1`, phone: '', email: '', contactName: '', city: '', notes: '',
        }).id);
      }
    });

    let routeId = '';
    act(() => {
      routeId = result.current.createRoute({ date: '2026-03-01', name: 'מסלול', exterminatorId: 'ext_yizhak' }).id;
    });
    act(() => { for (const id of ids) result.current.addRouteStop(routeId, id); });

    const ordered = () =>
      result.current.state.routeStops
        .filter((s) => s.routeId === routeId)
        .sort((a, b) => a.position - b.position)
        .map((s) => s.customerId);

    expect(ordered()).toEqual(ids);

    const lastStop = result.current.state.routeStops.find((s) => s.customerId === ids[2])!;
    act(() => { result.current.moveRouteStop(routeId, lastStop.id, -1); });
    expect(ordered()).toEqual([ids[0], ids[2], ids[1]]);

    act(() => { result.current.updateRouteStop(lastStop.id, { status: 'done' }); });
    expect(result.current.state.routeStops.find((s) => s.id === lastStop.id)?.status).toBe('done');

    // סידור מחדש מלא (גרירה או סדר מומלץ)
    const allIds = result.current.state.routeStops
      .filter((s) => s.routeId === routeId)
      .map((s) => s.id);
    act(() => { result.current.reorderRouteStops(routeId, [...allIds].reverse()); });
    const positions = result.current.state.routeStops
      .filter((s) => s.routeId === routeId)
      .sort((a, b) => a.position - b.position)
      .map((s) => s.id);
    expect(positions).toEqual([...allIds].reverse());
  });
});

describe('בדיקה 12: היומן נשמר אחרי רענון', () => {
  it('משחזר את היומן ממסד הנתונים המקומי', async () => {
    const first = await setup();
    let journalId = '';
    act(() => { journalId = first.result.current.createJournal().id; });
    act(() => { first.result.current.updateJournal(journalId, { siteAddress: 'ביאליק 7, רמת גן' }); });

    // ממתינים לשמירה האוטומטית
    await waitFor(() => expect(first.result.current.saveState).toBe('saved'));
    first.unmount();

    // "רענון": מופע חדש של האפליקציה
    const second = await setup();
    await waitFor(() => {
      expect(second.result.current.state.journals.find((j) => j.id === journalId)?.siteAddress)
        .toBe('ביאליק 7, רמת גן');
    });
  });
});

describe('מניעת שמירה כפולה', () => {
  it('לחיצה כפולה על סיום אינה יוצרת שני סיומים', async () => {
    const { result } = await setup();
    let journalId = '';
    act(() => { journalId = result.current.createJournal().id; });
    act(() => { result.current.completeJournal(journalId); });
    const firstCompletedAt = result.current.state.journals.find((j) => j.id === journalId)?.completedAt;
    act(() => { result.current.completeJournal(journalId); });
    expect(result.current.state.journals.find((j) => j.id === journalId)?.completedAt).toBe(firstCompletedAt);
  });

  it('מספרי היומנים רצים ואינם חוזרים', async () => {
    const { result } = await setup();
    const numbers: number[] = [];
    act(() => {
      numbers.push(result.current.createJournal().journalNumber);
    });
    act(() => {
      numbers.push(result.current.createJournal().journalNumber);
    });
    expect(numbers[1]).toBe(numbers[0] + 1);
  });
});
