/**
 * סדר התחנות במסלול.
 *
 * חשוב: אין כאן ניתוב אמיתי. החישוב הוא מרחק אווירי בין נקודות ציון,
 * ולכן התוצאה מוצגת תמיד כ"סידור לפי מרחק אווירי" ולעולם לא כ"מסלול
 * אופטימלי". סידור אמיתי מחייב מנוע ניתוב עם מפתח API, וכל עוד אין
 * כזה — המסך אומר זאת במפורש.
 */

export interface OrderableVisit {
  id: string;
  position: number;
  latitude: number | null;
  longitude: number | null;
  priority: 'normal' | 'high' | 'urgent';
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  estimatedDurationMinutes: number | null;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** העברת פריט במערך ממקום למקום, בלי לשנות את המקור. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length) return next;
  const bounded = Math.max(0, Math.min(next.length - 1, to));
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(bounded, 0, moved);
  return next;
}

/** מרחק אווירי בקילומטרים (נוסחת haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function minutesOfDay(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface AutoOrderOptions {
  /** נקודת היציאה של המסלול. בלעדיה מתחילים מהתחנה הראשונה שיש לה נ״צ. */
  startPoint?: GeoPoint | null;
  /** מהירות נסיעה ממוצעת להערכת זמנים. ברירת מחדל שמרנית לעיר. */
  averageSpeedKmh?: number;
}

export interface AutoOrderResult {
  /** מזהי התחנות בסדר המוצע. */
  order: string[];
  /** תחנות שאין להן נ״צ ולכן נשארו בסוף, בסדר הידני שלהן. */
  withoutCoordinates: string[];
  /** שיטת החישוב שבוצעה בפועל. */
  method: 'geographic';
  /** הסבר שמוצג למשתמש, כדי שלא יחשוב שבוצע ניתוב אמיתי. */
  explanation: string;
}

/**
 * סידור לפי מרחק אווירי.
 *
 * הכלל פשוט וניתן להסבר למשתמש, ולכן גם צפוי:
 * 1. קודם כל התחנות הדחופות, אחר כך אלה בעדיפות גבוהה, ואז השאר —
 *    ביקור דחוף לא יידחק לסוף היום רק מפני שהוא רחוק.
 * 2. בתוך כל קבוצה: מתחילים מנקודת היציאה ובכל צעד נבחרת התחנה
 *    הקרובה ביותר, מה שמצמצם חזרה מיותרת לאותו אזור.
 * 3. בין תחנות קרובות, מוקדמת זו שחלון הזמן שלה נסגר מוקדם יותר.
 */
export function autoOrderVisits(
  visits: readonly OrderableVisit[],
  options: AutoOrderOptions = {},
): AutoOrderResult {
  const averageSpeedKmh = options.averageSpeedKmh ?? 32;
  const withCoords = visits.filter(
    (visit): visit is OrderableVisit & { latitude: number; longitude: number } =>
      typeof visit.latitude === 'number' && typeof visit.longitude === 'number',
  );
  const withoutCoords = visits
    .filter((visit) => typeof visit.latitude !== 'number' || typeof visit.longitude !== 'number')
    .sort((a, b) => a.position - b.position);

  const order: string[] = [];
  let cursor: GeoPoint | null = options.startPoint ?? null;

  const groups: Array<OrderableVisit['priority']> = ['urgent', 'high', 'normal'];
  for (const priority of groups) {
    const remaining = withCoords.filter((visit) => visit.priority === priority);

    while (remaining.length > 0) {
      let bestIndex = 0;
      let bestScore = Number.POSITIVE_INFINITY;

      remaining.forEach((visit, index) => {
        const distance = cursor ? haversineKm(cursor, visit) : 0;
        // חלון זמן שנסגר מוקדם מקדים: כל שעה של "חלון נסגר" שווה 2 ק״מ,
        // ותחנה בלי חלון זמן מקבלת קנס קבוע קטן.
        const windowEnd = minutesOfDay(visit.timeWindowEnd);
        const windowPenalty = windowEnd === null ? 6 : (windowEnd / 60) * 2;
        const score = distance + windowPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });

      const [chosen] = remaining.splice(bestIndex, 1);
      if (!chosen) break;
      order.push(chosen.id);
      cursor = { latitude: chosen.latitude, longitude: chosen.longitude };
    }
  }

  return {
    order: [...order, ...withoutCoords.map((visit) => visit.id)],
    withoutCoordinates: withoutCoords.map((visit) => visit.id),
    method: 'geographic',
    explanation:
      `הסידור מעמיד קודם את התחנות הדחופות, ובתוך כל קבוצה מסדר לפי מרחק אווירי וחלונות זמן, ` +
      `בהנחת מהירות ממוצעת של ${averageSpeedKmh} קמ״ש. זהו סידור בסיסי ולא ניתוב אמיתי: ` +
      `אין חיבור למנוע ניתוב, ולכן אין התחשבות בדרכים, בעומסי תנועה או בזמני נסיעה בפועל.`,
  };
}

