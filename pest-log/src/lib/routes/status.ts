import { VISIT_STATUS_PRESENTATION, type VisitStatus } from '@/schema/routes';
import type { RouteVisitRow } from './types';

/**
 * מצב התחנות במסלול: מה נותר, מה דחוף ומה באיחור.
 * פונקציות טהורות בלבד — כדי שהמונים במסך הבית והצבעים במסלול ייבדקו
 * בבדיקות יחידה ולא "ייראו נכון" במקרה.
 */

export const OPEN_VISIT_STATUSES: VisitStatus[] = [
  'pending',
  'en_route',
  'in_progress',
  'revisit_needed',
  'waiting_client',
];

/** תאריך מקומי בפורמט YYYY-MM-DD (ולא UTC — מסלול הוא יום עבודה מקומי). */
export function localDateIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minutesOfDay(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * ביקור באיחור: היום שלו הגיע, הוא עדיין פתוח, והזמן המתוכנן (או סוף
 * חלון הזמן) כבר עבר. ביקור של מחר לעולם אינו "באיחור".
 */
export function isVisitLate(visit: RouteVisitRow, now = new Date()): boolean {
  if (!OPEN_VISIT_STATUSES.includes(visit.status)) return false;
  const today = localDateIso(now);
  if (visit.plannedDate < today) return true;
  if (visit.plannedDate > today) return false;

  const deadline = minutesOfDay(visit.timeWindowEnd) ?? minutesOfDay(visit.plannedStartTime);
  if (deadline === null) return false;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes > deadline;
}

export function isVisitOpen(visit: RouteVisitRow): boolean {
  return OPEN_VISIT_STATUSES.includes(visit.status);
}

export type VisitTone = 'grey' | 'blue' | 'orange' | 'green' | 'red' | 'purple' | 'yellow';

/**
 * הגוון שבו מוצגת התחנה. דחיפות ואיחור גוברים על הסטטוס הרגיל, אבל
 * הטקסט והאייקון נשארים של הסטטוס — הצבע לעולם אינו המידע היחיד.
 */
export function visitTone(visit: RouteVisitRow, now = new Date()): VisitTone {
  if (visit.status === 'completed') return 'green';
  if (visit.status === 'cancelled') return 'grey';
  if (isVisitLate(visit, now) || visit.priority === 'urgent') return 'red';
  return VISIT_STATUS_PRESENTATION[visit.status].tone;
}

/** תיאור מילולי של הסיבה לגוון האדום, לקורא מסך ולתווית. */
export function visitAlertLabel(visit: RouteVisitRow, now = new Date()): string | null {
  const late = isVisitLate(visit, now);
  if (late && visit.priority === 'urgent') return 'דחוף ובאיחור';
  if (late) return 'באיחור';
  if (visit.priority === 'urgent') return 'דחוף';
  return null;
}

export interface RouteProgress {
  total: number;
  completed: number;
  remaining: number;
  urgent: number;
  late: number;
  /** דקות משוערות שנותרו, לפי משך הטיפול המשוער של התחנות הפתוחות. */
  remainingMinutes: number;
}

export function routeProgress(visits: readonly RouteVisitRow[], now = new Date()): RouteProgress {
  let completed = 0;
  let remaining = 0;
  let urgent = 0;
  let late = 0;
  let remainingMinutes = 0;

  for (const visit of visits) {
    if (visit.status === 'completed') completed += 1;
    if (visit.status === 'cancelled') continue;
    if (isVisitOpen(visit)) {
      remaining += 1;
      remainingMinutes += visit.estimatedDurationMinutes ?? 30;
      if (visit.priority === 'urgent') urgent += 1;
      if (isVisitLate(visit, now)) late += 1;
    }
  }

  return { total: visits.filter((v) => v.status !== 'cancelled').length, completed, remaining, urgent, late, remainingMinutes };
}

/** התחנה הבאה לטיפול: הפתוחה הראשונה לפי הסדר. */
export function nextVisit(visits: readonly RouteVisitRow[]): RouteVisitRow | null {
  const open = visits
    .filter((visit) => isVisitOpen(visit))
    .sort((a, b) => a.position - b.position);
  return open[0] ?? null;
}

/** תיאור משך בעברית, לתצוגה בכותרת המסלול. */
export function formatDurationHe(totalMinutes: number): string {
  if (totalMinutes <= 0) return '—';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes} דק׳`;
  if (minutes === 0) return `${hours} שע׳`;
  return `${hours} שע׳ ${minutes} דק׳`;
}
