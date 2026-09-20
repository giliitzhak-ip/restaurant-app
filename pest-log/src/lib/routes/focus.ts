import type { FocusCategory, FocusImportance } from '@/schema/routes';

/**
 * הצעת דגשים לביקור.
 *
 * כלל ברזל: אין המצאה. כל הצעה נגזרת מנתון קיים — היומן האחרון, משימה
 * פתוחה, תחנת האכלה שקיימת באתר, או תלונה שהוזנה. אם אין נתון, אין
 * הצעה. כל ההצעות נוצרות כלא-מאושרות, והמדביר חייב לאשר, לערוך או
 * למחוק אותן לפני תחילת הביקור.
 */

export interface FocusSuggestion {
  category: FocusCategory;
  title: string;
  details: string | null;
  importance: FocusImportance;
  /** מאיפה נלקח המידע — מוצג למדביר כדי שיוכל לאמת. */
  sourceReference: Record<string, unknown>;
}

export interface FocusSuggestionInput {
  /** תוכן היומן האחרון באתר (snapshot של יומן שהושלם). */
  lastLog?: {
    id: string;
    serialNumber: number | null;
    completedAt: string | null;
    snapshot: Record<string, unknown>;
  } | null;
  /** משימות המשך פתוחות של אותו לקוח/אתר. */
  openTasks?: Array<{ logId: string; description: string | null; targetDate: string | null }>;
  /** תחנות האכלה שקיימות באתר. */
  baitStations?: Array<{ id: string; stationNumber: string; locationDescription: string; status: string }>;
  /** תלונה חדשה שהוזנה ידנית עבור הביקור. */
  complaint?: string | null;
  /** סוג השירות הקבוע ללקוח. */
  serviceType?: string | null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((item) => typeof item === 'object' && item !== null) as Record<string, unknown>[]) : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * בונה את רשימת ההצעות. הפונקציה טהורה וניתנת לבדיקה, ואינה פונה לרשת.
 */
export function suggestFocusItems(input: FocusSuggestionInput): FocusSuggestion[] {
  const suggestions: FocusSuggestion[] = [];
  const snapshot = input.lastLog?.snapshot ?? null;
  const logReference = input.lastLog
    ? { logId: input.lastLog.id, serialNumber: input.lastLog.serialNumber, completedAt: input.lastLog.completedAt }
    : {};

  if (snapshot) {
    const monitoring = (snapshot.monitoring ?? {}) as Record<string, unknown>;
    for (const finding of asArray(monitoring.findings)) {
      const pestName = text(finding.pestName);
      if (!pestName) continue;
      const location = text(finding.findingLocation);
      const level = text(finding.infestationLevel);
      suggestions.push({
        category: 'pest',
        title: `בדיקת ${pestName}`,
        details: [
          location ? `נמצא בטיפול הקודם ב: ${location}` : null,
          level ? `רמת נגיעות קודמת: ${level}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
        importance: level === 'high' ? 'high' : 'normal',
        sourceReference: { ...logReference, source: 'monitoring.findings' },
      });
      if (location) {
        suggestions.push({
          category: 'hotspot',
          title: `מוקד לבדיקה: ${location}`,
          details: `מוקד שאותר בטיפול הקודם${pestName ? ` (${pestName})` : ''}.`,
          importance: 'normal',
          sourceReference: { ...logReference, source: 'monitoring.findings.findingLocation' },
        });
      }
    }

    const prevention = (snapshot.prevention ?? {}) as Record<string, unknown>;
    for (const action of asArray(prevention.actions)) {
      const description = text(action.description);
      if (!description) continue;
      const status = text(action.status);
      // רק פעולה שלא בוצעה הופכת לדגש. פעולה שבוצעה אינה "ליקוי".
      if (status && status !== 'not_done' && status !== 'partial') continue;
      suggestions.push({
        category: 'prevention',
        title: `מניעה שהומלצה ולא הושלמה: ${description}`,
        details: status === 'partial' ? 'בוצעה חלקית בטיפול הקודם.' : 'הומלצה בטיפול הקודם ולא בוצעה.',
        importance: 'high',
        sourceReference: { ...logReference, source: 'prevention.actions' },
      });
    }

    const post = (snapshot.postWarnings ?? {}) as Record<string, unknown>;
    if (post.followUpRequired === true) {
      const description = text(post.followUpDescription);
      suggestions.push({
        category: 'previous_defect',
        title: 'טיפול משלים שנדרש ביומן הקודם',
        details: description,
        importance: 'high',
        sourceReference: { ...logReference, source: 'postWarnings.followUp' },
      });
    }

    const location = (snapshot.location ?? {}) as Record<string, unknown>;
    const accessNotes = text(location.accessInstructions) ?? text(location.siteDescription);
    if (accessNotes) {
      suggestions.push({
        category: 'access',
        title: 'הוראות כניסה מהיומן הקודם',
        details: accessNotes,
        importance: 'normal',
        sourceReference: { ...logReference, source: 'location' },
      });
    }
  }

  for (const task of input.openTasks ?? []) {
    suggestions.push({
      category: 'previous_defect',
      title: 'משימת המשך פתוחה',
      details: [task.description, task.targetDate ? `מועד יעד: ${task.targetDate}` : null]
        .filter(Boolean)
        .join(' · ') || null,
      importance: 'high',
      sourceReference: { logId: task.logId, source: 'followUpTasks' },
    });
  }

  for (const station of input.baitStations ?? []) {
    const needsAttention = station.status !== 'intact';
    suggestions.push({
      category: 'bait_station',
      title: `תחנת האכלה ${station.stationNumber}`,
      details: [
        station.locationDescription,
        needsAttention ? 'התחנה סומנה כדורשת טיפול בביקור הקודם.' : null,
      ]
        .filter(Boolean)
        .join(' · ') || null,
      importance: needsAttention ? 'high' : 'normal',
      sourceReference: { baitStationId: station.id, source: 'baitStations' },
    });
  }

  const complaint = text(input.complaint);
  if (complaint) {
    suggestions.push({
      category: 'complaint',
      title: 'תלונת לקוח לבדיקה',
      details: complaint,
      importance: 'high',
      sourceReference: { source: 'visit.complaint' },
    });
  }

  const serviceType = text(input.serviceType);
  if (serviceType) {
    suggestions.push({
      category: 'note',
      title: `שירות קבוע: ${serviceType}`,
      details: 'סוג השירות הקבוע ללקוח, כפי שמוגדר בקו האחזקה.',
      importance: 'low',
      sourceReference: { source: 'visit.serviceType' },
    });
  }

  // הסרת כפילויות לפי כותרת, תוך שמירה על החשיבות הגבוהה מביניהן.
  const byTitle = new Map<string, FocusSuggestion>();
  for (const suggestion of suggestions) {
    const existing = byTitle.get(suggestion.title);
    if (!existing) {
      byTitle.set(suggestion.title, suggestion);
      continue;
    }
    if (existing.importance !== 'high' && suggestion.importance === 'high') {
      byTitle.set(suggestion.title, suggestion);
    }
  }
  return [...byTitle.values()];
}
