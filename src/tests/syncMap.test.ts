/**
 * גזירת הסנכרון מהפרש המצב: כל שינוי בחנות חייב להיכנס לתור,
 * כולל מחיקות, ובלי להציף את התור ברשומות שלא נגעו בהן.
 */

import { describe, expect, it } from 'vitest';
import { diffSnapshots, mergePulled, snapshotState, collectionOf, entityOf } from '../state/syncMap';
import { seedState } from '../state/seed';
import type { AppState, Customer, Journal, Signature } from '../types';

function base(): AppState {
  return seedState();
}

const customer = (id: string, name = 'לקוח'): Customer => ({
  id, customerNumber: '1001', name, address: 'הרצל 1', createdAt: 'x', updatedAt: 'x',
});

const journal = (id: string, status: Journal['status'] = 'draft'): Journal => ({
  id, journalNumber: 1, status, startedAt: 'x', workKind: 'private', visitKind: 'new',
  exterminatorId: 'ext', exterminatorName: 'יצחק', licenseNumber: '1',
  preTreatmentActions: [], preventionRecommendations: [], warrantyKind: 'none',
  customerAcknowledged: false, createdAt: 'x', updatedAt: 'x', lastStep: 1,
});

/** ממזג את טיפוס הרשומה לצורת "מה שמגיע מהשרת" (JSON גנרי). */
const asRow = (o: object): Record<string, unknown> => o as unknown as Record<string, unknown>;

const signature = (id: string, image = 'data:image/png;base64,AAA'): Signature => ({
  id, journalId: 'jrn_1', role: 'customer', signerName: 'דני', image, signedAt: 'x',
});

describe('מיפוי ישויות', () => {
  it('מתרגם בין שם האוסף במכשיר לשם הישות בשרת', () => {
    expect(entityOf('journalMaterials')).toBe('journal_materials');
    expect(collectionOf('customer_sites')).toBe('sites');
  });

  it('מאגר התכשירים אינו מסונכרן – הוא מגיע עם גרסת הקוד', () => {
    expect(entityOf('materials')).toBeUndefined();
    expect(entityOf('materialLabels')).toBeUndefined();
  });
});

describe('הפרש מצב', () => {
  it('מצב שלא השתנה אינו יוצר פעולות', () => {
    const s = base();
    const diff = diffSnapshots(snapshotState(s), snapshotState(s));
    expect(diff.upserts).toHaveLength(0);
    expect(diff.deletes).toHaveLength(0);
  });

  it('רשומה חדשה נרשמת כעדכון', () => {
    const before = base();
    const after = { ...before, customers: [...before.customers, customer('cus_1')] };
    const diff = diffSnapshots(snapshotState(before), snapshotState(after));
    expect(diff.upserts).toEqual([
      { entity: 'customers', id: 'cus_1', record: expect.objectContaining({ id: 'cus_1' }) },
    ]);
  });

  it('רשומה שהוסרה נרשמת כמחיקה', () => {
    const before = { ...base(), signatures: [signature('sgn_1')] };
    const after = { ...before, signatures: [] };
    const diff = diffSnapshots(snapshotState(before), snapshotState(after));
    expect(diff.deletes).toEqual([{ entity: 'signatures', id: 'sgn_1' }]);
  });

  it('שינוי באוסף אחד אינו משדר רשומות של אוספים אחרים', () => {
    const start = { ...base(), customers: [customer('cus_1'), customer('cus_2')], tasks: [] };
    const after = {
      ...start,
      customers: start.customers.map((c) => (c.id === 'cus_2' ? { ...c, name: 'שם חדש' } : c)),
    };
    const diff = diffSnapshots(snapshotState(start), snapshotState(after));
    expect(diff.upserts).toHaveLength(1);
    expect(diff.upserts[0].id).toBe('cus_2');
  });

  it('פעולות שאין להן push ידני בחנות מכוסות גם הן', () => {
    // תחנות מסלול, מזיקים, פעולות טיפול ותיבות האכלה – כולן בהפרש
    const start = base();
    const after: AppState = {
      ...start,
      journalPests: [{ id: 'jps_1', journalId: 'jrn_1', pestId: 'rat', severity: 'low', areas: [], signs: [] }],
      journalActions: [{ id: 'jac_1', journalId: 'jrn_1', kind: 'bait_stations', areas: [], equipment: [] }],
      routeStops: [{ id: 'stp_1', routeId: 'rte_1', customerId: 'cus_1', position: 0, status: 'pending' }],
      baitStations: [{
        id: 'bst_1', journalId: 'jrn_1', customerId: 'cus_1',
        stationCode: 'T-1', location: 'מטבח', quantity: '1', secured: true,
      }],
      tasks: [{
        id: 'tsk_1', kind: 'inspection', title: 'ביקור', dueDate: '2026-01-01',
        priority: 'normal', done: false, remind: false, createdAt: 'x',
      }],
    };
    const diff = diffSnapshots(snapshotState(start), snapshotState(after));
    const entities = diff.upserts.map((u) => u.entity).sort();
    expect(entities).toEqual([
      'bait_stations', 'journal_actions', 'journal_pests', 'route_stops', 'tasks',
    ]);
  });
});

