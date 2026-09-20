import { describe, expect, it } from 'vitest';
import { parseCoordinatesText, mapViewLink } from '../../src/lib/legacy/coordinates';
import { buildSmsSummary, smsHref } from '../../src/lib/legacy/smsSummary';
import { collectLearnableTemplates, batchesForProduct, siteKeyOf } from '../../src/lib/legacy/repo';
import { loadFromPreviousLog } from '../../src/features/wizard/loadPrevious';
import { annexRuleFor, splitIntoPhrases, TEMPLATE_LIBRARIES } from '../../src/schema/textLibraries';
import { validateForCompletion } from '../../src/schema/pestLog';
import { validDwellingLog } from '../fixtures/sampleLog';

/**
 * הפונקציות שהועברו מהגרסה המקומית הקודמת של היומן.
 * כל הנתונים כאן בדויים.
 */

describe('קריאת נ״צ מטקסט שהודבק', () => {
  it('קורא נ״צ מטקסט חופשי', () => {
    expect(parseCoordinatesText('31.750123, 35.091234')).toEqual({ latitude: 31.750123, longitude: 35.091234 });
    expect(parseCoordinatesText('31.750123 35.091234')).toEqual({ latitude: 31.750123, longitude: 35.091234 });
  });

  it('קורא נ״צ מקישור Google Maps', () => {
    expect(parseCoordinatesText('https://www.google.com/maps/@31.768319,35.213710,17z')).toEqual({
      latitude: 31.768319,
      longitude: 35.21371,
    });
    expect(parseCoordinatesText('https://maps.google.com/?q=32.085300,34.781800')).toEqual({
      latitude: 32.0853,
      longitude: 34.7818,
    });
  });

  it('קורא נ״צ מקישור Waze', () => {
    expect(parseCoordinatesText('https://waze.com/ul?ll=31.771959,35.217018&navigate=yes')).toEqual({
      latitude: 31.771959,
      longitude: 35.217018,
    });
  });

  it('דוחה טקסט שאינו נ״צ ומספרים מחוץ לתחום', () => {
    expect(parseCoordinatesText('')).toBeNull();
    expect(parseCoordinatesText('רחוב הדוגמה 12')).toBeNull();
    expect(parseCoordinatesText('999.5, 35.2')).toBeNull();
  });

  it('בונה קישור צפייה תקין', () => {
    expect(mapViewLink({ latitude: 31.5, longitude: 35.1 })).toContain('query=31.5,35.1');
  });
});

describe('סיכום ל-SMS', () => {
  const snapshot = {
    orderer: { name: 'מזמין בדיקה', mobile: '050-0000000' },
    execution: { performedDate: '2026-09-10', performedStartTime: '09:00' },
    location: { street: 'רחוב הבדיקה', houseNumber: '1', city: 'עיר הבדיקה' },
    monitoring: { findings: [{ pestName: 'ג׳וקים' }] },
    applications: [{ productTradeName: 'תכשיר בדיקה', activeIngredientName: 'חומר פעיל' }],
    preWarnings: { reEntryHours: 4 },
    postWarnings: { afterTreatmentInfo: 'לאוורר שעתיים' },
    exterminator: { fullName: 'מדביר בדיקה', licenseNumber: 'TEST-1', mobile: '050-1111111' },
  };

  it('כולל את פרטי היומן ואת מספר מרכז ההרעלות', () => {
    const text = buildSmsSummary({
      serialNumber: 42,
      organizationName: 'עסק בדיקה',
      snapshot,
      poisonCenterPhone: '04-7771900',
    });
    expect(text).toContain('יומן ביצוע הדברה מס׳ 42');
    expect(text).toContain('רחוב הבדיקה 1, עיר הבדיקה');
    expect(text).toContain('ג׳וקים');
    expect(text).toContain('תכשיר בדיקה (חומר פעיל)');
    expect(text).toContain('זמן כניסה מחדש: 4 שעות');
    expect(text).toContain('04-7771900');
  });

  it('מצרף קישור רק כשיש קישור, ואינו מתיימר לצרף קובץ', () => {
    const withoutLink = buildSmsSummary({
      serialNumber: 1,
      organizationName: 'עסק',
      snapshot,
      poisonCenterPhone: '04-7771900',
    });
    expect(withoutLink).not.toContain('קישור ליומן המלא');

    const withLink = buildSmsSummary({
      serialNumber: 1,
      organizationName: 'עסק',
      snapshot,
      poisonCenterPhone: '04-7771900',
      signedUrl: 'https://example.test/signed',
    });
    expect(withLink).toContain('קישור ליומן המלא');
  });

  it('בונה קישור sms תקין, כולל הפורמט של Apple', () => {
    expect(smsHref('050-0000000', 'שלום')).toBe(`sms:0500000000?body=${encodeURIComponent('שלום')}`);
    expect(smsHref('050-0000000', 'שלום', true)).toContain('&body=');
  });
});

