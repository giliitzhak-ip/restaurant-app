import type { AppState, FullJournal } from '../types';
import { pestName } from '../data/pests';
import { ACTION_LABEL, SEVERITY_LABEL, formatDateTime, journalNumberText } from './format';

/** טקסט סיכום לשיתוף ב-WhatsApp/דוא״ל ולתצוגה מקדימה. */
export function buildShareText(full: FullJournal, state: AppState): string {
  const { journal, pests, actions, materials } = full;
  const customer = state.customers.find((c) => c.id === journal.customerId);
  const lines: string[] = [];

  lines.push(`יצחק הדברות · ${journalNumberText(journal.journalNumber)}`);
  lines.push(`תאריך: ${formatDateTime(journal.startedAt)}`);
  if (customer) lines.push(`לקוח: ${customer.name}`);
  if (journal.siteAddress) lines.push(`כתובת: ${journal.siteAddress}`);
  lines.push(`מדביר: ${journal.exterminatorName} · רישיון ${journal.licenseNumber || 'לא הוזן'}`);
  lines.push('');

  if (pests.length) {
    lines.push('ממצאים:');
    for (const p of pests) {
      lines.push(`• ${pestName(p.pestId)} · נגיעות ${SEVERITY_LABEL[p.severity]}${p.areas.length ? ` · ${p.areas.join(', ')}` : ''}`);
    }
    lines.push('');
  }

  if (actions.length) {
    lines.push(`פעולות: ${actions.map((a) => ACTION_LABEL[a.kind]).join(', ')}`);
    lines.push('');
  }

  if (materials.length) {
    lines.push('תכשירים:');
    for (const m of materials) {
      const material = state.materials.find((x) => x.id === m.materialId);
      const reg = material?.registrationNumber ? ` (מס' רישום ${material.registrationNumber})` : '';
      lines.push(`• ${m.materialNameSnapshot}${reg}`);
      lines.push(`  מינון: ${m.execution.chosenDoseText || 'לא הוזן'} · אצווה: ${m.execution.batchNumber || 'לא הוזן'}`);
    }
    lines.push('');
  }

  if (journal.preventionRecommendations.length) {
    lines.push('המלצות מניעה:');
    for (const r of journal.preventionRecommendations) lines.push(`• ${r}`);
    lines.push('');
  }

  if (journal.nextInspectionDate) lines.push(`מועד ביקורת הבא: ${journal.nextInspectionDate}`);
  if (journal.summary) lines.push(`סיכום: ${journal.summary}`);

  lines.push('');
  lines.push('המסמך מתעד את העבודה לפי הנתונים שהוזנו. יש לפעול לפי הוראות התווית העדכנית של כל תכשיר.');

  return lines.join('\n');
}
