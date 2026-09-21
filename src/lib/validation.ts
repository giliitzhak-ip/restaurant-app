import type { FullJournal } from '../types';

export interface Issue {
  field: string;
  message: string;
  step: number;
  blocking: boolean;
}

/**
 * ולידציה של יומן לפני סיום. אותם כללים בדיוק רצים גם בשרת (server/validate.js).
 * שמירת טיוטה אף פעם אינה חסומה – רק סיום היומן.
 */
export function validateJournal(full: FullJournal): Issue[] {
  const { journal, pests, actions, materials, signatures } = full;
  const issues: Issue[] = [];

  if (!journal.exterminatorName?.trim()) {
    issues.push({ field: 'exterminatorName', message: 'חסר שם המדביר.', step: 1, blocking: true });
  }
  if (!journal.licenseNumber?.trim()) {
    issues.push({ field: 'licenseNumber', message: 'חסר מספר רישיון הדברה.', step: 1, blocking: true });
  }
  if (!journal.customerId) {
    issues.push({ field: 'customerId', message: 'לא נבחר לקוח.', step: 2, blocking: true });
  }
  if (!journal.siteAddress?.trim()) {
    issues.push({ field: 'siteAddress', message: 'חסרה כתובת האתר.', step: 2, blocking: true });
  }
  if (pests.length === 0) {
    issues.push({ field: 'pests', message: 'לא תועד מזיק.', step: 3, blocking: true });
  }
  if (actions.length === 0) {
    issues.push({ field: 'actions', message: 'לא תועדה פעולת טיפול.', step: 4, blocking: true });
  }

  if (materials.length === 0) {
    issues.push({
      field: 'materials',
      message: 'לא נבחר תכשיר. אם לא נעשה שימוש בתכשיר, יש לתעד זאת בסיכום.',
      step: 5,
      blocking: false,
    });
  }

  for (const jm of materials) {
    const name = jm.materialNameSnapshot;
    const e = jm.execution;
    if (!e.batchNumber?.trim()) {
      issues.push({ field: `batch:${jm.id}`, message: `חסר מספר אצווה עבור ${name}.`, step: 5, blocking: true });
    }
    if (!e.packageExpiry?.trim()) {
      issues.push({ field: `expiry:${jm.id}`, message: `חסר תאריך תפוגה על האריזה עבור ${name}.`, step: 5, blocking: true });
    }
    if (!e.chosenDoseText?.trim()) {
      issues.push({ field: `dose:${jm.id}`, message: `חסר מינון שנבחר עבור ${name}.`, step: 5, blocking: true });
    }
    if (!e.materialAmount?.trim()) {
      issues.push({ field: `amount:${jm.id}`, message: `חסרה כמות חומר בפועל עבור ${name}.`, step: 5, blocking: true });
    }
    if (!e.coverage?.trim()) {
      issues.push({ field: `coverage:${jm.id}`, message: `חסר היקף טיפול (שטח/תיבות/יחידות) עבור ${name}.`, step: 5, blocking: true });
    }
  }

  if (!signatures.some((s) => s.role === 'exterminator')) {
    issues.push({ field: 'sig:exterminator', message: 'חסרה חתימת המדביר.', step: 8, blocking: true });
  }
  if (!signatures.some((s) => s.role === 'customer')) {
    issues.push({ field: 'sig:customer', message: 'חסרה חתימת הלקוח.', step: 8, blocking: true });
  }
  if (!journal.customerAcknowledged) {
    issues.push({ field: 'acknowledged', message: 'הלקוח טרם אישר קבלת ההנחיות.', step: 8, blocking: true });
  }

  return issues;
}

export const blockingIssues = (issues: Issue[]): Issue[] => issues.filter((i) => i.blocking);
