import type { ClientRow, SiteRow } from '@/lib/repo';

/**
 * מילוי אוטומטי של יומן חדש מתוך ביקור במסלול.
 *
 * מועתקים רק פרטי זיהוי יציבים: המזמין, האתר וכתובתו. במפורש אינם
 * מועתקים — תאריך, שעה, ממצאים, מינונים, אצוות, חתימות ואזהרות. אלה
 * נתונים של הביקור הנוכחי, והעתקתם מיומן קודם הייתה הופכת את היומן
 * למסמך לא נכון.
 */

/** שדות שלעולם אינם מועתקים מטיפול קודם. משמש גם לבדיקה. */
export const NEVER_PREFILLED_PATHS = [
  'execution.performedDate',
  'execution.performedStartTime',
  'execution.performedEndTime',
  'monitoring.findings',
  'applications',
  'signatures',
  'preWarnings',
  'postWarnings.duringTreatmentInfo',
  'postWarnings.afterTreatmentInfo',
  'location.coordinates',
] as const;

export interface PrefillSource {
  client: ClientRow;
  site?: SiteRow | null;
  /** מזהה הביקור שממנו נפתח היומן — לקישור דו-כיווני. */
  visitId?: string | null;
  routeId?: string | null;
}

export interface FieldUpdate {
  path: string;
  value: unknown;
}

/** כתובת מלאה לתצוגה ולניווט. */
export function siteAddressText(site: SiteRow | null | undefined, fallback?: string | null): string | null {
  if (!site) return fallback?.trim() || null;
  const parts = [
    site.street,
    site.houseNumber,
    site.apartmentNumber ? `דירה ${site.apartmentNumber}` : null,
    site.neighborhoodName,
    site.city,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (parts.length === 0) return fallback?.trim() || null;
  return parts.join(' ');
}

/** נקודת ציון של האתר, אם נשמרה בו. */
export function siteCoordinates(site: SiteRow | null | undefined): { latitude: number; longitude: number } | null {
  const raw = site?.coordinates;
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/**
 * בונה את רשימת העדכונים לטיוטה חדשה.
 * מחזיר נתיבים בפורמט של useDraft.setFields.
 */
export function buildLogPrefill(source: PrefillSource): FieldUpdate[] {
  const { client, site } = source;
  const updates: FieldUpdate[] = [
    { path: 'orderer.name', value: client.name },
    { path: 'orderer.clientId', value: client.id },
    { path: 'orderer.isPrivatePerson', value: client.isPrivatePerson },
  ];

  if (client.phone) updates.push({ path: 'orderer.phone', value: client.phone });
  if (client.mobile) updates.push({ path: 'orderer.mobile', value: client.mobile });
  if (client.contactRole) updates.push({ path: 'orderer.role', value: client.contactRole });

  if (site) {
    updates.push(
      { path: 'location.siteId', value: site.id },
      { path: 'location.siteLabel', value: site.label },
      { path: 'location.placeKind', value: site.placeKind },
    );
    const optional: Array<[string, string | null]> = [
      ['location.city', site.city],
      ['location.street', site.street],
      ['location.houseNumber', site.houseNumber],
      ['location.apartmentNumber', site.apartmentNumber],
      ['location.structureType', site.structureType],
      ['location.localAuthorityName', site.localAuthorityName],
      ['location.siteType', site.siteType],
      ['location.siteDescription', site.siteDescription],
      ['location.neighborhoodName', site.neighborhoodName],
      ['location.areaDescription', site.areaDescription],
    ];
    for (const [path, value] of optional) {
      if (value) updates.push({ path, value });
    }
  }

  // קישור לביקור נשמר בתוכן הטיוטה לצורכי הממשק בלבד. סכמת היומן
  // הרשמית אינה מכילה את השדה הזה, ולכן הוא אינו נכנס למסמך הסופי.
  if (source.visitId) updates.push({ path: 'routeVisitId', value: source.visitId });
  if (source.routeId) updates.push({ path: 'routeId', value: source.routeId });

  return updates;
}

/**
 * מידע מהטיפול הקודם שניתן להציע למדביר. ההצעה אינה נכתבת לטיוטה
 * מעצמה — המדביר חייב לאשר כל פריט בנפרד.
 */
export interface PreviousTreatmentHint {
  label: string;
  value: string;
  /** הנתיב שאליו יוכנס הערך אם המדביר יאשר. */
  path: string;
}

export function buildPreviousTreatmentHints(snapshot: Record<string, unknown> | null): PreviousTreatmentHint[] {
  if (!snapshot) return [];
  const hints: PreviousTreatmentHint[] = [];
  const location = (snapshot.location ?? {}) as Record<string, unknown>;

  if (typeof location.siteDescription === 'string' && location.siteDescription.trim()) {
    hints.push({
      label: 'תיאור האתר מהיומן הקודם',
      value: location.siteDescription.trim(),
      path: 'location.siteDescription',
    });
  }
  if (typeof location.areaDescription === 'string' && location.areaDescription.trim()) {
    hints.push({
      label: 'תיאור השטח מהיומן הקודם',
      value: location.areaDescription.trim(),
      path: 'location.areaDescription',
    });
  }
  return hints;
}
