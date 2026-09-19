import { describe, expect, it } from 'vitest';
import { validateForCompletion } from '@/schema/pestLog';
import { lookupField } from '@/schema/fieldRegistry';
import {
  validDwellingLog,
  validFoggingLog,
  validFumigationLog,
  validLogWithAssistant,
  validOpenAreaLog,
} from '../fixtures/sampleLog';

const NOW = { serverNow: new Date('2026-09-11T00:00:00Z') };

/** מאתר בעיה לפי נתיב, לבדיקות ממוקדות. */
function problemAt(content: unknown, path: string) {
  const result = validateForCompletion(content, NOW);
  if (result.ok) return undefined;
  return result.problems.find((problem) => problem.path === path);
}

describe('סכימת היומן — מקרים תקינים', () => {
  it('יומן דירה מלא עובר ולידציה', () => {
    const result = validateForCompletion(validDwellingLog(), NOW);
    if (!result.ok) console.error(result.problems);
    expect(result.ok).toBe(true);
  });

  it('יומן שטח פתוח מלא עובר ולידציה', () => {
    expect(validateForCompletion(validOpenAreaLog(), NOW).ok).toBe(true);
  });

  it('יומן ערפול מלא עובר ולידציה', () => {
    expect(validateForCompletion(validFoggingLog(), NOW).ok).toBe(true);
  });

  it('יומן איוד מלא עובר ולידציה', () => {
    expect(validateForCompletion(validFumigationLog(), NOW).ok).toBe(true);
  });

  it('יומן עם מדביר מסייע מלא עובר ולידציה', () => {
    expect(validateForCompletion(validLogWithAssistant(), NOW).ok).toBe(true);
  });
});

describe('שדות חובה — לא ניתן להשלים יומן חסר', () => {
  const requiredPaths: Array<[string, string]> = [
    ['exterminator.fullName', 'שם המדביר'],
    ['exterminator.licenseNumber', 'מספר רישיון המדביר'],
    ['exterminator.mobile', 'נייד המדביר'],
    ['exterminator.email', 'דוא״ל המדביר'],
    ['exterminator.address', 'כתובת המדביר'],
    ['orderer.name', 'שם המזמין'],
    ['orderer.role', 'תפקיד המזמין'],
    ['execution.performedDate', 'תאריך הביצוע'],
    ['execution.performedStartTime', 'שעת הביצוע'],
    ['prevention.circumstancesForChoosingPestControl', 'נסיבות ההחלטה על הדברה'],
    ['preWarnings.treatmentNatureDescription', 'טיב ההדברה'],
    ['preWarnings.risksToHumans', 'סיכונים לאדם'],
    ['preWarnings.risksToAnimals', 'סיכונים לבעלי חיים'],
    ['preWarnings.reEntryHours', 'זמן כניסה מחדש'],
    ['preWarnings.additionalLabelInstructions', 'הוראות התווית'],
    ['preWarnings.labelReference', 'אסמכתת התווית'],
    ['postWarnings.duringTreatmentInfo', 'מידע במהלך ההדברה'],
    ['postWarnings.afterTreatmentInfo', 'מידע בסיום ההדברה'],
    ['handover.recipientName', 'שם מקבל היומן'],
  ];

  for (const [path, label] of requiredPaths) {
    it(`חסר ${label} (${path}) חוסם השלמה`, () => {
      const log = validDwellingLog() as Record<string, unknown>;
      const segments = path.split('.');
      let cursor = log;
      for (const segment of segments.slice(0, -1)) cursor = cursor[segment] as Record<string, unknown>;
      delete cursor[segments[segments.length - 1]!];

      const result = validateForCompletion(log, NOW);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      // השגיאה חייבת להצביע על השדה עצמו כדי שהקפיצה אליו תעבוד.
      expect(result.problems.some((problem) => problem.path === path)).toBe(true);
    });
  }

  it('רשימת השדות החסרים בעברית ומקושרת לשלב', () => {
    const result = validateForCompletion({}, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.length).toBeGreaterThan(5);
    for (const problem of result.problems) {
      expect(problem.message).toMatch(/[֐-׿]/);
      expect(problem.step).toBeGreaterThanOrEqual(1);
      expect(problem.step).toBeLessThanOrEqual(6);
      expect(problem.domId).toMatch(/^field-/);
    }
  });
});

