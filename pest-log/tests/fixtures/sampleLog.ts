import type { PestLogContentInput } from '@/schema/pestLog';

/**
 * יומן דוגמה תקין — משמש את בדיקות הסכימה, בדיקות האינטגרציה והפקת PDF לדוגמה.
 * ⚠ כל הפרטים בדיוניים. אין להשתמש בפרטי לקוחות אמיתיים בבדיקות.
 */

const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function signature(name: string, at = '2026-09-10T09:30:00.000Z') {
  return { dataUrl: SIGNATURE_PNG, signedAt: at, signerName: name, confirmed: true as const };
}

/** יומן מלא לדירה — המקרה הנפוץ. */
export function validDwellingLog(overrides: Partial<PestLogContentInput> = {}): PestLogContentInput {
  return {
    treatmentKinds: ['standard'],
    exterminator: {
      fullName: 'מדביר דוגמה א׳',
      licenseType: 'הדברה תברואית',
      licenseNumber: 'DEMO-0001',
      mobile: '0500000001',
      email: 'exterminator-a@example.test',
      address: 'רחוב הדוגמה 1, עיר הדוגמה',
    },
    operator: { hasOperator: false },
    orderer: {
      name: 'מזמין דוגמה',
      phone: '0500000011',
      isPrivatePerson: true,
      mobile: '0500000011',
      role: 'בעל הדירה',
    },
    location: {
      placeKind: 'dwelling',
      city: 'עיר הדוגמה',
      street: 'רחוב הדוגמה',
      houseNumber: '12',
      apartmentNumber: '3',
      structureType: 'דירה בבניין',
    },
    execution: {
      performedDate: '2026-09-10',
      performedStartTime: '08:00',
      performedEndTime: '09:30',
      timeZone: 'Asia/Jerusalem',
    },
    monitoring: {
      findings: [
        {
          pestName: 'מזיק דוגמה 1',
          identificationActions: 'בדיקה חזותית של המטבח, פריסת מלכודות דבק ל-48 שעות ובדיקה חוזרת.',
          developmentStage: 'בוגרים ונימפות',
          infestationSigns: 'הפרשות מתחת לכיור, שרידי עורות נשל מאחורי המקרר.',
          findingLocation: 'מטבח — מתחת לכיור ומאחורי המקרר',
          infestationLevel: 'medium',
        },
      ],
    },
    prevention: {
      actions: [
        { description: 'איטום סדקים סביב צנרת המטבח', status: 'performed' },
        { description: 'הסדרת פינוי אשפה יומי', status: 'recommended' },
      ],
      circumstancesForChoosingPestControl:
        'פעולות המניעה וההיגיינה בוצעו אך הנגיעות נמשכה, ונמצאו בוגרים פעילים באזור הכנת מזון. לפיכך הוחלט על ביצוע הדברה.',
    },
    preWarnings: {
      treatmentNatureDescription: 'ריסוס נקודתי של סדקים וחריצים באזור המטבח, בהתאם לתווית התכשיר.',
      risksToHumans: 'עלול לגרום לגירוי בעור, בעיניים ובדרכי הנשימה. אין לשהות באזור בזמן הריסוס.',
      risksToAnimals: 'רעיל לדגים ולחיות מחמד. יש להרחיק אקווריומים וחיות מחמד מהאזור המטופל.',
      reEntryHours: 4,
      additionalLabelInstructions: 'לאוורר את המקום 30 דקות לפני הכניסה. לשטוף משטחי מזון לפני שימוש.',
      coveredApplicationKeys: ['app-1'],
      strictestAppliedAcrossAll: false,
      acknowledgedByExterminator: true,
      acknowledgedAt: '2026-09-10T07:50:00.000Z',
      labelReference: 'תווית תכשיר דוגמה — מהדורה 2026',
    },
    assistants: [],
    hasAssistant: false,
    applications: [
      {
        key: 'app-1',
        targetPestName: 'מזיק דוגמה 1',
        productTradeName: 'תכשיר דוגמה ריכוז',
        batchNumber: 'BATCH-DEMO-01',
        activeIngredientName: 'חומר פעיל לדוגמה A',
        activeIngredientConcentrationPercent: 10,
        dosage: 25,
        dosageUnit: 'מ״ל/ליטר',
        mixtureKind: 'solution',
        mixtureQuantity: 5,
        mixtureUnit: 'ליטר',
        quantityBasis: 'area',
        basisAmount: 85,
        basisUnit: 'מ״ר',
        readyToUse: false,
        readyToUseConcentrationPercent: 0.25,
        readyToUseConcentrationDerived: false,
        applicationMethod: 'ריסוס נקודתי',
      },
    ],
    postWarnings: {
      duringTreatmentInfo: 'אין להיכנס לאזור המטופל במהלך הריסוס. הדלתות והחלונות נותרו סגורים.',
      afterTreatmentInfo: 'לאוורר 30 דקות, לנגב משטחי מזון, ולהימנע משטיפת רצפה 48 שעות.',
      followUpRequired: true,
      followUpDescription: 'ביקורת חוזרת ובדיקת מלכודות בעוד שבועיים.',
      followUpTargetDate: '2026-09-24',
      acknowledgedByExterminator: true,
      acknowledgedAt: '2026-09-10T09:35:00.000Z',
    },
    handover: {
      delivered: true,
      method: 'handed_in_person',
      recipientName: 'מקבל דוגמה',
      recipientRole: 'בעל הדירה',
      deliveredAt: '2026-09-10T09:40:00.000Z',
    },
    signatures: {
      exterminator: signature('מדביר דוגמה א׳'),
      recipient: signature('מקבל דוגמה', '2026-09-10T09:40:00.000Z'),
    },
    baitStations: [],
    attachments: [],
    ...overrides,
  } as PestLogContentInput;
}

