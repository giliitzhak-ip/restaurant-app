import { describe, expect, it } from 'vitest';
import { computeReEntry, reEntryHeadline, hasSprayAction } from '../lib/reEntry';
import type { MaterialLabel } from '../types';

const label = (over: Partial<MaterialLabel>): MaterialLabel => ({
  id: 'l', materialId: 'm', approvedPestIds: [], doses: [],
  humanWarnings: [], animalWarnings: [], environmentRisks: [], customerInstructions: [],
  verificationStatus: 'verified',
  ...over,
});

describe('זמן כניסה מחדש', () => {
  it('מבחן קבלה ח: חומר עם שעתיים יחד עם חומר חסר אינו מציג זמן סופי', () => {
    const r = computeReEntry([
      { name: 'דרקר', label: label({ reEntryHours: 2 }) },
      { name: 'דרגון', label: label({ reEntryHours: undefined, verificationStatus: 'unverified' }) },
    ]);
    expect(r.status).toBe('incomplete');
    expect(r.missing).toContain('דרגון');
    expect(reEntryHeadline(r)).not.toContain('2');
    expect(reEntryHeadline(r)).toContain('לא ניתן לקבוע');
    // הערך הידוע נשמר, אך רק כנתון חלקי
    expect(r.strictestKnownHours).toBe(2);
  });

  it('תווית שאינה מאומתת אינה ראיה לזמן כניסה, גם אם יש בה מספר', () => {
    const r = computeReEntry([
      { name: 'לא מאומת', label: label({ reEntryHours: 4, verificationStatus: 'unverified' }) },
    ]);
    expect(r.status).toBe('incomplete');
    expect(r.missing).toContain('לא מאומת');
  });

  it('כשכל התוויות מאומתות נבחר הזמן המחמיר', () => {
    const r = computeReEntry([
      { name: 'א', label: label({ reEntryHours: 4 }) },
      { name: 'ב', label: label({ reEntryHours: 8 }) },
      { name: 'ג', label: label({ reEntryHours: 6 }) },
    ]);
    expect(r.status).toBe('determinate');
    expect(r.strictestKnownHours).toBe(8);
    expect(reEntryHeadline(r)).toContain('8 שעות');
  });

  it('פיתיון בלבד ללא ריסוס: אין זמן כניסה של ריסוס', () => {
    const r = computeReEntry([{ name: 'פסטיון', label: label({ reEntryHours: null }) }]);
    expect(r.status).toBe('bait_only');
    expect(reEntryHeadline(r)).toContain('פיתיון');
  });

  it('פיתיון יחד עם פעולת ריסוס מתועדת אינו נחשב פיתיון בלבד', () => {
    const r = computeReEntry(
      [{ name: 'פסטיון', label: label({ reEntryHours: null }) }],
      { sprayPerformed: true },
    );
    expect(r.status).toBe('incomplete');
    expect(r.inconsistentBaitClaim).toBe(true);
    expect(reEntryHeadline(r)).toContain('לא ניתן לקבוע');
  });

  it('פיתיון יחד עם תכשיר ריסוס ידוע מחזיר את זמן הריסוס', () => {
    const r = computeReEntry([
      { name: 'פסטיון', label: label({ reEntryHours: null }) },
      { name: 'דרקר', label: label({ reEntryHours: 6 }) },
    ]);
    expect(r.status).toBe('determinate');
    expect(r.strictestKnownHours).toBe(6);
  });

  it('הוראות מיוחדות נשמרות ואינן מוחלפות בחישוב', () => {
    const r = computeReEntry([
      { name: 'פסטיון', label: label({ reEntryHours: null, reEntryNote: 'תיבות נעולות ומקובעות' }) },
      { name: 'דרקר', label: label({ reEntryHours: 6 }) },
    ]);
    expect(r.specialInstructions).toEqual([
      { material: 'פסטיון', text: 'תיבות נעולות ומקובעות' },
    ]);
  });

  it('ללא תכשירים כלל', () => {
    const r = computeReEntry([]);
    expect(r.status).toBe('no_materials');
    expect(reEntryHeadline(r)).toContain('לא נעשה שימוש בתכשיר');
  });

  it('תכשיר ללא תווית כלל נחשב חסר', () => {
    const r = computeReEntry([{ name: 'ללא תווית' }]);
    expect(r.status).toBe('incomplete');
    expect(r.missing).toEqual(['ללא תווית']);
  });

  it('מזהה פעולת ריסוס או טיפול נקודתי', () => {
    expect(hasSprayAction([{ kind: 'spraying' }])).toBe(true);
    expect(hasSprayAction([{ kind: 'spot_treatment' }])).toBe(true);
    expect(hasSprayAction([{ kind: 'bait_stations' }, { kind: 'monitoring' }])).toBe(false);
  });
});