describe('דרישה 3 — נייד חובה למזמין שהוא אדם פרטי', () => {
  it('אדם פרטי בלי נייד — נחסם', () => {
    const log = validDwellingLog({
      orderer: { name: 'מזמין דוגמה', phone: '0500000011', isPrivatePerson: true, role: 'בעל הדירה' },
    });
    const problem = problemAt(log, 'orderer.mobile');
    expect(problem?.message).toContain('חובה כאשר המזמין הוא אדם פרטי');
  });

  it('גוף שאינו אדם פרטי — נייד אינו חובה', () => {
    const log = validDwellingLog({
      orderer: { name: 'ועד בית דוגמה', phone: '040000001', isPrivatePerson: false, role: 'יו״ר ועד' },
    });
    expect(validateForCompletion(log, NOW).ok).toBe(true);
  });
});

describe('דרישה 4 — שדות מקום לפי סוג המקום', () => {
  it('דירה: סוג מבנה "דירה" מחייב מספר דירה', () => {
    const log = validDwellingLog({
      location: {
        placeKind: 'dwelling',
        city: 'עיר הדוגמה',
        street: 'רחוב הדוגמה',
        houseNumber: '12',
        structureType: 'דירה בבניין',
      },
    });
    expect(problemAt(log, 'location.apartmentNumber')?.message).toContain('חובה כאשר סוג המבנה הוא דירה');
  });

  it('דירה: סוג מבנה שאינו דירה — מספר דירה אינו חובה', () => {
    const log = validDwellingLog({
      location: {
        placeKind: 'dwelling',
        city: 'עיר הדוגמה',
        street: 'רחוב הדוגמה',
        houseNumber: '12',
        structureType: 'בית פרטי',
      },
    });
    expect(validateForCompletion(log, NOW).ok).toBe(true);
  });

  it('שטח פתוח: נ״צ הוא חובה', () => {
    const log = validOpenAreaLog();
    delete (log.location as Record<string, unknown>).coordinates;
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('שטח פתוח: נ״צ מחוץ לתחום ישראל נדחה', () => {
    const log = validOpenAreaLog({
      location: {
        placeKind: 'open_area',
        localAuthorityName: 'רשות לדוגמה',
        siteType: 'גן ציבורי',
        siteDescription: 'תיאור לדוגמה של האתר',
        coordinates: { system: 'wgs84', latitude: 48.85, longitude: 2.35 },
      },
    });
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('ערפול: שם שכונה חובה', () => {
    const log = validFoggingLog();
    delete (log.location as Record<string, unknown>).neighborhoodName;
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });
});

describe('דרישה 5 — תאריך ושעה לפי זמן השרת', () => {
  it('תאריך ביצוע עתידי נדחה גם אם שעון המכשיר מוטה', () => {
    const log = validDwellingLog({
      execution: {
        performedDate: '2026-12-31',
        performedStartTime: '08:00',
        timeZone: 'Asia/Jerusalem',
      },
    });
    expect(problemAt(log, 'execution.performedDate')?.message).toContain('מועד עתידי');
  });

  it('שעת סיום לפני שעת תחילה נדחית', () => {
    const log = validDwellingLog({
      execution: {
        performedDate: '2026-09-10',
        performedStartTime: '10:00',
        performedEndTime: '09:00',
        timeZone: 'Asia/Jerusalem',
      },
    });
    expect(problemAt(log, 'execution.performedEndTime')?.message).toContain('לפני שעת התחילה');
  });
});

describe('דרישה 6 — ממצאי ניטור', () => {
  it('יומן בלי ממצאים נחסם', () => {
    const log = validDwellingLog({ monitoring: { findings: [] } });
    expect(problemAt(log, 'monitoring.findings')?.message).toContain('לפחות מזיק אחד');
  });

  it('רמת נגיעות שאינה מהרשימה נדחית', () => {
    const log = validDwellingLog();
    (log.monitoring!.findings[0] as Record<string, unknown>).infestationLevel = 'extreme';
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });
});

describe('דרישה 10 ו-11 — איוד וערפול', () => {
  it('איוד בלי תיעוד פעולות איטום נחסם', () => {
    const log = validDwellingLog({ treatmentKinds: ['fumigation'] });
    expect(problemAt(log, 'fumigation')?.message).toContain('פעולות האיטום');
  });

  it('איוד עם רשימת איטום ריקה נחסם', () => {
    const log = validFumigationLog({
      fumigation: { sealingActions: [], sealingCompletedAt: '2026-09-10T07:10:00.000Z' },
    });
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('ערפול בלי תיעוד התראה לציבור נחסם', () => {
    const log = validFoggingLog();
    delete log.fogging;
    expect(problemAt(log, 'fogging')?.message).toContain('התראה');
  });

  it('ערפול שבו לא ניתנה התראה מחייב ציון סיבה', () => {
    const log = validFoggingLog({ fogging: { publicWarningGiven: false } });
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('ערפול שבו ניתנה התראה מחייב אופן ומועד', () => {
    const log = validFoggingLog({ fogging: { publicWarningGiven: true } });
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('ערפול מחייב מקום מסוג ערפול', () => {
    const log = validFoggingLog({
      location: {
        placeKind: 'dwelling',
        city: 'עיר הדוגמה',
        street: 'רחוב הדוגמה',
        houseNumber: '12',
        structureType: 'בית פרטי',
      },
    });
    expect(problemAt(log, 'location.placeKind')?.message).toContain('ערפול');
  });
});

describe('דרישה 9 — מדביר מסייע', () => {
  it('סימון שעבד מדביר מסייע בלי פרטים נחסם', () => {
    const log = validDwellingLog({ hasAssistant: true, assistants: [] });
    expect(problemAt(log, 'assistants')?.message).toContain('פרטיו');
  });

  it('מדביר מסייע בלי חתימה נחסם', () => {
    const log = validLogWithAssistant();
    delete (log.assistants![0] as Record<string, unknown>).signature;
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('מדביר מסייע בלי תיעוד שניתנו הנחיות נחסם', () => {
    const log = validLogWithAssistant();
    (log.assistants![0] as Record<string, unknown>).instructionsGiven = false;
    expect(problemAt(log, 'assistants.0.instructionsGiven')?.message).toContain('הנחיות');
  });

  it('פרטי מדביר מסייע בלי סימון hasAssistant נחסם', () => {
    const log = validLogWithAssistant({ hasAssistant: false });
    expect(problemAt(log, 'hasAssistant')).toBeDefined();
  });
});

describe('דרישה 12 — תכשירים ויישום', () => {
  const numericFields = [
    'activeIngredientConcentrationPercent',
    'dosage',
    'mixtureQuantity',
    'basisAmount',
  ] as const;
  const textFields = [
    'productTradeName',
    'batchNumber',
    'activeIngredientName',
    'dosageUnit',
    'mixtureUnit',
    'basisUnit',
    'applicationMethod',
  ] as const;

  it('יומן בלי יישום תכשיר נחסם', () => {
    const log = validDwellingLog({ applications: [], preWarnings: { ...validDwellingLog().preWarnings!, coveredApplicationKeys: [] } });
    expect(problemAt(log, 'applications')?.message).toContain('לפחות יישום אחד');
  });

  for (const field of [...numericFields, ...textFields]) {
    it(`חסר ${field} חוסם השלמה`, () => {
      const log = validDwellingLog();
      delete (log.applications![0] as Record<string, unknown>)[field];
      expect(validateForCompletion(log, NOW).ok).toBe(false);
    });
  }

  it('תכשיר מוכן לשימוש: מותר לדלג על הריכוז במוכן לשימוש, והוא נגזר', () => {
    const log = validDwellingLog();
    const application = log.applications![0] as Record<string, unknown>;
    application.readyToUse = true;
    delete application.readyToUseConcentrationPercent;

    const result = validateForCompletion(log, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = result.data.applications[0]!;
    expect(parsed.readyToUseConcentrationPercent).toBe(parsed.activeIngredientConcentrationPercent);
    // הערך מסומן כנגזר, כדי שה-PDF יציין זאת במפורש.
    expect(parsed.readyToUseConcentrationDerived).toBe(true);
  });

  it('תכשיר שאינו מוכן לשימוש: חייב ריכוז במוכן לשימוש', () => {
    const log = validDwellingLog();
    const application = log.applications![0] as Record<string, unknown>;
    application.readyToUse = false;
    delete application.readyToUseConcentrationPercent;

    const problem = problemAt(log, 'applications.0.readyToUseConcentrationPercent');
    expect(problem?.message).toContain('רק בתכשיר מוכן לשימוש');
  });

  it('ריכוז מעל 100% נדחה', () => {
    const log = validDwellingLog();
    (log.applications![0] as Record<string, unknown>).activeIngredientConcentrationPercent = 150;
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('מינון שלילי נדחה', () => {
    const log = validDwellingLog();
    (log.applications![0] as Record<string, unknown>).dosage = -5;
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('מזיק שביישום ואינו בממצאי הניטור נחסם', () => {
    const log = validDwellingLog();
    (log.applications![0] as Record<string, unknown>).targetPestName = 'מזיק שלא נמצא';
    expect(problemAt(log, 'applications.0.targetPestName')?.message).toContain('אינו מופיע בממצאי הניטור');
  });

  it('תכשיר שרישומו בוטל חוסם השלמה', () => {
    const log = validDwellingLog();
    (log.applications![0] as Record<string, unknown>).productSnapshot = { registrationStatus: 'revoked' };
    expect(problemAt(log, 'applications.0.productTradeName')?.message).toContain('בוטל');
  });

  it('תכשיר שתוקפו פג חוסם השלמה', () => {
    const log = validDwellingLog();
    (log.applications![0] as Record<string, unknown>).productSnapshot = { registrationStatus: 'expired' };
    expect(problemAt(log, 'applications.0.productTradeName')?.message).toContain('תוקף פג');
  });
});

describe('דרישה 8 — אזהרות', () => {
  it('אזהרות בלי אישור מפורש של המדביר נחסמות', () => {
    const log = validDwellingLog();
    (log.preWarnings as Record<string, unknown>).acknowledgedByExterminator = false;
    expect(problemAt(log, 'preWarnings.acknowledgedByExterminator')?.message).toContain('לאשר במפורש');
  });

  it('כמה תכשירים והאזהרות מכסות רק חלק — נחסם', () => {
    const base = validDwellingLog();
    const second = { ...(base.applications![0] as Record<string, unknown>), key: 'app-2', batchNumber: 'B2' };
    const log = validDwellingLog({
      applications: [base.applications![0]!, second as never],
      monitoring: base.monitoring,
      preWarnings: { ...base.preWarnings!, coveredApplicationKeys: ['app-1'], strictestAppliedAcrossAll: false },
    });
    const problem = problemAt(log, 'preWarnings.coveredApplicationKeys');
    expect(problem?.message).toContain('אינן מתייחסות לכל התכשירים');
  });

  it('סימון ההנחיה המחמירה ביותר מכשיר את האזהרות לכל התכשירים', () => {
    const base = validDwellingLog();
    const second = { ...(base.applications![0] as Record<string, unknown>), key: 'app-2', batchNumber: 'B2' };
    const log = validDwellingLog({
      applications: [base.applications![0]!, second as never],
      preWarnings: { ...base.preWarnings!, coveredApplicationKeys: [], strictestAppliedAcrossAll: true },
    });
    expect(validateForCompletion(log, NOW).ok).toBe(true);
  });
});

describe('דרישה 13 — טיפול משלים', () => {
  it('נדרש טיפול משלים בלי תיאור נחסם', () => {
    const log = validDwellingLog();
    const post = log.postWarnings as Record<string, unknown>;
    post.followUpRequired = true;
    delete post.followUpDescription;
    expect(problemAt(log, 'postWarnings.followUpDescription')?.message).toContain('חובה כאשר נדרש טיפול משלים');
  });
});

describe('דרישה 14 ו-15 — מסירה וחתימות', () => {
  it('בלי אישור מסירה — נחסם', () => {
    const log = validDwellingLog();
    (log.handover as Record<string, unknown>).delivered = false;
    expect(problemAt(log, 'handover.delivered')?.message).toContain('נמסר או הושאר');
  });

  it('דרך מסירה "אחר" בלי פירוט — נחסם', () => {
    const log = validDwellingLog();
    (log.handover as Record<string, unknown>).method = 'other';
    expect(problemAt(log, 'handover.methodOther')).toBeDefined();
  });

  it('חתימה שלא אושרה במפורש נדחית', () => {
    const log = validDwellingLog();
    const signatures = log.signatures as Record<string, Record<string, unknown>>;
    signatures.exterminator!.confirmed = false;
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('חתימה בלי תמונה נדחית', () => {
    const log = validDwellingLog();
    const signatures = log.signatures as Record<string, Record<string, unknown>>;
    delete signatures.exterminator!.dataUrl;
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });

  it('שם החותם על הקבלה חייב להתאים לשם מקבל היומן', () => {
    const log = validDwellingLog();
    const signatures = log.signatures as Record<string, Record<string, unknown>>;
    signatures.recipient!.signerName = 'שם אחר';
    expect(problemAt(log, 'signatures.recipient.signerName')?.message).toContain('שונה משם האדם');
  });

  it('חתימת מקבל חסרה נחסמת', () => {
    const log = validDwellingLog();
    delete (log.signatures as Record<string, unknown>).recipient;
    expect(validateForCompletion(log, NOW).ok).toBe(false);
  });
});

describe('ולידציה של פורמטים', () => {
  it.each([
    ['0501234567', true],
    ['+972501234567', true],
    ['050-123-4567', true],
    ['03-1234567', false],
    ['12345', false],
  ])('נייד %s תקין=%s', (value, valid) => {
    const log = validDwellingLog();
    (log.exterminator as Record<string, unknown>).mobile = value;
    expect(validateForCompletion(log, NOW).ok).toBe(valid);
  });

  it.each([
    ['name@example.test', true],
    ['not-an-email', false],
    ['a@b', false],
  ])('דוא״ל %s תקין=%s', (value, valid) => {
    const log = validDwellingLog();
    (log.exterminator as Record<string, unknown>).email = value;
    expect(validateForCompletion(log, NOW).ok).toBe(valid);
  });

  it.each([
    ['2026-09-10', true],
    ['2026-02-30', false],
    ['10/09/2026', false],
  ])('תאריך %s תקין=%s', (value, valid) => {
    const log = validDwellingLog();
    (log.execution as Record<string, unknown>).performedDate = value;
    expect(validateForCompletion(log, NOW).ok).toBe(valid);
  });

  it.each([
    ['08:00', true],
    ['25:00', false],
    ['8:00', false],
  ])('שעה %s תקינה=%s', (value, valid) => {
    const log = validDwellingLog();
    (log.execution as Record<string, unknown>).performedStartTime = value;
    expect(validateForCompletion(log, NOW).ok).toBe(valid);
  });
});

describe('מיפוי שדות לשלבים ולסעיפים', () => {
  it.each([
    ['exterminator.fullName', 1, 1],
    ['orderer.mobile', 1, 3],
    ['location.neighborhoodName', 2, 4],
    ['execution.performedDate', 2, 5],
    ['monitoring.findings.3.pestName', 3, 6],
    ['prevention.actions.0.status', 4, 7],
    ['applications.2.batchNumber', 4, 12],
    ['fumigation.sealingActions.1.description', 4, 10],
    ['fogging.publicWarningGiven', 4, 11],
    ['preWarnings.reEntryHours', 5, 8],
    ['postWarnings.afterTreatmentInfo', 5, 13],
    ['assistants.0.licenseNumber', 6, 9],
    ['handover.recipientName', 6, 14],
    ['signatures.exterminator', 6, 15],
  ])('%s → שלב %i, סעיף %i', (path, step, requirement) => {
    const meta = lookupField(path);
    expect(meta.step).toBe(step);
    expect(meta.requirement).toBe(requirement);
  });
});
