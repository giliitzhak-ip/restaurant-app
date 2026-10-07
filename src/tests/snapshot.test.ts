/**
 * צילום היומן בעת הסיום, והנעילה שאחריו.
 * זו הראיה שנמסרה ללקוח: היא אינה משתנה, ואי אפשר לערוך אותה בדיעבד.
 */

import { describe, expect, it } from 'vitest';
import { buildJournalSnapshot, fullJournalFromState } from '../lib/snapshot';
import { isJournalLocked } from '../lib/journalLock';
import { seedState } from '../state/seed';
import type { AppState, Journal, JournalMaterial, Material, MaterialLabel } from '../types';
import { NOT_ENTERED } from '../types';

const journal = (over: Partial<Journal> = {}): Journal => ({
  id: 'jrn_1', journalNumber: 7, status: 'draft', startedAt: '2026-03-01T08:00:00.000Z',
  workKind: 'private', visitKind: 'new', exterminatorId: 'ext_yizhak', exterminatorName: 'יצחק',
  licenseNumber: '123', preTreatmentActions: [], preventionRecommendations: [],
  warrantyKind: 'none', customerAcknowledged: true, createdAt: 'x', updatedAt: 'x', lastStep: 8,
  customerId: 'cus_1', siteAddress: 'הרצל 1', ...over,
});

const material = (over: Partial<Material> = {}): Material => ({
  id: 'mat_1', tradeName: 'דרגון', formulation: '', form: 'spray',
  activeIngredients: [{ name: 'ציפרמטרין', concentration: '10%' }],
  registrationNumber: 'ר-1', aliases: [], labelId: 'lbl_1', ...over,
});

const label = (over: Partial<MaterialLabel> = {}): MaterialLabel => ({
  id: 'lbl_1', materialId: 'mat_1', sourceUrl: '', registrationValidUntil: NOT_ENTERED,
  approvedPestIds: [], doses: [], humanWarnings: [], animalWarnings: [],
  environmentRisks: [], customerInstructions: [], reEntryHours: null,
  reEntryNote: NOT_ENTERED, verificationStatus: 'unverified', ...over,
});

const journalMaterial = (): JournalMaterial => ({
  id: 'jmt_1', journalId: 'jrn_1', materialId: 'mat_1', materialNameSnapshot: 'דרגון',
  conditionAnswers: {},
  execution: {
    batchNumber: 'B-1', packageExpiry: '2027-01-01', chosenDoseText: '10 מ"ל',
    materialAmount: '20', waterAmount: '5', coverage: '50', coverageUnit: 'sqm',
  },
});

function stateWithJournal(status: Journal['status'] = 'draft'): AppState {
  const base = seedState();
  return {
    ...base,
    journals: [journal({ status })],
    journalMaterials: [journalMaterial()],
    journalPests: [{ id: 'jps_1', journalId: 'jrn_1', pestId: 'rat', severity: 'high', areas: ['מטבח'], signs: [] }],
    signatures: [{ id: 'sgn_1', journalId: 'jrn_1', role: 'customer', signerName: 'דני', image: 'data:image/png;base64,AAA', signedAt: 'x' }],
    attachments: [{ id: 'att_1', journalId: 'jrn_1', kind: 'photo', name: 'תמונה', dataUrl: 'data:image/png;base64,HUGE', createdAt: 'x' }],
    materials: [material(), ...base.materials],
    materialLabels: [label(), ...base.materialLabels],
    customers: [{ id: 'cus_1', customerNumber: '1001', name: 'מסעדה', address: 'הרצל 1', createdAt: 'x', updatedAt: 'x' }],
  };
}

describe('נעילת יומן', () => {
  it('טיוטה אינה נעולה', () => {
    expect(isJournalLocked(journal({ status: 'draft' }))).toBe(false);
  });

  it('יומן שהושלם או נשלח נעול', () => {
    expect(isJournalLocked(journal({ status: 'completed' }))).toBe(true);
    expect(isJournalLocked(journal({ status: 'sent' }))).toBe(true);
  });

  it('יומן מבוטל אינו נעול לעריכה של הסיבה', () => {
    expect(isJournalLocked(journal({ status: 'cancelled' }))).toBe(false);
  });
});

describe('צילום היומן', () => {
  it('כולל את כל מה שהמסמך מציג', () => {
    const snap = buildJournalSnapshot(stateWithJournal(), 'jrn_1');
    expect(snap).not.toBeNull();
    expect(snap!.journalNumber).toBe(7);
    expect(snap!.schemaVersion).toBeGreaterThan(0);
    expect(snap!.full.materials).toHaveLength(1);
    expect(snap!.full.pests[0].areas).toEqual(['מטבח']);
    expect(snap!.full.signatures[0].image).toContain('base64');
    expect(snap!.customer?.name).toBe('מסעדה');
    expect(snap!.materials.map((m) => m.id)).toEqual(['mat_1']);
    expect(snap!.materialLabels.map((l) => l.id)).toEqual(['lbl_1']);
  });

  it('אינו משתנה כששם התכשיר או פרטי הלקוח נערכים אחר כך', () => {
    const before = stateWithJournal();
    const snap = buildJournalSnapshot(before, 'jrn_1')!;

    // עריכות מאוחרות במאגר ובכרטיס הלקוח
    const after: AppState = {
      ...before,
      materials: before.materials.map((m) => (m.id === 'mat_1' ? { ...m, tradeName: 'שם חדש' } : m)),
      customers: before.customers.map((c) => ({ ...c, name: 'שם לקוח חדש' })),
      materialLabels: before.materialLabels.map((l) =>
        (l.id === 'lbl_1' ? { ...l, verificationStatus: 'verified' as const, reEntryHours: 4 } : l)),
    };

    expect(snap.materials[0].tradeName).toBe('דרגון');
    expect(snap.customer?.name).toBe('מסעדה');
    expect(snap.materialLabels[0].verificationStatus).toBe('unverified');
    expect(snap.materialLabels[0].reEntryHours).toBeNull();
    // והמצב החדש אכן שונה – כלומר ההשוואה אינה ריקה מתוכן
    expect(fullJournalFromState(after, 'jrn_1')).not.toBeNull();
    expect(after.materials.find((m) => m.id === 'mat_1')?.tradeName).toBe('שם חדש');
  });

  it('אינו מכפיל את תוכן הקבצים המצורפים', () => {
    const snap = buildJournalSnapshot(stateWithJournal(), 'jrn_1')!;
    expect(snap.full.attachments).toHaveLength(1);
    expect(snap.full.attachments[0].name).toBe('תמונה');
    expect(snap.full.attachments[0].dataUrl).toBe('');
  });

  it('מחזיר null ליומן שאינו קיים', () => {
    expect(buildJournalSnapshot(stateWithJournal(), 'jrn_missing')).toBeNull();
  });
});