describe('ספריות ניסוח', () => {
  it('לכל ספרייה יש ניסוחים וכותרת', () => {
    for (const library of Object.values(TEMPLATE_LIBRARIES)) {
      expect(library.items.length).toBeGreaterThan(0);
      expect(library.title.length).toBeGreaterThan(2);
    }
  });

  it('מפרק טקסט לניסוחים ומדלג על שורות קצרות', () => {
    expect(splitIntoPhrases('שורה ראשונה מלאה\n\nאב\nשורה שנייה מלאה')).toEqual([
      'שורה ראשונה מלאה',
      'שורה שנייה מלאה',
    ]);
    expect(splitIntoPhrases(null)).toEqual([]);
  });

  it('אוסף ניסוחים ללמידה מכל החלקים הרלוונטיים ביומן', () => {
    const learned = collectLearnableTemplates({
      monitoring: { findings: [{ infestationSigns: 'גללים טריים מתחת לכיור' }] },
      prevention: {
        circumstancesForChoosingPestControl: 'נמצאה פעילות חוזרת במוקד',
        actions: [{ description: 'איטום צנרת במטבח' }],
      },
      preWarnings: { treatmentNatureDescription: 'ריסוס שאריתי במסתורים' },
      postWarnings: {
        treatmentPerformedDescription: 'בוצע ריסוס שאריתי בכל המוקדים',
        afterTreatmentInfo: 'לאוורר שעתיים לפני כניסה',
      },
      warranty: { notes: 'אחריות בכפוף לאיטום הצנרת' },
    });

    const kinds = learned.map((item) => item.kind);
    expect(kinds).toContain('finding_signs');
    expect(kinds).toContain('circumstances');
    expect(kinds).toContain('prevention');
    expect(kinds).toContain('nature_before');
    expect(kinds).toContain('nature_after');
    expect(kinds).toContain('warnings');
    expect(kinds).toContain('warranty');
  });
});

describe('נספח א׳ — פירוט מזיק', () => {
  it('מזהה מזיקים שנדרש עבורם פירוט', () => {
    expect(annexRuleFor('קרציות')?.options).toEqual(['קשות', 'רכות']);
    expect(annexRuleFor('יתושים')?.options).toEqual(['בוגרים', 'זחלים']);
    expect(annexRuleFor('טרמיטים')?.label).toBe('סוג הטרמיטים');
    expect(annexRuleFor('חיפושיות מזון')?.options).toBeUndefined();
    expect(annexRuleFor('ג׳וקים')).toBeUndefined();
  });

  it('חוסם השלמה כשחסר פירוט, ומאפשר אותה כשהוא קיים', () => {
    const base = validDwellingLog();
    const findings = base.monitoring.findings.map((finding) => ({ ...finding, pestName: 'קרציות' }));
    const applications = base.applications.map((application) => ({
      ...application,
      targetPestName: 'קרציות',
    }));

    const missing = validateForCompletion(
      { ...base, monitoring: { ...base.monitoring, findings }, applications },
      { serverNow: new Date('2026-09-11T08:00:00.000Z') },
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.problems.some((problem) => problem.path.includes('pestSubtype'))).toBe(true);
    }

    const filled = validateForCompletion(
      {
        ...base,
        monitoring: { ...base.monitoring, findings: findings.map((f) => ({ ...f, pestSubtype: 'קשות' })) },
        applications,
      },
      { serverNow: new Date('2026-09-11T08:00:00.000Z') },
    );
    expect(filled.ok).toBe(true);
  });

  it('דוחה פירוט שאינו מהרשימה הסגורה', () => {
    const base = validDwellingLog();
    const findings = base.monitoring.findings.map((finding) => ({
      ...finding,
      pestName: 'קרציות',
      pestSubtype: 'ורודות',
    }));
    const applications = base.applications.map((application) => ({
      ...application,
      targetPestName: 'קרציות',
    }));
    const result = validateForCompletion(
      { ...base, monitoring: { ...base.monitoring, findings }, applications },
      { serverNow: new Date('2026-09-11T08:00:00.000Z') },
    );
    expect(result.ok).toBe(false);
  });
});

