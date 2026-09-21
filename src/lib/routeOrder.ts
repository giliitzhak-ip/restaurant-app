/**
 * סדר מומלץ לתחנות מסלול לפי כתובות.
 *
 * אין שירות מיפוי במכשיר, ולכן ההמלצה מבוססת על קרבה טקסטואלית של הכתובת:
 * תחילה קיבוץ לפי עיר, ואז לפי שם הרחוב, ובתוך אותו רחוב לפי מספר הבית.
 * זו המלצה בלבד – המדביר תמיד יכול לשנות את הסדר ידנית.
 */

import { normalize } from './search';

export interface AddressedStop {
  id: string;
  address: string;
}

/** מחלץ עיר, רחוב ומספר בית מתוך כתובת חופשית בעברית. */
export function parseAddress(address: string): { city: string; street: string; number: number } {
  const clean = (address ?? '').trim();
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  const city = normalize(parts.length > 1 ? parts[parts.length - 1] : '');
  const streetPart = parts[0] ?? '';
  const numberMatch = streetPart.match(/(\d+)/);
  const street = normalize(streetPart.replace(/\d+/g, ''));
  return { city, street, number: numberMatch ? Number(numberMatch[1]) : 0 };
}

/** מחזיר את מזהי התחנות בסדר המומלץ. */
export function suggestedOrder(stops: AddressedStop[]): string[] {
  return [...stops]
    .sort((a, b) => {
      const pa = parseAddress(a.address);
      const pb = parseAddress(b.address);
      if (pa.city !== pb.city) return pa.city.localeCompare(pb.city, 'he');
      if (pa.street !== pb.street) return pa.street.localeCompare(pb.street, 'he');
      return pa.number - pb.number;
    })
    .map((s) => s.id);
}
