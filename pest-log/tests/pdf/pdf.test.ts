import { afterAll, describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { validateForCompletion } from '@/schema/pestLog';
import { buildPdfHtml, escapeHtml } from '../../server/pdfTemplate';
import { buildVerificationQr, closeBrowser, renderPestLogPdf } from '../../server/renderPdf';
import { validFumigationLog, validLogWithAssistant } from '../fixtures/sampleLog';

/**
 * בדיקת ה-PDF העברי.
 *
 * מה נבדק: שה-PDF נוצר, שהוא רב-עמודי, ושהטקסט העברי שבו אמיתי וניתן
 * לחיפוש (ולא תמונה). זו הבדיקה שמבדילה בין הפקה תקינה לבין html2canvas.
 */

const NOW = { serverNow: new Date('2026-09-12T00:00:00Z') };

/** יומן ארוך, כדי לאלץ שבירת עמודים וכותרות טבלה חוזרות. */
function longSnapshot(): Record<string, unknown> {
  const base = validLogWithAssistant({
    treatmentKinds: ['standard', 'fumigation'],
    fumigation: validFumigationLog().fumigation,
  });

  const findings = Array.from({ length: 16 }, (_, index) => ({
    pestName: `מזיק דוגמה ${(index % 2) + 1}`,
    identificationActions: `בדיקה חזותית ופריסת מלכודות ניטור באזור ${index + 1}, כולל בדיקת נקודות כניסה וצנרת.`,
    developmentStage: index % 2 === 0 ? 'בוגרים' : 'נימפות ובוגרים',
    infestationSigns: `סימני נגיעות באזור ${index + 1}: הפרשות, שרידי מזון ונזק לאריזות.`,
    findingLocation: `אזור ${index + 1} — מטבח / מחסן`,
    infestationLevel: (['low', 'medium', 'high'] as const)[index % 3]!,
  }));

  const applications = Array.from({ length: 10 }, (_, index) => ({
    ...base.applications![0]!,
    key: `app-${index + 1}`,
    batchNumber: `BATCH-DEMO-${String(index + 1).padStart(2, '0')}`,
  }));

  const content = {
    ...base,
    monitoring: { findings },
    applications,
    preWarnings: { ...base.preWarnings!, coveredApplicationKeys: [], strictestAppliedAcrossAll: true },
  };

  const result = validateForCompletion(content, NOW);
  if (!result.ok) throw new Error(`יומן הבדיקה אינו תקין: ${JSON.stringify(result.problems)}`);

  return {
    ...(result.data as unknown as Record<string, unknown>),
    meta: {
      serialNumber: 77,
      documentVersion: 1,
      completedAt: '2026-09-12T06:00:00.000Z',
      organizationName: 'יצחק אחזקות והדברות',
      poisonCenterPhone: '04-7771900',
    },
  };
}

/** מחלץ את כל הטקסט מה-PDF, מנורמל לרווח בודד. */
async function extractText(pdf: Uint8Array): Promise<{ text: string; pages: number }> {
  // pdfjs מנתק (detach) את ה-ArrayBuffer שהוא מקבל, ולכן מועבר לו עותק
  // והמקור נשאר שמיש לבדיקות הבאות.
  const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }).promise;
  let text = '';
  for (let page = 1; page <= doc.numPages; page += 1) {
    const content = await (await doc.getPage(page)).getTextContent();
    text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`;
  }
  // הטקסט ב-PDF מפוצל לריצות; נרמול רווחים מאפשר לחפש ביטויים שלמים.
  return { text: text.replace(/\s+/g, ' '), pages: doc.numPages };
}

let cached: { pdf: Uint8Array; text: string; pages: number } | null = null;

async function renderOnce() {
  if (cached) return cached;
  const snapshot = longSnapshot();
  const pdf = await renderPestLogPdf(
    {
      snapshot,
      signatureImages: {},
      verificationQr: await buildVerificationQr('https://example.test/verify?log=demo&h=abcdef0123456789'),
      verificationId: '77-v1-abcdef0123456789',
      deliveryNote: undefined,
    },
    { footerSerial: 77 },
  );
  const { text, pages } = await extractText(pdf);
  cached = { pdf, text, pages };
  return cached;
}

afterAll(async () => {
  await closeBrowser();
});

describe('הפקת PDF עברי', () => {
  it('נוצר קובץ PDF תקין', async () => {
    const { pdf } = await renderOnce();
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(20_000);
  }, 120_000);

  it('המסמך פרוס על כמה עמודים', async () => {
    const { pages } = await renderOnce();
    expect(pages).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it('הטקסט העברי אמיתי וניתן לחיפוש (לא תמונה)', async () => {
    const { text } = await renderOnce();
    const hebrewChars = text.match(/[֐-׿]/g) ?? [];
    // html2canvas היה מייצר תמונה — ואז לא היה כאן טקסט כלל.
    expect(hebrewChars.length).toBeGreaterThan(2000);
  }, 120_000);

  it.each([
    'יומן ביצוע הדברה',
    'מספר סידורי',
    'פרטי המדביר',
    'פרטי מזמין ההדברה',
    'מקום ההדברה',
    'ממצאי ניטור',
    'פעולות מניעה וטיפול',
    'אזהרות ומידע לפני ההדברה',
    'מדביר מסייע',
    'תכשירים ויישום',
    'מסירת היומן למזמין ההדברה',
    'חתימות',
    'מזהה אימות לעותק זה',
  ])('הכותרת "%s" מופיעה במסמך', async (heading) => {
    const { text } = await renderOnce();
    expect(text).toContain(heading);
  }, 120_000);

  it('כל שדות דרישה 12 מופיעים בטבלת התכשירים', async () => {
    const { text } = await renderOnce();
    for (const header of [
      'שם מסחרי',
      'אצווה',
      'חומר פעיל',
      'ריכוז בתכשיר',
      'מינון',
      'יחידה',
      'כמות',
      'בסיס',
      'ריכוז במוכן לשימוש',
      'שיטת היישום',
    ]) {
      expect(text).toContain(header);
    }
  }, 120_000);

  it('הודעת המרכז להרעלות מופיעה בכל עמוד', async () => {
    const { pdf, pages } = await renderOnce();
    const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }).promise;
    for (let page = 1; page <= pages; page += 1) {
      const content = await (await doc.getPage(page)).getTextContent();
      const pageText = content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ');
      // המספר נמצא בכותרת התחתונה החוזרת.
      expect(pageText).toContain('7771900');
    }
  }, 120_000);

  it('מספור העמודים מופיע בכותרת התחתונה', async () => {
    const { text, pages } = await renderOnce();
    // חילוץ טקסט מ-PDF מחזיר ריצות טקסט בסדר הויזואלי, ולכן המילים
    // "עמוד" ו-"מתוך" מופיעות בסדר הפוך לטקסט המקורי. נבדק הקיום.
    expect(text).toContain('עמוד');
    expect(text).toContain('מתוך');
    expect(text).toMatch(new RegExp(`\\d+\\s*מתוך\\s*${pages}`));
  }, 120_000);

  it('ריכוז שנגזר בתכשיר מוכן לשימוש מסומן במפורש', async () => {
    const base = validLogWithAssistant();
    const application = { ...base.applications![0]!, readyToUse: true };
    delete (application as Record<string, unknown>).readyToUseConcentrationPercent;

    const validated = validateForCompletion({ ...base, applications: [application] }, NOW);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const html = buildPdfHtml({
      snapshot: { ...(validated.data as unknown as Record<string, unknown>), meta: { serialNumber: 1 } },
      signatureImages: {},
      verificationQr: 'data:image/png;base64,',
      verificationId: 'x',
      deliveryNote: undefined,
    });
    expect(html).toContain('תכשיר מוכן לשימוש — זהה לריכוז בתכשיר');
  });

  it('התבנית מגדירה A4, RTL וכותרות טבלה חוזרות', () => {
    const html = buildPdfHtml({
      snapshot: { meta: { serialNumber: 1 } },
      signatureImages: {},
      verificationQr: 'data:image/png;base64,',
      verificationId: 'x',
      deliveryNote: undefined,
    });
    expect(html).toContain('size: A4');
    expect(html).toContain('direction: rtl');
    expect(html).toContain('dir="rtl"');
    // thead כ-table-header-group הוא מה שגורם לכותרות לחזור בכל עמוד.
    expect(html).toContain('display: table-header-group');
    // הפונט העברי מוטבע ואינו תלוי בפונטים של מערכת ההפעלה.
    expect(html).toContain("font-family: 'Heebo'");
    expect(html).toContain('data:font/woff2;base64,');
  });
});

describe('בריחה מ-HTML בתבנית ה-PDF', () => {
  it('תגיות בקלט משתמש אינן מוזרקות למסמך', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('a"b\'c&d')).toBe('a&quot;b&#39;c&amp;d');
  });

  it('שם מזמין עם תגית נשמר כטקסט', () => {
    const html = buildPdfHtml({
      snapshot: { meta: { serialNumber: 1 }, orderer: { name: '<img src=x onerror=alert(1)>' } },
      signatureImages: {},
      verificationQr: 'data:image/png;base64,',
      verificationId: 'x',
      deliveryNote: undefined,
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
