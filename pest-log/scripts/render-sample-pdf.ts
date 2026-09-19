/**
 * מפיק PDF לדוגמה מיומן בדיקה — בלי Supabase ובלי רשת.
 * שימוש: npx tsx scripts/render-sample-pdf.ts [out.pdf]
 *
 * נועד לבדיקה ויזואלית של ה-PDF העברי (RTL, שבירת עמודים, כותרות חוזרות).
 */
import { writeFileSync } from 'node:fs';
import { validateForCompletion } from '../src/schema/pestLog';
import { validLogWithAssistant, validFumigationLog } from '../tests/fixtures/sampleLog';
import { buildVerificationQr, closeBrowser, renderPestLogPdf } from '../server/renderPdf';

const outPath = process.argv[2] ?? 'sample-log.pdf';

const base = validLogWithAssistant({
  treatmentKinds: ['standard', 'fumigation'],
  fumigation: validFumigationLog().fumigation,
  generalNotes: 'יומן דוגמה שנוצר לבדיקה ויזואלית. כל הפרטים בדיוניים.',
});

// הרבה ממצאים ויישומים כדי לבדוק שבירת עמודים וכותרות טבלה חוזרות.
const findings = Array.from({ length: 14 }, (_, i) => ({
  pestName: `מזיק דוגמה ${(i % 2) + 1}`,
  identificationActions: `בדיקה חזותית ופריסת מלכודות באזור ${i + 1}. נבדקו נקודות כניסה, צנרת ומוקדי לחות.`,
  developmentStage: i % 2 === 0 ? 'בוגרים' : 'נימפות ובוגרים',
  infestationSigns: `סימני נגיעות באזור ${i + 1}: הפרשות, שרידי מזון ונזק פיזי לאריזות.`,
  findingLocation: `אזור ${i + 1} — מטבח / מחסן`,
  infestationLevel: (['low', 'medium', 'high'] as const)[i % 3]!,
}));

const applications = Array.from({ length: 9 }, (_, i) => ({
  ...base.applications![0]!,
  key: `app-${i + 1}`,
  batchNumber: `BATCH-DEMO-${String(i + 1).padStart(2, '0')}`,
  readyToUse: i % 3 === 0,
  readyToUseConcentrationPercent: i % 3 === 0 ? undefined : 0.25,
}));

const content = {
  ...base,
  monitoring: { findings },
  applications,
  preWarnings: {
    ...base.preWarnings!,
    coveredApplicationKeys: [],
    strictestAppliedAcrossAll: true,
  },
  baitStations: Array.from({ length: 6 }, (_, i) => ({
    stationNumber: `T-${i + 1}`,
    locationDescription: `תחנה ${i + 1} — היקף המבנה`,
    status: (['intact', 'consumed', 'replaced'] as const)[i % 3]!,
    consumptionLevel: (['none', 'partial', 'full'] as const)[i % 3]!,
    productTradeName: 'תכשיר דוגמה מוכן לשימוש',
  })),
};

const validation = validateForCompletion(content, { serverNow: new Date('2026-09-11T00:00:00Z') });
if (!validation.ok) {
  console.error('יומן הדוגמה לא עבר ולידציה:');
  for (const problem of validation.problems) {
    console.error(` • [שלב ${problem.step}] ${problem.label}: ${problem.message}`);
  }
  process.exit(1);
}

const snapshot = {
  ...(validation.data as unknown as Record<string, unknown>),
  meta: {
    serialNumber: 128,
    documentVersion: 2,
    completedAt: '2026-09-11T06:00:00.000Z',
    organizationName: 'יצחק אחזקות והדברות',
    correctionReason: 'תוקן מספר האצווה של התכשיר לאחר בדיקה חוזרת של האריזה.',
    correctsLogId: '00000000-0000-4000-8000-0000000000ff',
  },
};

const pdf = await renderPestLogPdf(
  {
    snapshot,
    signatureImages: {},
    verificationQr: await buildVerificationQr('https://example.test/verify?log=demo&h=abcdef0123456789'),
    verificationId: '128-v2-abcdef0123456789',
    deliveryNote: undefined,
  },
  { footerSerial: 128 },
);

writeFileSync(outPath, pdf);
await closeBrowser();
console.info(`✓ נכתב ${outPath} (${(pdf.byteLength / 1024).toFixed(0)}KB)`);
