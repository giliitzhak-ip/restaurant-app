import { describe, expect, it } from 'vitest';
import {
  excludeAlreadyImported,
  fingerprintOf,
  mapLegacyRecord,
  scanLegacyStorage,
} from '@/features/legacyImport/parseLegacy';

/**
 * ייבוא מהגרסה המקומית הקודמת.
 * הקובץ המקורי לא היה זמין, ולכן המפרש סובלני: בדיקות אלה מוודאות
 * שמבנים שונים נקלטים, שאין כפילויות, ושמידע שלא מופה אינו נעלם.
 */

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  clear(): void {
    this.data.clear();
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('מיפוי רשומה מהגרסה הקודמת', () => {
  it('ממפה שמות מפתחות באנגלית', () => {
    const record = mapLegacyRecord(
      {
        customer_name: 'מזמין לדוגמה',
        phone: '0501234567',
        city: 'עיר הדוגמה',
        street: 'רחוב הדוגמה',
        house_number: '5',
        apartment: '2',
        date: '2026-05-01',
        time: '09:00',
        notes: 'הערה לדוגמה',
      },
      'pest_log_1',
    );

    expect((record.content.orderer as Record<string, unknown>).name).toBe('מזמין לדוגמה');
    expect((record.content.location as Record<string, unknown>).city).toBe('עיר הדוגמה');
    expect((record.content.location as Record<string, unknown>).apartmentNumber).toBe('2');
    expect((record.content.execution as Record<string, unknown>).performedDate).toBe('2026-05-01');
    expect(record.content.generalNotes).toBe('הערה לדוגמה');
  });

  it('ממפה שמות מפתחות בעברית', () => {
    const record = mapLegacyRecord({ שם: 'מזמין', עיר: 'עיר', תאריך: '2026-05-01' }, 'יומן_1');
    expect((record.content.orderer as Record<string, unknown>).name).toBe('מזמין');
    expect((record.content.location as Record<string, unknown>).city).toBe('עיר');
  });

  it('שומר שדות שלא זוהו ולא זורק אותם', () => {
    const record = mapLegacyRecord({ some_unknown_field: 'ערך חשוב', another: 42 }, 'pest_x');
    expect(record.unmapped.some_unknown_field).toBe('ערך חשוב');
    expect(record.unmapped.another).toBe(42);
  });

  it('משלים ברירות מחדש שמאפשרות לפתוח את היומן כטיוטה', () => {
    const record = mapLegacyRecord({ city: 'עיר' }, 'pest_x');
    expect(record.content.treatmentKinds).toEqual(['standard']);
    expect(record.content.hasAssistant).toBe(false);
    expect((record.content.monitoring as { findings: unknown[] }).findings).toEqual([]);
    expect((record.content.location as Record<string, unknown>).placeKind).toBe('dwelling');
  });

  it('טביעת האצבע יציבה לאותו תוכן ושונה לתוכן אחר', () => {
    expect(fingerprintOf({ a: 1, b: 2 })).toBe(fingerprintOf({ a: 1, b: 2 }));
    expect(fingerprintOf({ a: 1 })).not.toBe(fingerprintOf({ a: 2 }));
  });
});

describe('סריקת האחסון המקומי', () => {
  it('קולט מערך של יומנים', () => {
    const storage = new MemoryStorage();
    storage.setItem('pestLogs', JSON.stringify([{ city: 'א' }, { city: 'ב' }]));
    const result = scanLegacyStorage(storage);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]!.sourceKey).toBe('pestLogs[0]');
  });

  it('קולט אובייקט בודד', () => {
    const storage = new MemoryStorage();
    storage.setItem('pest_log_current', JSON.stringify({ city: 'א', phone: '0501234567' }));
    expect(scanLegacyStorage(storage).records).toHaveLength(1);
  });

  it('קולט אוסף ממופתח (מזהה → יומן)', () => {
    const storage = new MemoryStorage();
    storage.setItem('hadbara_logs', JSON.stringify({ id1: { city: 'א' }, id2: { city: 'ב' } }));
    const result = scanLegacyStorage(storage);
    expect(result.records).toHaveLength(2);
    expect(result.records.map((r) => r.sourceKey)).toEqual(['hadbara_logs.id1', 'hadbara_logs.id2']);
  });

  it('מתעלם ממפתחות שאינם קשורים', () => {
    const storage = new MemoryStorage();
    storage.setItem('theme', 'dark');
    storage.setItem('analytics_id', '123');
    expect(scanLegacyStorage(storage).records).toHaveLength(0);
  });

  it('מדווח על JSON פגום ולא קורס', () => {
    const storage = new MemoryStorage();
    storage.setItem('pest_log_broken', '{לא JSON');
    const result = scanLegacyStorage(storage);
    expect(result.records).toHaveLength(0);
    expect(result.errors[0]!.message).toContain('JSON');
  });
});

describe('מניעת כפילויות בייבוא', () => {
  it('מדלג על רשומות שיובאו בעבר', () => {
    const records = [
      mapLegacyRecord({ city: 'א' }, 'k1'),
      mapLegacyRecord({ city: 'ב' }, 'k2'),
    ];
    const { fresh, duplicates } = excludeAlreadyImported(records, new Set([records[0]!.fingerprint]));
    expect(fresh).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(fresh[0]!.sourceKey).toBe('k2');
  });

  it('מדלג על כפילויות בתוך אותו ייבוא', () => {
    const records = [
      mapLegacyRecord({ city: 'א' }, 'k1'),
      mapLegacyRecord({ city: 'א' }, 'k1-copy'),
    ];
    const { fresh, duplicates } = excludeAlreadyImported(records, new Set());
    expect(fresh).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });
});