describe('טעינה מיומן קודם', () => {
  const previous = {
    treatmentKinds: ['standard'],
    monitoring: { findings: [{ id: 'f1', pestName: 'ג׳וקים', infestationSigns: 'גללים' }] },
    prevention: { actions: [{ id: 'p1', description: 'איטום' }], circumstancesForChoosingPestControl: 'פעילות' },
    applications: [
      { id: 'a1', productTradeName: 'תכשיר', batchNumber: 'B-1', dosage: '50', applicationMethod: 'ריסוס' },
    ],
    preWarnings: { treatmentNatureDescription: 'ריסוס', acknowledgedByExterminator: true, reEntryHours: 4, labelReference: 'REG-1' },
    postWarnings: { afterTreatmentInfo: 'אוורור', acknowledgedByExterminator: true },
    signatures: { exterminator: { signerName: 'מדביר', dataUrl: 'data:image/png;base64,AAA' } },
    execution: { performedDate: '2026-01-01', performedStartTime: '08:00' },
    location: { city: 'עיר', coordinates: { latitude: 1, longitude: 2 } },
    handover: { delivered: true, deliveredAt: '2026-01-01T08:30:00Z' },
    warranty: { period: '3 חודשים', notes: 'תנאים' },
  };

  it('מצב „הכול” מעתיק את מה שחוזר, ומנקה את מה שאסור', () => {
    const { content, copied } = loadFromPreviousLog(previous, { execution: { timeZone: 'Asia/Jerusalem' } }, 'all');

    expect(copied.length).toBeGreaterThan(2);
    expect((content.monitoring as Record<string, unknown>).findings).toHaveLength(1);
    expect((content.warranty as Record<string, unknown>).period).toBe('3 חודשים');

    // מה שלעולם אינו מועתק:
    expect(content.signatures).toBeUndefined();
    expect((content.execution as Record<string, unknown>).performedDate).toBeUndefined();
    expect((content.location as Record<string, unknown> | undefined)?.coordinates).toBeUndefined();
    const application = (content.applications as Array<Record<string, unknown>>)[0];
    expect(application?.batchNumber).toBeUndefined();
    expect(application?.dosage).toBeUndefined();
    expect(application?.productTradeName).toBe('תכשיר');
    expect((content.preWarnings as Record<string, unknown>).acknowledgedByExterminator).toBeUndefined();
    expect((content.preWarnings as Record<string, unknown>).reEntryHours).toBeUndefined();
    expect((content.postWarnings as Record<string, unknown>).acknowledgedByExterminator).toBeUndefined();
  });

  it('מצב „תכשירים בלבד” אינו נוגע בממצאים ובאזהרות', () => {
    const { content } = loadFromPreviousLog(previous, { execution: { timeZone: 'Asia/Jerusalem' } }, 'applications');
    expect(content.applications).toHaveLength(1);
    expect(content.monitoring).toBeUndefined();
    expect(content.preWarnings).toBeUndefined();
  });
});

describe('אצוות ומפתח אתר', () => {
  it('מציע רק אצוות של אותו תכשיר, בלי כפילויות', () => {
    const recent = [
      { productTradeName: 'תכשיר א', batchNumber: 'B-1' },
      { productTradeName: 'תכשיר א', batchNumber: 'B-1' },
      { productTradeName: 'תכשיר א', batchNumber: 'B-2' },
      { productTradeName: 'תכשיר ב', batchNumber: 'B-9' },
    ].map((item) => ({
      ...item,
      activeIngredientName: null,
      activeIngredientConcentrationPercent: null,
      applicationMethod: null,
      dosageUnit: null,
      readyToUse: false,
      serialNumber: null,
      completedAt: null,
    }));

    expect(batchesForProduct(recent, 'תכשיר א')).toEqual(['B-1', 'B-2']);
    expect(batchesForProduct(recent, 'לא קיים')).toEqual([]);
    expect(batchesForProduct(recent, '')).toEqual([]);
  });

  it('מפתח האתר מתעלם מהבדלי רווחים וגרשיים', () => {
    expect(siteKeyOf('ועד בית  דוגמה', 'רחוב הדוגמה 10')).toBe(
      siteKeyOf('ועד בית דוגמה', 'רחוב הדוגמה 10'),
    );
    expect(siteKeyOf('לקוח א', 'מקום א')).not.toBe(siteKeyOf('לקוח א', 'מקום ב'));
  });
});
