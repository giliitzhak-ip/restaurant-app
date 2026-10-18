import type { FullJournal } from '../types';

/**
 * מה כבר הוזן ביומן ועלול להידרס.
 *
 * "טען מיומן אחרון" מחליף את נתוני הטיוטה – זו ההתנהגות המוגדרת,
 * והיא גם מה שמונע הכפלה של חומרים בכל לחיצה. אבל החלפה שקטה
 * עלולה למחוק עבודה שנעשתה בשטח, ולכן לפני ההחלפה מוצג בדיוק
 * מה יוחלף, והמשתמש מאשר.
 */
export function enteredSummary(full: FullJournal | null): string[] {
  if (!full) return [];
  const items: string[] = [];
  const { journal, pests, materials, signatures, baitStations } = full;

  if (pests.length > 0) items.push(`${pests.length} מזיקים שתועדו`);
  if (journal.findingsNotes?.trim()) items.push('הערות ממצאים');

  const withExecution = materials.filter((m) => {
    const e = m.execution;
    return Boolean(
      e.batchNumber?.trim() || e.packageExpiry?.trim() || e.chosenDoseText?.trim()
      || e.materialAmount?.trim() || e.waterAmount?.trim() || e.coverage?.trim(),
    );
  });
  if (withExecution.length > 0) {
    items.push(`נתוני ביצוע של ${withExecution.length} תכשירים (אצווה, מינון, כמויות)`);
  } else if (materials.length > 0) {
    items.push(`${materials.length} תכשירים שנבחרו`);
  }

  if (baitStations.length > 0) items.push(`${baitStations.length} תיבות האכלה`);
  if (signatures.length > 0) items.push(`${signatures.length} חתימות`);
  if (journal.summary?.trim()) items.push('סיכום');

  return items;
}

/**
 * טיוטה שלא נגעו בה: נוצרה, ואין בה שום נתון.
 *
 * "יומן חדש" שנלחץ שוב אמור לפתוח את הטיוטה הריקה הקיימת ולא
 * ליצור עוד אחת. אין מה לאבד – היא ריקה לפי ההגדרה – וכך גם לא
 * נשרף מספר יומן על טיוטה שנזנחה, וגם לא נערמות טיוטות ריקות.
 */
export function isUntouchedDraft(full: FullJournal | null): boolean {
  if (!full) return false;
  const { journal, pests, actions, materials, signatures, baitStations, attachments } = full;
  if (journal.status !== 'draft') return false;
  if (journal.customerId || journal.siteId) return false;
  if (pests.length || actions.length || materials.length) return false;
  if (signatures.length || baitStations.length || attachments.length) return false;

  const text = [
    journal.siteAddress, journal.siteAccessNotes, journal.findingsNotes,
    journal.exterminatorNote, journal.summary, journal.assistantName,
    journal.warrantyValue, journal.nextInspectionDate, journal.noProductReason,
  ];
  if (text.some((value) => String(value ?? '').trim())) return false;
  if (journal.preTreatmentActions.length || journal.preventionRecommendations.length) return false;
  return !journal.customerAcknowledged;
}
