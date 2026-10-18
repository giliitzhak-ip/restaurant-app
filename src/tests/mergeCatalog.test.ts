/**
 * מאגר תכשירים: רשומה אחת לכל תכשיר רשום, בלי לאבד היסטוריה.
 */

import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../state/mergeCatalog';
import { seedState } from '../state/seed';
import { NOT_ENTERED } from '../types';
import type { JournalMaterial, Material, MaterialLabel, TreatmentTemplate } from '../types';

const material = (over: Partial<Material> & { id: string }): Material => ({
  tradeName: 'תכשיר', formulation: NOT_ENTERED, form: 'spray',
  activeIngredients: [], registrationNumber: NOT_ENTERED, aliases: [], ...over,
});

const label = (over: Partial<MaterialLabel> & { id: string; materialId: string }): MaterialLabel => ({
  sourceUrl: '', registrationValidUntil: NOT_ENTERED, approvedPestIds: [], doses: [],
  humanWarnings: [], animalWarnings: [], environmentRisks: [], customerInstructions: [],
  reEntryHours: null, reEntryNote: NOT_ENTERED, verificationStatus: 'unverified', ...over,
});

const seeded = {
  materials: [
    material({ id: 'gov_640', tradeName: 'דרגון', registrationNumber: '640', labelId: 'lbl_640' }),
    material({ id: 'gov_585', tradeName: 'בלוקיון פלוס', registrationNumber: '585', labelId: 'lbl_585' }),
  ],
  materialLabels: [
    label({ id: 'lbl_640', materialId: 'gov_640' }),
    label({ id: 'lbl_585', materialId: 'gov_585' }),
  ],
  treatmentTemplates: [] as TreatmentTemplate[],
};

const journalMaterial = (materialId: string): JournalMaterial => ({
  id: `jmt_${materialId}`, journalId: 'jrn_1', materialId,
  materialNameSnapshot: 'דרגון', conditionAnswers: {},
  execution: {
    batchNumber: 'B-1', packageExpiry: '2027-01-01', chosenDoseText: '10',
    materialAmount: '20', waterAmount: '', coverage: '50', coverageUnit: 'sqm',
  },
});

