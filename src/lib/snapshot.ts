import type { AppState, FullJournal, ID, JournalSnapshot } from '../types';
import { newId } from './id';

/** גרסת מבנה הצילום. עולה רק כשמשתנה המבנה, ולא כשמשתנה התוכן. */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * בונה צילום בלתי-משתנה של היומן ברגע הסיום.
 *
 * הצילום כולל גם את הנתונים שמסביב – לקוח, אתר, מדביר, תכשירים,
 * תוויות ותבניות – כי בלעדיהם המסמך שיופק מחר לא יהיה המסמך
 * שנמסר ללקוח היום. העתקה עמוקה כדי שעריכה עתידית לא תזלוג לצילום.
 */
/** מרכיב את היומן המלא מתוך המצב. משמש גם לצילום וגם לתצוגה. */
export function fullJournalFromState(state: AppState, journalId: ID): FullJournal | null {
  const journal = state.journals.find((j) => j.id === journalId);
  if (!journal) return null;
  return {
    journal,
    pests: state.journalPests.filter((p) => p.journalId === journalId),
    actions: state.journalActions.filter((a) => a.journalId === journalId),
    materials: state.journalMaterials.filter((m) => m.journalId === journalId),
    baitStations: state.baitStations.filter((b) => b.journalId === journalId),
    signatures: state.signatures.filter((sg) => sg.journalId === journalId),
    attachments: state.attachments.filter((a) => a.journalId === journalId),
  };
}

export function buildJournalSnapshot(state: AppState, journalId: ID): JournalSnapshot | null {
  const live = fullJournalFromState(state, journalId);
  if (!live) return null;
  const journal = live.journal;

  /* קבצים מצורפים נכנסים לצילום בלי התוכן הבינארי: הקובץ עצמו
     נשמר ומסונכרן ברשומת הקובץ, והכפלתו בצילום הייתה מנפחת
     כל סנכרון בלי להוסיף ראיה. */
  const full: FullJournal = {
    ...live,
    attachments: live.attachments.map((a) => ({ ...a, dataUrl: '' })),
  };

  const materialIds = new Set(full.materials.map((m) => m.materialId));
  const templateIds = new Set(full.materials.map((m) => m.templateId).filter(Boolean));
  const materials = state.materials.filter((m) => materialIds.has(m.id));
  const materialLabels = state.materialLabels.filter((l) => materialIds.has(l.materialId));
  const treatmentTemplates = state.treatmentTemplates.filter((t) => templateIds.has(t.id));

  const snapshot: JournalSnapshot = {
    id: newId('snp'),
    journalId,
    journalNumber: journal.journalNumber,
    takenAt: new Date().toISOString(),
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    full,
    customer: state.customers.find((c) => c.id === journal.customerId),
    site: state.sites.find((s) => s.id === journal.siteId),
    exterminator: state.exterminators.find((e) => e.id === journal.exterminatorId),
    materials,
    materialLabels,
    treatmentTemplates,
  };

  // העתקה עמוקה: אחרי הסיום שום עריכה במצב אינה נוגעת בצילום
  return structuredClone(snapshot);
}
