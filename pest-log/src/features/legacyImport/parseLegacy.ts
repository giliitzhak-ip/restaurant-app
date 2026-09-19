import type { Mutable } from '@/lib/paths';

/**
 * ייבוא מהגרסה המקומית הקודמת (pest-log.html ששמרה ב-localStorage).
 *
 * הערה חשובה: הקובץ המקורי לא היה זמין בזמן הפיתוח, ולכן המפרש כאן
 * סובלני בכוונה — הוא מזהה מבנים נפוצים לפי שמות מפתחות, ולא מניח מבנה
 * יחיד. שדה שלא זוהה אינו נזרק: הוא נשמר תחת `legacy.unmapped` כדי
 * שאפשר יהיה למפות אותו ידנית בלי לאבד מידע.
 * ראו docs/migration-from-local-html.md.
 */

/** המפתחות שנסרקים ב-localStorage. */
export const LEGACY_KEY_PATTERN = /(pest|hadbara|yoman|yomen|הדברה|יומן|log)/i;

export interface LegacyRecord {
  /** מזהה יציב שנגזר מהתוכן — משמש למניעת כפילויות בייבוא חוזר. */
  fingerprint: string;
  /** המפתח ב-localStorage שממנו הגיע. */
  sourceKey: string;
  /** התוכן הממופה לסכימה של המערכת החדשה. */
  content: Mutable;
  /** שדות שלא זוהו — נשמרים ולא נמחקים. */
  unmapped: Mutable;
  /** תיאור קצר להצגה בתצוגה המקדימה. */
  summary: string;
}

export interface LegacyScanResult {
  records: LegacyRecord[];
  /** מפתחות שנסרקו אך לא הכילו מבנה מזוהה. */
  skippedKeys: string[];
  /** שגיאות פענוח, לפי מפתח. */
  errors: Array<{ key: string; message: string }>;
}

/** מיפוי שמות מפתחות נפוצים → נתיב בסכימה החדשה. */
const FIELD_ALIASES: Array<[RegExp, string]> = [
  [/^(customer|client|orderer|מזמין)?_?name$|^שם(_?מזמין)?$/i, 'orderer.name'],
  [/^(customer|client|orderer)?_?phone$|^טלפון$/i, 'orderer.phone'],
  [/^(customer|client|orderer)?_?mobile$|^נייד$/i, 'orderer.mobile'],
  [/^(customer|client|orderer)?_?role$|^תפקיד$/i, 'orderer.role'],
  [/^city$|^עיר$/i, 'location.city'],
  [/^street$|^רחוב$/i, 'location.street'],
  [/^house(_?number)?$|^מספר_?בית$/i, 'location.houseNumber'],
  [/^(apartment|apt)(_?number)?$|^דירה$|^מספר_?דירה$/i, 'location.apartmentNumber'],
  [/^structure(_?type)?$|^סוג_?מבנה$/i, 'location.structureType'],
  [/^date$|^תאריך$/i, 'execution.performedDate'],
  [/^time$|^start_?time$|^שעה$/i, 'execution.performedStartTime'],
  [/^end_?time$|^שעת_?סיום$/i, 'execution.performedEndTime'],
  [/^exterminator(_?name)?$|^מדביר$/i, 'exterminator.fullName'],
  [/^license(_?number)?$|^רישיון$|^מספר_?רישיון$/i, 'exterminator.licenseNumber'],
  [/^license_?type$|^סוג_?רישיון$/i, 'exterminator.licenseType'],
  [/^notes$|^הערות$/i, 'generalNotes'],
];

function mapKey(key: string): string | null {
  for (const [pattern, path] of FIELD_ALIASES) {
    if (pattern.test(key)) return path;
  }
  return null;
}

function setPath(target: Mutable, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor: Mutable = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!;
    if (typeof cursor[segment] !== 'object' || cursor[segment] === null) cursor[segment] = {};
    cursor = cursor[segment] as Mutable;
  }
  cursor[segments[segments.length - 1]!] = value;
}

