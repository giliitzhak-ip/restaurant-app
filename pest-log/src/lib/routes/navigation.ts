/**
 * קישורי ניווט, חיוג ו-WhatsApp לתחנה במסלול.
 *
 * הכלל: לא מייצרים קישור שבור. אם אין נקודת ציון — משתמשים בכתובת.
 * אם גם הכתובת חסרה — מחזירים שגיאה ברורה, והמסך מציג אותה במקום כפתור.
 */

export interface NavigationTarget {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
}

export interface NavigationLinks {
  waze: string;
  googleMaps: string;
  appleMaps: string;
  /** האם הקישורים נבנו מנקודת ציון מדויקת ולא מכתובת בלבד. */
  precise: boolean;
}

export type NavigationResult =
  | { ok: true; links: NavigationLinks }
  | { ok: false; error: string };

function hasCoordinates(target: NavigationTarget): target is NavigationTarget & {
  latitude: number;
  longitude: number;
} {
  return (
    typeof target.latitude === 'number' &&
    Number.isFinite(target.latitude) &&
    Math.abs(target.latitude) <= 90 &&
    typeof target.longitude === 'number' &&
    Number.isFinite(target.longitude) &&
    Math.abs(target.longitude) <= 180
  );
}

export function buildNavigationLinks(target: NavigationTarget): NavigationResult {
  if (hasCoordinates(target)) {
    const { latitude, longitude } = target;
    return {
      ok: true,
      links: {
        waze: `https://waze.com/ul?ll=${latitude}%2C${longitude}&navigate=yes`,
        googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${latitude}%2C${longitude}&travelmode=driving`,
        appleMaps: `https://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d`,
        precise: true,
      },
    };
  }

  const address = target.address?.trim();
  if (address) {
    const encoded = encodeURIComponent(address);
    return {
      ok: true,
      links: {
        waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
        googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`,
        appleMaps: `https://maps.apple.com/?daddr=${encoded}&dirflg=d`,
        precise: false,
      },
    };
  }

  return { ok: false, error: 'אין לתחנה כתובת ואין נקודת ציון. יש להשלים את פרטי האתר לפני ניווט.' };
}

/** Apple Maps מוצע רק במכשירי Apple, שבהם הוא ברירת המחדל. */
export function isAppleDevice(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Macintosh/i.test(userAgent);
}

/** מנרמל מספר ישראלי לפורמט בין-לאומי ללא תווי עזר. */
export function normalizeIsraeliMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (/^\+972\d{8,9}$/.test(digits)) return digits.slice(1);
  if (/^972\d{8,9}$/.test(digits)) return digits;
  if (/^0\d{8,9}$/.test(digits)) return `972${digits.slice(1)}`;
  return null;
}

export function telLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}

/** WhatsApp רק למספר נייד תקין — אחרת הכפתור לא מוצג כלל. */
export function whatsappLink(mobile: string | null | undefined, message?: string): string | null {
  const msisdn = normalizeIsraeliMsisdn(mobile);
  if (!msisdn || !/^972(5\d)\d{7}$/.test(msisdn)) return null;
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${msisdn}${query}`;
}