/** יומן בשטח פתוח — מחייב רשות מקומית, סוג אתר, תיאור ונ״צ. */
export function validOpenAreaLog(overrides: Partial<PestLogContentInput> = {}): PestLogContentInput {
  return validDwellingLog({
    location: {
      placeKind: 'open_area',
      localAuthorityName: 'רשות מקומית לדוגמה',
      siteType: 'גן ציבורי',
      siteDescription: 'גן ציבורי עם מתקני משחק, פחי אשפה בהיקף וערוץ ניקוז בצד הצפוני.',
      coordinates: { system: 'wgs84', latitude: 32.0853, longitude: 34.7818 },
    },
    ...overrides,
  });
}

/** יומן ערפול — מחייב שם שכונה ותיעוד התראה לציבור. */
export function validFoggingLog(overrides: Partial<PestLogContentInput> = {}): PestLogContentInput {
  return validDwellingLog({
    treatmentKinds: ['fogging'],
    location: {
      placeKind: 'fogging_area',
      neighborhoodName: 'שכונת הדוגמה',
      city: 'עיר הדוגמה',
      localAuthorityName: 'רשות מקומית לדוגמה',
      areaDescription: 'שטחים ציבוריים פתוחים בשכונה, כולל שדרה מרכזית וערוץ ניקוז.',
      coordinates: { system: 'wgs84', latitude: 32.09, longitude: 34.79 },
    },
    fogging: {
      publicWarningGiven: true,
      publicWarningMethod: 'הודעה בלוחות המודעות בשכונה ובאתר הרשות המקומית, 48 שעות מראש.',
      publicWarningAt: '2026-09-08T10:00:00.000Z',
    },
    applications: [
      {
        key: 'app-1',
        targetPestName: 'מזיק דוגמה 1',
        productTradeName: 'תכשיר דוגמה ריכוז',
        batchNumber: 'BATCH-DEMO-02',
        activeIngredientName: 'חומר פעיל לדוגמה A',
        activeIngredientConcentrationPercent: 10,
        dosage: 1.5,
        dosageUnit: 'ליטר/דונם',
        mixtureKind: 'mixture',
        mixtureQuantity: 30,
        mixtureUnit: 'ליטר',
        quantityBasis: 'area',
        basisAmount: 20,
        basisUnit: 'דונם',
        readyToUse: false,
        readyToUseConcentrationPercent: 0.5,
        readyToUseConcentrationDerived: false,
        applicationMethod: 'ערפול קר',
      },
    ],
    ...overrides,
  });
}

/** יומן איוד — מחייב תיעוד פעולות האיטום שבוצעו לפני האיוד. */
export function validFumigationLog(overrides: Partial<PestLogContentInput> = {}): PestLogContentInput {
  return validDwellingLog({
    treatmentKinds: ['fumigation'],
    fumigation: {
      sealingActions: [
        {
          description: 'איטום פתחי אוורור ביריעות פוליאתילן וסרט איטום',
          locationDescription: 'מחסן — קיר צפוני',
          performedAt: '2026-09-10T06:30:00.000Z',
          materialUsed: 'יריעת פוליאתילן 200 מיקרון',
        },
        {
          description: 'איטום מלבני דלתות',
          locationDescription: 'מחסן — דלת כניסה',
          performedAt: '2026-09-10T06:50:00.000Z',
        },
      ],
      sealingCompletedAt: '2026-09-10T07:10:00.000Z',
    },
    ...overrides,
  });
}

/** יומן עם מדביר מסייע — מחייב פרטים מלאים, הנחיות וחתימה. */
export function validLogWithAssistant(overrides: Partial<PestLogContentInput> = {}): PestLogContentInput {
  return validDwellingLog({
    hasAssistant: true,
    assistants: [
      {
        fullName: 'מדביר מסייע דוגמה',
        licenseType: 'הדברה תברואית',
        licenseNumber: 'DEMO-0009',
        phone: '0500000009',
        email: 'assistant@example.test',
        address: 'רחוב הדוגמה 9, עיר הדוגמה',
        instructionsGiven: true,
        instructionsDetails: 'הונחה על ציוד המגן, אזורי היישום והמינון המותר.',
        receivedLogCopy: true,
        receivedLogCopyAt: '2026-09-10T09:45:00.000Z',
        signature: signature('מדביר מסייע דוגמה', '2026-09-10T09:45:00.000Z'),
      },
    ],
    ...overrides,
  });
}
