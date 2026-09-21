import { describe, expect, it } from 'vitest';
import { MATERIALS, MATERIAL_LABELS, SYSTEM_TEMPLATES } from '../data/materials';
import { NOT_ENTERED } from '../types';
import { computeReEntry, revealedInstructions } from '../screens/wizard/Step6Instructions';
import { visibleDoses, isRegistrationStale } from '../screens/wizard/Step5Materials';

const label = (id: string) => MATERIAL_LABELS.find((l) => l.materialId === id)!;
const template = (id: string) => SYSTEM_TEMPLATES.find((t) => t.id === id)!;

describe('מאגר ארבעת החומרים', () => {
  it('כולל את ארבעת החומרים עם מספרי הרישום שנמסרו', () => {
    expect(MATERIALS.find((m) => m.tradeName === 'דרגון')?.registrationNumber).toBe('640');
    expect(MATERIALS.find((m) => m.tradeName === 'דרקר 10.2')?.registrationNumber).toBe('569');
    expect(MATERIALS.find((m) => m.tradeName === 'פסטיון פלוס פסטה')?.registrationNumber).toBe('584');
    expect(MATERIALS.find((m) => m.tradeName === 'בלוקיון פלוס')).toBeDefined();
  });

  it('אינו מציג חומר כמאומת ללא מקור רשמי מאומת', () => {
    for (const l of MATERIAL_LABELS) {
      if (l.verificationStatus === 'verified') {
        expect(l.verifiedAt, `${l.materialId} סומן מאומת ללא תאריך אימות`).toBeTruthy();
        expect(l.sourceUrl, `${l.materialId} סומן מאומת ללא מקור`).toBeTruthy();
      }
    }
  });

  it('אינו ממציא אזהרות או מינונים — ערכים חסרים מסומנים "לא הוזן"', () => {
    for (const l of MATERIAL_LABELS) {
      for (const d of l.doses) expect(d.amount).toBe(NOT_ENTERED);
      expect(l.humanWarnings).toEqual([]);
      expect(l.animalWarnings).toEqual([]);
    }
  });

  it('בלוקיון פלוס אינו יורש אזהרות או מינונים מפסטיון', () => {
    const blokion = label('mat_blokion_plus');
    const pastion = label('mat_pastion_plus');
    expect(blokion.doses).toHaveLength(0);
    expect(blokion.approvedPestIds).toHaveLength(0);
    expect(blokion.reEntryHours).toBeUndefined();
    expect(blokion.sourceUrl).toBeUndefined();
    expect(blokion.reEntryNote).not.toBe(pastion.reEntryNote);
  });

  it('בדיקה 10: פסטיון אינו מקבל זמן כניסה מחדש של ריסוס', () => {
    const pastion = label('mat_pastion_plus');
    expect(pastion.reEntryHours).toBeNull();
    expect(pastion.reEntryNote).toMatch(/פיתיון/);

    const result = computeReEntry([{ name: 'פסטיון פלוס פסטה', label: pastion }]);
    expect(result.hours).toBeNull();
    expect(result.specialInstructions[0].material).toBe('פסטיון פלוס פסטה');
  });

  it('לפסטיון יש תבנית נפרדת לעכברים ולחולדות עם תיעוד תיבות', () => {
    const mice = template('tpl_pastion_mice');
    const rats = template('tpl_pastion_rats');
    expect(mice.pestIds).toEqual(['mice']);
    expect(rats.pestIds).toEqual(['rats']);
    expect(mice.requiresBaitStations).toBe(true);
    expect(rats.requiresBaitStations).toBe(true);
    expect(mice.doseIds).not.toEqual(rats.doseIds);
  });
});

describe('בדיקה 9: תבנית פשפש מיטה', () => {
  const bedbug = template('tpl_dragon_bedbug');

  it('שואלת אם רוססה מסגרת/גוף המיטה', () => {
    expect(bedbug.conditionFields[0].key).toBe('bedFrameSprayed');
    expect(bedbug.conditionFields[0].required).toBe(true);
  });

  it('מציגה את הוראת 24 השעות רק כשהתשובה "כן"', () => {
    expect(revealedInstructions(bedbug, { bedFrameSprayed: 'yes' }).join(' ')).toMatch(/24 שעות/);
    expect(revealedInstructions(bedbug, { bedFrameSprayed: 'no' })).toEqual([]);
    expect(revealedInstructions(bedbug, {})).toEqual([]);
  });
});

describe('דרקר – מינון לפי סוג משטח', () => {
  const draker = template('tpl_draker_crawling');
  const doses = label('mat_draker').doses;

  it('אינו מציג מינון לפני בחירת סוג המשטח', () => {
    expect(visibleDoses(doses, draker.doseIds, {})).toHaveLength(0);
  });

  it('מציג רק את המינון המתאים למשטח שנבחר', () => {
    const absorbent = visibleDoses(doses, draker.doseIds, { surfaceType: 'absorbent' });
    expect(absorbent).toHaveLength(1);
    expect(absorbent[0].id).toBe('dose_draker_absorbent');

    const nonAbsorbent = visibleDoses(doses, draker.doseIds, { surfaceType: 'non_absorbent' });
    expect(nonAbsorbent).toHaveLength(1);
    expect(nonAbsorbent[0].id).toBe('dose_draker_non_absorbent');
  });
});

describe('בדיקה 6: ריבוי חומרים בלי ערבוב אזהרות', () => {
  it('זמן הכניסה הוא המחמיר ביותר, והוראות הפיתיון נשארות תחת החומר שלהן', () => {
    const spray = { ...label('mat_dragon'), reEntryHours: 4 };
    const longer = { ...label('mat_draker'), reEntryHours: 8 };
    const bait = label('mat_pastion_plus');

    const result = computeReEntry([
      { name: 'דרגון', label: spray },
      { name: 'דרקר 10.2', label: longer },
      { name: 'פסטיון פלוס פסטה', label: bait },
    ]);

    expect(result.hours).toBe(8);
    expect(result.specialInstructions).toHaveLength(1);
    expect(result.specialInstructions[0].material).toBe('פסטיון פלוס פסטה');
  });

  it('מדווח על חומר שזמן הכניסה שלו לא הוזן', () => {
    const result = computeReEntry([{ name: 'דרגון', label: label('mat_dragon') }]);
    expect(result.hours).toBeUndefined();
    expect(result.missing).toContain('דרגון');
  });
});

describe('תוקף רישום', () => {
  it('מזהה תוקף שחלף', () => {
    expect(isRegistrationStale('2001-01-01')).toBe(true);
    expect(isRegistrationStale('2999-01-01')).toBe(false);
    expect(isRegistrationStale(undefined)).toBe(false);
  });
});