/** טביעת אצבע יציבה לזיהוי כפילויות — לא קריפטוגרפית, מספיקה לדה-דופליקציה. */
export function fingerprintOf(value: unknown): string {
  const json = JSON.stringify(value, Object.keys(value as object).sort());
  let hash = 5381;
  for (let i = 0; i < json.length; i += 1) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) >>> 0;
  }
  return `legacy-${hash.toString(16)}-${json.length}`;
}

/** ממיר רשומה בודדת מהמבנה הישן למבנה החדש. */
export function mapLegacyRecord(raw: Mutable, sourceKey: string): LegacyRecord {
  const content: Mutable = {};
  const unmapped: Mutable = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined || value === '') continue;
    const path = mapKey(key);
    if (path) setPath(content, path, value);
    else unmapped[key] = value;
  }

  // ברירות מחדל שמאפשרות פתיחת היומן כטיוטה תקינה.
  content.treatmentKinds ??= ['standard'];
  content.hasAssistant ??= false;
  content.assistants ??= [];
  content.applications ??= [];
  content.baitStations ??= [];
  content.attachments ??= [];
  content.monitoring ??= { findings: [] };
  content.prevention ??= { actions: [] };
  content.operator ??= { hasOperator: false };
  const location = (content.location ?? {}) as Mutable;
  location.placeKind ??= 'dwelling';
  content.location = location;

  const orderer = (content.orderer ?? {}) as Mutable;
  const summaryParts = [
    typeof orderer.name === 'string' ? orderer.name : '',
    typeof location.city === 'string' ? location.city : '',
    typeof (content.execution as Mutable | undefined)?.performedDate === 'string'
      ? String((content.execution as Mutable).performedDate)
      : '',
  ].filter(Boolean);

  return {
    fingerprint: fingerprintOf(raw),
    sourceKey,
    content,
    unmapped,
    summary: summaryParts.length > 0 ? summaryParts.join(' · ') : 'יומן ללא פרטים מזהים',
  };
}

/**
 * סורק את localStorage ומחזיר את כל הרשומות שנמצאו.
 * זו הנקודה היחידה במערכת שקוראת מ-localStorage — הוא אינו מסד הנתונים.
 */
export function scanLegacyStorage(storage: Storage): LegacyScanResult {
  const records: LegacyRecord[] = [];
  const skippedKeys: string[] = [];
  const errors: Array<{ key: string; message: string }> = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !LEGACY_KEY_PATTERN.test(key)) continue;

    const raw = storage.getItem(key);
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      errors.push({ key, message: 'התוכן אינו JSON תקין ולכן לא יובא.' });
      continue;
    }

    if (Array.isArray(parsed)) {
      let mappedAny = false;
      parsed.forEach((item, itemIndex) => {
        if (item && typeof item === 'object') {
          records.push(mapLegacyRecord(item as Mutable, `${key}[${itemIndex}]`));
          mappedAny = true;
        }
      });
      if (!mappedAny) skippedKeys.push(key);
    } else if (parsed && typeof parsed === 'object') {
      const objectValues = Object.values(parsed as Mutable);
      const looksLikeCollection =
        objectValues.length > 0 && objectValues.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v));

      if (looksLikeCollection) {
        for (const [childKey, child] of Object.entries(parsed as Mutable)) {
          records.push(mapLegacyRecord(child as Mutable, `${key}.${childKey}`));
        }
      } else {
        records.push(mapLegacyRecord(parsed as Mutable, key));
      }
    } else {
      skippedKeys.push(key);
    }
  }

  return { records, skippedKeys, errors };
}

/** מסנן רשומות שכבר יובאו בעבר, לפי טביעות אצבע שנשמרו. */
export function excludeAlreadyImported(
  records: LegacyRecord[],
  importedFingerprints: ReadonlySet<string>,
): { fresh: LegacyRecord[]; duplicates: LegacyRecord[] } {
  const fresh: LegacyRecord[] = [];
  const duplicates: LegacyRecord[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    // כפילות מול ייבוא קודם, וגם כפילות בתוך אותו ייבוא.
    if (importedFingerprints.has(record.fingerprint) || seen.has(record.fingerprint)) {
      duplicates.push(record);
      continue;
    }
    seen.add(record.fingerprint);
    fresh.push(record);
  }

  return { fresh, duplicates };
}