export interface ScheduleEstimateEntry {
  visitId: string;
  /** זמן נסיעה משוער מהתחנה הקודמת, בדקות. null כשאין נ״צ. */
  travelMinutes: number | null;
  /** מרחק אווירי מהתחנה הקודמת בק״מ. null כשאין נ״צ. */
  distanceKm: number | null;
  /** שעת הגעה משוערת (HH:MM). null כשאין שעת התחלה למסלול. */
  estimatedArrival: string | null;
}

export interface ScheduleEstimate {
  entries: ScheduleEstimateEntry[];
  totalDistanceKm: number | null;
  totalMinutes: number;
  /** שעת סיום משוערת של המסלול. */
  estimatedFinish: string | null;
  /** כמה תחנות אין להן נ״צ, ולכן ההערכה חלקית. */
  missingCoordinates: number;
}

function formatMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = Math.round(wrapped % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * הערכת זמנים ומרחקים למסלול, לפי הסדר הנתון.
 * ההערכה היא קו אווירי במהירות ממוצעת — היא מוצגת כ"משוער" בלבד.
 */
export function estimateSchedule(
  visits: readonly OrderableVisit[],
  options: AutoOrderOptions & { startTime?: string | null } = {},
): ScheduleEstimate {
  const averageSpeedKmh = options.averageSpeedKmh ?? 32;
  const entries: ScheduleEstimateEntry[] = [];
  let cursor: GeoPoint | null = options.startPoint ?? null;
  let clock = minutesOfDay(options.startTime ?? null);
  let totalDistance = 0;
  let distanceKnown = false;
  let totalMinutes = 0;
  let missing = 0;

  for (const visit of visits) {
    const hasCoords = typeof visit.latitude === 'number' && typeof visit.longitude === 'number';
    let distanceKm: number | null = null;
    let travelMinutes: number | null = null;

    if (hasCoords && cursor) {
      distanceKm = haversineKm(cursor, { latitude: visit.latitude as number, longitude: visit.longitude as number });
      travelMinutes = Math.round((distanceKm / averageSpeedKmh) * 60);
      totalDistance += distanceKm;
      distanceKnown = true;
    }
    if (!hasCoords) missing += 1;

    const duration = visit.estimatedDurationMinutes ?? 30;
    if (clock !== null) {
      clock += travelMinutes ?? 0;
      // חלון זמן: אי אפשר להתחיל לפני שהוא נפתח.
      const windowStart = minutesOfDay(visit.timeWindowStart);
      if (windowStart !== null && clock < windowStart) clock = windowStart;
    }
    entries.push({
      visitId: visit.id,
      travelMinutes,
      distanceKm,
      estimatedArrival: clock === null ? null : formatMinutes(clock),
    });
    if (clock !== null) clock += duration;
    totalMinutes += (travelMinutes ?? 0) + duration;

    if (hasCoords) {
      cursor = { latitude: visit.latitude as number, longitude: visit.longitude as number };
    }
  }

  return {
    entries,
    totalDistanceKm: distanceKnown ? Math.round(totalDistance * 10) / 10 : null,
    totalMinutes,
    estimatedFinish: clock === null ? null : formatMinutes(clock),
    missingCoordinates: missing,
  };
}
