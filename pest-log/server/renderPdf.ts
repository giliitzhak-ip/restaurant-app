import { chromium, type Browser } from 'playwright';
import QRCode from 'qrcode';
import { buildPdfHtml, escapeHtml, type PdfRenderInput } from './pdfTemplate';
import { POISON_CENTER_NOTICE } from '../src/schema/enums';

/**
 * הפקת ה-PDF.
 *
 * Chromium מדפיס את ה-HTML ל-PDF וקטורי: הטקסט העברי אמיתי וניתן לחיפוש,
 * הכיווניות והשבירה נכונות, וכותרות הטבלאות חוזרות בכל עמוד.
 * זה לא צילום מסך — אין כאן html2canvas.
 */

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  // בסביבות שבהן Chromium כבר מותקן (קונטיינר, שרת פריסה) מצביעים אליו
  // במקום להוריד עותק נוסף. אם המשתנה ריק — Playwright משתמש בדפדפן שלו.
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
  browserPromise ??= chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close();
}

export async function buildVerificationQr(url: string): Promise<string> {
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
}

export interface RenderOptions {
  /** מוצג בתחתית כל עמוד יחד עם מספור העמודים. */
  footerSerial: string | number;
}

export async function renderPestLogPdf(
  input: PdfRenderInput,
  options: RenderOptions,
): Promise<Uint8Array> {
  const html = buildPdfHtml(input);
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });
    // ממתינים לטעינת הפונט המוטבע לפני ההדפסה, אחרת העברית עלולה
    // להיות מוחלפת בפונט חלופי.
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: 'print' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: '16mm', bottom: '18mm', right: '12mm', left: '12mm' },
      headerTemplate: '<div></div>',
      // הערת המרכז להרעלות ומספור העמודים חוזרים בכל עמוד (דרישה 16).
      footerTemplate: `
        <div style="direction:rtl; width:100%; font-size:7.5pt; font-family: sans-serif;
                    padding:0 12mm; color:#8a0f0f; display:flex; justify-content:space-between;">
          <span>${escapeHtml(POISON_CENTER_NOTICE)}</span>
          <span style="color:#444">יומן מס׳ ${escapeHtml(String(options.footerSerial))} · עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span>
        </div>`,
    });
    // page.pdf מחזיר Buffer של Node. מנרמלים ל-Uint8Array "נקי" כדי
    // שהטיפוס המוחזר יהיה מדויק ושספריות שמסרבות ל-Buffer יעבדו.
    return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength).slice();
  } finally {
    await page.close();
    await context.close();
  }
}
