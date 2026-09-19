import { z } from 'zod';
import { lookupField, pathToString } from './fieldRegistry';

/**
 * מפת שגיאות בעברית ל-Zod.
 *
 * למה זה נדרש: הודעות ברירת המחדל של Zod באנגלית ("Required",
 * "Invalid enum value"). הדרישה היא להציג את רשימת השדות החסרים בעברית,
 * ולכן כל הודעה שלא הוגדרה במפורש נופלת לכאן ומתורגמת, עם שם השדה
 * מתוך מרשם השדות.
 */

function labelFor(path: ReadonlyArray<string | number>): string {
  const asString = pathToString(path);
  if (!asString) return 'שדה ביומן';
  return lookupField(asString).label;
}

export const hebrewErrorMap: z.ZodErrorMap = (issue, context) => {
  const label = labelFor(issue.path);

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') {
        return { message: `${label} — שדה חובה` };
      }
      return { message: `${label} — סוג הערך אינו תקין` };

    case z.ZodIssueCode.invalid_literal:
      return { message: `${label} — נדרש אישור מפורש` };

    case z.ZodIssueCode.invalid_enum_value:
      return { message: `${label} — יש לבחור אפשרות מהרשימה` };

    case z.ZodIssueCode.invalid_union:
      return { message: `${label} — הערך אינו תקין` };

    case z.ZodIssueCode.invalid_union_discriminator:
      return { message: `${label} — יש לבחור סוג מהרשימה` };

    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') {
        return issue.minimum === 1
          ? { message: `${label} — שדה חובה` }
          : { message: `${label} — נדרשים לפחות ${issue.minimum} תווים` };
      }
      if (issue.type === 'array') {
        return { message: `${label} — יש להוסיף לפחות ${issue.minimum} פריטים` };
      }
      return { message: `${label} — הערך קטן מהמותר` };

    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `${label} — עד ${issue.maximum} תווים` };
      if (issue.type === 'array') return { message: `${label} — עד ${issue.maximum} פריטים` };
      return { message: `${label} — הערך גדול מהמותר` };

    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: `${label} — כתובת דוא״ל לא תקינה` };
      if (issue.validation === 'uuid') return { message: `${label} — מזהה לא תקין` };
      if (issue.validation === 'url') return { message: `${label} — כתובת לא תקינה` };
      return { message: `${label} — הערך אינו בפורמט הנדרש` };

    case z.ZodIssueCode.unrecognized_keys:
      return { message: `${label} — נמצאו שדות שאינם מוכרים: ${issue.keys.join(', ')}` };

    case z.ZodIssueCode.not_multiple_of:
      return { message: `${label} — הערך חייב להיות כפולה של ${issue.multipleOf}` };

    case z.ZodIssueCode.custom:
      // הודעות custom נכתבות בעברית במקום שבו הן מוגדרות.
      return { message: context.defaultError };

    default:
      return { message: `${label} — הערך אינו תקין` };
  }
};

/** מותקן פעם אחת בעת טעינת הסכימה. */
export function installHebrewErrorMap(): void {
  z.setErrorMap(hebrewErrorMap);
}
