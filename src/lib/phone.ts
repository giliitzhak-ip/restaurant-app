/**
 * נרמול מספרי טלפון ישראליים.
 *
 * קישור WhatsApp דורש מספר בפורמט בינלאומי ללא סימנים. מספר שנשמר
 * כ-"050-1234567" הופך ל-"972501234567". מספר שאינו נראה תקין אינו
 * מומצא: הפונקציה מחזירה null, והממשק אינו מציג כפתור שיוביל לשגיאה.
 */

const IL = '972';

/** ספרות בלבד, כולל טיפול בקידומת בינלאומית. */
function digits(raw: string): string {
  return String(raw ?? '').replace(/[^\d+]/g, '');
}

export interface NormalizedPhone {
  /** מספר בינלאומי ללא סימנים, לשימוש בקישורים. null כשאינו תקין. */
  e164: string | null;
  /** המספר כפי שהוזן, לתצוגה. */
  entered: string;
  /** נימוק בעברית כשהמספר נדחה. */
  reason?: string;
}

/**
 * מקבל מספר ישראלי בכל צורה נפוצה ומחזיר אותו בפורמט בינלאומי.
 *
 * נתמכים: 05X-XXXXXXX, 0X-XXXXXXX, 972..., +972..., 00972...
 * מספר באורך לא סביב, או מספר שאינו מתחיל בקידומת ישראלית מוכרת,
 * מוחזר כלא תקין.
 */
export function normalizeIsraeliPhone(raw: string): NormalizedPhone {
  const entered = String(raw ?? '').trim();
  let d = digits(entered);

  if (!d) return { e164: null, entered, reason: 'לא הוזן מספר טלפון.' };

  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);

  if (d.startsWith(IL)) {
    d = d.slice(IL.length);
    // 972-0-50... קורה כשמדביקים מספר עם אפס אחרי הקידומת
    if (d.startsWith('0')) d = d.slice(1);
  } else if (d.startsWith('0')) {
    d = d.slice(1);
  } else {
    return { e164: null, entered, reason: 'המספר אינו נראה מספר ישראלי.' };
  }

  /* אחרי הסרת האפס או הקידומת נשארות 8 ספרות בקווי (למשל 3-1234567
     הוא 7 ספרות אחרי הקידומת) ועד 9 בנייד. הטווח הסביר הוא 8–9. */
  if (d.length < 8 || d.length > 9) {
    return { e164: null, entered, reason: 'אורך המספר אינו תקין.' };
  }

  return { e164: `${IL}${d}`, entered };
}

/** קישור WhatsApp, או null כשאין מספר תקין לשלוח אליו. */
export function whatsappLink(phone: string | undefined, text: string): string | null {
  const { e164 } = normalizeIsraeliPhone(phone ?? '');
  if (!e164) return null;
  return `https://wa.me/${e164}?text=${encodeURIComponent(text)}`;
}

/** תצוגה מקומית נוחה לקריאה: 050-1234567. */
export function formatIsraeliPhone(raw: string): string {
  const { e164 } = normalizeIsraeliPhone(raw);
  if (!e164) return String(raw ?? '').trim();
  const local = `0${e164.slice(IL.length)}`;
  return local.length === 10
    ? `${local.slice(0, 3)}-${local.slice(3)}`
    : `${local.slice(0, 2)}-${local.slice(2)}`;
}