describe('מיזוג שינויים מהשרת', () => {
  const nothingPending = () => false;

  it('רשומה חדשה מהשרת מתווספת', () => {
    const s = base();
    const out = mergePulled(s, { items: { customers: [asRow(customer('cus_9', 'מהשרת'))] }, deleted: {} }, nothingPending);
    expect(out.added).toBe(1);
    expect(out.state.customers.find((c) => c.id === 'cus_9')?.name).toBe('מהשרת');
  });

  it('מחיקה בשרת מסירה את הרשומה גם במכשיר', () => {
    const s = { ...base(), signatures: [signature('sgn_1')] };
    const out = mergePulled(s, { items: {}, deleted: { signatures: ['sgn_1'] } }, nothingPending);
    expect(out.removed).toBe(1);
    expect(out.state.signatures).toHaveLength(0);
  });

  it('שינוי מקומי שממתין לשליחה גובר על הגרסה שבשרת', () => {
    const s = { ...base(), signatures: [signature('sgn_1', 'data:image/png;base64,LOCAL')] };
    const pending = (entity: string, id: string) => entity === 'signatures' && id === 'sgn_1';
    const out = mergePulled(
      s,
      { items: { signatures: [asRow(signature('sgn_1', 'data:image/png;base64,SERVER'))] }, deleted: {} },
      pending,
    );
    expect(out.updated).toBe(0);
    expect(out.skipped).toBe(1);
    expect(out.state.signatures[0].image).toContain('LOCAL');
  });

  it('מחיקה מקומית שממתינה לשליחה אינה מבוטלת על ידי השרת', () => {
    const s = { ...base(), signatures: [] as Signature[] };
    const pending = (entity: string, id: string) => entity === 'signatures' && id === 'sgn_1';
    const out = mergePulled(s, { items: { signatures: [asRow(signature('sgn_1'))] }, deleted: {} }, pending);
    expect(out.state.signatures).toHaveLength(0);
    expect(out.skipped).toBe(1);
  });

  it('ללא שינויים – אובייקט המצב נשאר אותו אובייקט', () => {
    const s = base();
    const out = mergePulled(s, { items: {}, deleted: {} }, nothingPending);
    expect(out.state).toBe(s);
  });

  it('אינו נוגע באוספים שאינם מסונכרנים', () => {
    const s = base();
    const count = s.materials.length;
    const out = mergePulled(s, { items: { materials: [{ id: 'mat_x' }] }, deleted: {} }, nothingPending);
    expect(out.state.materials).toHaveLength(count);
    expect(out.added).toBe(0);
  });

  it('יומן שהגיע מהשרת מחליף את הגרסה המקומית כשאין שינוי ממתין', () => {
    const s = { ...base(), journals: [journal('jrn_1', 'draft')] };
    const out = mergePulled(s, { items: { journals: [asRow(journal('jrn_1', 'completed'))] }, deleted: {} }, nothingPending);
    expect(out.updated).toBe(1);
    expect(out.state.journals[0].status).toBe('completed');
  });
});