describe('מיזוג לפי מספר רישום', () => {
  it('מזהה ישן לאותו מספר רישום אינו מוסיף תכשיר כפול', () => {
    const stored = {
      materials: [material({ id: 'gov_640_0', tradeName: 'דרגון', registrationNumber: '640' })],
    };
    const out = mergeCatalog(seeded, stored);
    expect(out.materials).toHaveLength(2);
    expect(out.merged).toBe(1);
    expect(out.remapped).toEqual({ gov_640_0: 'gov_640' });
  });

  it('ההפניות ביומנים מוסבות למזהה הקנוני', () => {
    const stored = {
      materials: [material({ id: 'gov_640_0', tradeName: 'דרגון', registrationNumber: '640' })],
      journalMaterials: [journalMaterial('gov_640_0'), journalMaterial('gov_585')],
    };
    const out = mergeCatalog(seeded, stored);
    expect(out.journalMaterials.map((m) => m.materialId)).toEqual(['gov_640', 'gov_585']);
    // נתוני הביצוע נשמרים בדיוק
    expect(out.journalMaterials[0].execution.batchNumber).toBe('B-1');
  });

  it('תבנית שמצביעה על המזהה הישן מוסבת גם היא', () => {
    const stored = {
      materials: [material({ id: 'gov_640_0', registrationNumber: '640' })],
      treatmentTemplates: [{
        id: 'tpl_1', name: 'תבנית', materialId: 'gov_640_0', pestIds: [],
        defaultActions: [], conditionFields: [], doseIds: [], system: false,
      } as TreatmentTemplate],
    };
    const out = mergeCatalog(seeded, stored);
    expect(out.treatmentTemplates.find((t) => t.id === 'tpl_1')?.materialId).toBe('gov_640');
  });

  it('שני מספרי רישום שונים נשארים שני תכשירים', () => {
    const stored = {
      materials: [material({ id: 'other', tradeName: 'דרגון', registrationNumber: '999' })],
    };
    const out = mergeCatalog(seeded, stored);
    expect(out.materials).toHaveLength(3);
    expect(out.merged).toBe(0);
  });

  it('תכשיר שאינו במאגר הנוכחי נשמר ואינו נמחק', () => {
    const stored = {
      materials: [material({ id: 'manual_1', tradeName: 'תכשיר שהוזן ידנית' })],
    };
    const out = mergeCatalog(seeded, stored);
    expect(out.materials.map((m) => m.id)).toContain('manual_1');
  });

  it('רשומה ללא מספר רישום אינה מתמזגת לפי שם', () => {
    const stored = {
      materials: [material({ id: 'manual_2', tradeName: 'דרגון' })],
    };
    const out = mergeCatalog(seeded, stored);
    expect(out.merged).toBe(0);
    expect(out.materials).toHaveLength(3);
  });

  it('תווית שהמשתמש אימת גוברת על תווית המאגר', () => {
    const stored = {
      materials: [material({ id: 'gov_640_0', registrationNumber: '640' })],
      materialLabels: [label({
        id: 'lbl_old', materialId: 'gov_640_0',
        verificationStatus: 'verified', reEntryHours: 4,
      })],
    };
    const out = mergeCatalog(seeded, stored);
    const forDragon = out.materialLabels.filter((l) => l.materialId === 'gov_640');
    expect(forDragon).toHaveLength(1);
    expect(forDragon[0].verificationStatus).toBe('verified');
    expect(forDragon[0].reEntryHours).toBe(4);
  });

  it('תווית שמורה שאינה מאומתת אינה דורסת את תווית המאגר', () => {
    const stored = {
      materials: [material({ id: 'gov_640_0', registrationNumber: '640' })],
      materialLabels: [label({ id: 'lbl_old', materialId: 'gov_640_0', reEntryNote: 'ישן' })],
    };
    const out = mergeCatalog(seeded, stored);
    expect(out.materialLabels.filter((l) => l.materialId === 'gov_640')).toHaveLength(1);
    expect(out.materialLabels.find((l) => l.materialId === 'gov_640')?.id).toBe('lbl_640');
  });

  it('מיזוג ללא נתונים שמורים אינו משנה דבר', () => {
    const out = mergeCatalog(seeded, {});
    expect(out.materials).toEqual(seeded.materials);
    expect(out.merged).toBe(0);
  });
});

describe('המאגר שמגיע עם הקוד', () => {
  it('אין בו שני תכשירים עם אותו מספר רישום', () => {
    const { materials } = seedState();
    const regs = materials
      .map((m) => m.registrationNumber)
      .filter((r) => r && r !== NOT_ENTERED);
    expect(new Set(regs).size).toBe(regs.length);
  });

  it('אין בו שני תכשירים עם אותו מזהה או אותו שם מסחרי', () => {
    const { materials } = seedState();
    const ids = materials.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = materials.map((m) => m.tradeName.trim());
    expect(new Set(names).size).toBe(names.length);
  });

  it('מזהי המאגר אינם נגזרים ממקום השורה בקובץ', () => {
    const { materials } = seedState();
    const fromCatalog = materials.filter((m) => m.id.startsWith('gov_'));
    expect(fromCatalog.length).toBeGreaterThan(100);
    for (const m of fromCatalog) {
      expect(m.id).toBe(`gov_${m.registrationNumber}`);
    }
  });

  it('רשומה ידנית קיבלה את מספר הרישום הרשמי מהמאגר', () => {
    const { materials } = seedState();
    const blokion = materials.find((m) => m.tradeName === 'בלוקיון פלוס');
    expect(blokion).toBeDefined();
    expect(blokion!.id).toBe('mat_blokion_plus');        // המזהה הידני נשמר
    expect(blokion!.registrationNumber).toBe('585');     // והמספר הרשמי הושלם
  });

  it('לכל תווית יש תכשיר אחד, ואין שתי תוויות לאותו תכשיר', () => {
    const { materials, materialLabels } = seedState();
    const perMaterial = new Map<string, number>();
    for (const l of materialLabels) {
      perMaterial.set(l.materialId, (perMaterial.get(l.materialId) ?? 0) + 1);
    }
    const ids = new Set(materials.map((m) => m.id));
    expect([...perMaterial.values()].every((n) => n === 1)).toBe(true);
    expect([...perMaterial.keys()].every((id) => ids.has(id))).toBe(true);
  });
});
