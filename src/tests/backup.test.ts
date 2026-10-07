/**
 * גיבוי וייבוא. הכלל: ייבוא אינו דורס תיעוד שקיים במכשיר,
 * וגיבוי מגרסה חדשה יותר נדחה בבירור ולא "כמעט עובד".
 */

import { describe, expect, it } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION, backupFileName, buildBackup, mergeBackup, readBackup,
} from '../lib/backup';
import { seedState } from '../state/seed';
import type { AppState, Customer } from '../types';

const customer = (id: string, name: string): Customer => ({
  id, customerNumber: '1001', name, address: 'הרצל 1', createdAt: 'x', updatedAt: 'x',
});

function withCustomers(...names: [string, string][]): AppState {
  return { ...seedState(), customers: names.map(([id, name]) => customer(id, name)) };
}

describe('בניית גיבוי', () => {
  it('נושא מזהה אפליקציה, גרסת מבנה ותאריך', () => {
    const file = buildBackup(withCustomers(['cus_1', 'א']), new Date('2026-05-01T10:00:00.000Z'));
    expect(file.app).toBe('yomanhadbara');
    expect(file.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(file.exportedAt).toBe('2026-05-01T10:00:00.000Z');
    expect(file.counts.customers).toBe(1);
  });

  it('אינו כולל את מאגר התכשירים שמגיע עם הקוד', () => {
    const seeded = seedState();
    expect(seeded.materials.length).toBeGreaterThan(100);   // המאגר אכן קיים במצב
    const file = buildBackup(seeded);
    expect(file.counts.materials).toBeUndefined();
    expect(file.counts.materialLabels).toBeUndefined();
    // וגם לא בתוך הנתונים עצמם, כדי שהקובץ לא יתנפח ללא צורך
    expect(file.state.materials).toEqual([]);
    expect(file.state.materialLabels).toEqual([]);
  });

  it('שם הקובץ כולל תאריך ואינו תלוי בקידוד עברית', () => {
    const name = backupFileName(new Date('2026-05-01T10:00:00.000Z'));
    expect(name).toBe('pest-journal-backup-2026-05-01.json');
    expect(/^[\x20-\x7e]+$/.test(name)).toBe(true);
  });
});

describe('קריאת גיבוי', () => {
  it('קובץ תקין נקרא', () => {
    const text = JSON.stringify(buildBackup(withCustomers(['cus_1', 'א'])));
    const res = readBackup(text);
    expect(res.ok).toBe(true);
  });

  it('JSON שבור נדחה', () => {
    const res = readBackup('{לא json');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toContain('JSON');
  });

  it('קובץ של אפליקציה אחרת נדחה', () => {
    const res = readBackup(JSON.stringify({ app: 'other', schemaVersion: 1, state: {} }));
    expect(res.ok).toBe(false);
  });

  it('גיבוי מגרסה חדשה יותר נדחה עם הסבר', () => {
    const res = readBackup(JSON.stringify({
      app: 'yomanhadbara', schemaVersion: BACKUP_SCHEMA_VERSION + 5, state: {},
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors[0]).toContain('גרסה חדשה יותר');
  });

  it('קובץ ללא גרסת מבנה נדחה', () => {
    const res = readBackup(JSON.stringify({ app: 'yomanhadbara', state: {} }));
    expect(res.ok).toBe(false);
  });
});

describe('מיזוג גיבוי', () => {
  it('מוסיף רשומות שאינן במכשיר', () => {
    const backup = buildBackup(withCustomers(['cus_1', 'א'], ['cus_2', 'ב']));
    const { state, plan } = mergeBackup(withCustomers(['cus_1', 'א']), backup);
    expect(plan.added.customers).toBe(1);
    expect(plan.skipped.customers).toBe(1);
    expect(state.customers.map((c) => c.id).sort()).toEqual(['cus_1', 'cus_2']);
  });

  it('אינו דורס רשומה שקיימת במכשיר', () => {
    const backup = buildBackup(withCustomers(['cus_1', 'שם מהגיבוי']));
    const { state } = mergeBackup(withCustomers(['cus_1', 'שם במכשיר']), backup);
    expect(state.customers[0].name).toBe('שם במכשיר');
  });

  it('מרים את המונים כדי שמספרי יומן לא יתנגשו', () => {
    const source: AppState = {
      ...seedState(),
      counters: { journalNumber: 50, customerNumber: 20 },
    };
    const backup = buildBackup(source);
    const local: AppState = { ...seedState(), counters: { journalNumber: 7, customerNumber: 30 } };
    const { state } = mergeBackup(local, backup);
    expect(state.counters.journalNumber).toBe(50);
    expect(state.counters.customerNumber).toBe(30);
  });

  it('אינו נוגע במאגר התכשירים', () => {
    const local = seedState();
    const backup = buildBackup(seedState());
    const { state } = mergeBackup(local, backup);
    expect(state.materials).toBe(local.materials);
  });

  it('מדלג על רשומות ללא מזהה', () => {
    const backup = buildBackup(withCustomers(['cus_1', 'א']));
    (backup.state.customers as unknown as unknown[]).push({ name: 'ללא מזהה' });
    const { plan } = mergeBackup(seedState(), backup);
    expect(plan.added.customers).toBe(1);
    expect(plan.skipped.customers).toBe(1);
  });

  it('גיבוי שלם של מכשיר ריק מחזיר את כל התיעוד', () => {
    const source = withCustomers(['cus_1', 'א'], ['cus_2', 'ב']);
    const { state, plan } = mergeBackup(seedState(), buildBackup(source));
    expect(state.customers).toHaveLength(2);
    expect(plan.added.customers).toBe(2);
  });

  it('מדביר הפתיחה שלא נגעו בו מוחלף ואינו נשאר כרשומה שנייה', () => {
    const source: AppState = {
      ...seedState(),
      exterminators: [{ id: 'ext_src', userId: 'usr_src', name: 'יצחק', licenseNumber: '555', phone: '050' }],
      users: [{ id: 'usr_src', name: 'יצחק', role: 'admin', phone: '' }],
      currentUserId: 'usr_src',
    };
    const { state } = mergeBackup(seedState(), buildBackup(source));
    expect(state.exterminators).toHaveLength(1);
    expect(state.exterminators[0].licenseNumber).toBe('555');
    expect(state.currentUserId).toBe('usr_src');
  });

  it('גיבוי שבו המדביר ריק אינו מוסיף רשומת מדביר כפולה', () => {
    const source = withCustomers(['cus_1', 'א']);   // מדביר הפתיחה ריק גם במקור
    const local = seedState();
    const first = mergeBackup(local, buildBackup(source));
    expect(first.state.exterminators).toHaveLength(1);
    // וייבוא חוזר של אותו קובץ אינו מוסיף דבר
    const second = mergeBackup(first.state, buildBackup(source));
    expect(second.plan.total).toBe(0);
    expect(second.state.exterminators).toHaveLength(1);
  });

  it('ייבוא חוזר של גיבוי עם מדביר ממולא אינו מכפיל אותו', () => {
    const source: AppState = {
      ...seedState(),
      exterminators: [{ id: 'ext_src', userId: 'usr_src', name: 'יצחק', licenseNumber: '555', phone: '' }],
      users: [{ id: 'usr_src', name: 'יצחק', role: 'admin', phone: '' }],
      currentUserId: 'usr_src',
    };
    const file = buildBackup(source);
    const first = mergeBackup(seedState(), file);
    const second = mergeBackup(first.state, file);
    expect(second.plan.total).toBe(0);
    expect(second.state.exterminators).toHaveLength(1);
  });

  it('מדביר שהמשתמש כבר מילא אינו נדרס על ידי הגיבוי', () => {
    const local: AppState = {
      ...seedState(),
      exterminators: [{ id: 'ext_local', userId: 'usr_local', name: 'יצחק', licenseNumber: '111', phone: '' }],
    };
    const source: AppState = {
      ...seedState(),
      exterminators: [{ id: 'ext_src', userId: 'usr_src', name: 'יצחק', licenseNumber: '555', phone: '' }],
    };
    const { state } = mergeBackup(local, buildBackup(source));
    expect(state.exterminators.find((e) => e.id === 'ext_local')?.licenseNumber).toBe('111');
    expect(state.exterminators).toHaveLength(2);   // שתי רשומות, ושום נתון לא נדרס
  });
});
