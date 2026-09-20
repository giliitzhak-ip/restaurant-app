/**
 * קריאת נקודת ציון מטקסט שהודבק — הועבר מהגרסה הקודמת.
 *
 * למה זה נחוץ: בחלק מהמכשירים ובחלק מהמסגרות ה-GPS חסום או לא מדויק.
 * במקרה כזה המדביר פותח את המפות, מעתיק את הנקודה או את הקישור,
 * ומדביק אותם כאן — במקום לוותר על תיעוד המיקום.
 */

export interface ParsedCoordinates {
  latitude: number;
  longitude: number;
}

const PATTERNS: RegExp[] = [
  // Google Maps share link: ...?q=31.75,35.09
  /[?&]q=(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/,
  // Google Maps URL: .../@31.75,35.09,17z  או /place/31.75,35.09
  /[@/](-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  // Waze: ...?ll=31.75,35.09
  /ll=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  // טקסט חופשי: 31.750123, 35.091234
  /^\s*(-?\d{1,3}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)\s*$/,
];

export function parseCoordinatesText(text: string | null | undefined): ParsedCoordinates | null {
  const value = String(text ?? '').trim();
  if (!value) return null;

  for (const pattern of PATTERNS) {
    const match = pattern.exec(value);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    return { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
  }
  return null;
}

/** קישור לצפייה בנקודה במפות. */
export function mapViewLink(point: ParsedCoordinates): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
}
