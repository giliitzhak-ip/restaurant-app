import type { JournalStatus, Severity, StopStatus, WorkKind, VisitKind, SiteKind, ActionKind, TaskKind } from '../types';

export const pad = (n: number, len = 2): string => String(n).padStart(len, '0');

export function isoNow(): string {
  return new Date().toISOString();
}

export function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeInputs(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0).toISOString();
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

export const JOURNAL_STATUS_LABEL: Record<JournalStatus, string> = {
  draft: 'טיוטה',
  completed: 'הושלם',
  sent: 'נשלח',
  needs_completion: 'דורש השלמה',
  cancelled: 'בוטל',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'נמוכה',
  medium: 'בינונית',
  high: 'גבוהה',
};

export const STOP_STATUS_LABEL: Record<StopStatus, string> = {
  pending: 'ממתין',
  on_the_way: 'בדרך',
  in_progress: 'בטיפול',
  done: 'הושלם',
  postponed: 'נדחה',
};

export const WORK_KIND_LABEL: Record<WorkKind, string> = {
  private: 'פרטית',
  business: 'עסקית',
  institutional: 'מוסדית',
  municipal: 'רשות מקומית',
  other: 'אחר',
};

export const VISIT_KIND_LABEL: Record<VisitKind, string> = {
  new: 'חדש',
  inspection: 'ביקורת',
  followup: 'טיפול חוזר',
  warranty: 'אחריות',
};

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  apartment: 'דירה',
  private_house: 'בית פרטי',
  office: 'משרד',
  restaurant: 'מסעדה / בית אוכל',
  food_factory: 'מפעל מזון',
  warehouse: 'מחסן',
  school: 'מוסד חינוך',
  clinic: 'מרפאה',
  public_area: 'שטח ציבורי',
  other: 'אחר',
};

export const ACTION_LABEL: Record<ActionKind, string> = {
  monitoring: 'ניטור',
  sealing: 'איטום',
  cleaning: 'ניקוי',
  vacuum: 'שאיבה',
  traps: 'מלכודות',
  bait_stations: 'תיבות האכלה',
  spot_treatment: 'טיפול נקודתי',
  spraying: 'ריסוס',
};

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  inspection: 'ביקורת',
  retreatment: 'חידוש טיפול',
  bait_check: 'בדיקת תיבות',
  billing: 'גבייה',
  document: 'מסמך חסר',
};

export function journalNumberText(n: number): string {
  return `יומן ${String(n).padStart(4, '0')}`;
}
