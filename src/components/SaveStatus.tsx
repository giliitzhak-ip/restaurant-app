import { useState } from 'react';
import { useStore } from '../state/store';
import { Dialog, Notice, SaveIndicator } from './ui';

/** שם ישות בעברית, להצגת דחייה בשפה של המשתמש ולא בשמות טבלאות. */
const ENTITY_LABELS: Record<string, string> = {
  exterminators: 'פרטי המדביר',
  customers: 'לקוח',
  customer_sites: 'אתר של לקוח',
  journals: 'יומן',
  journal_pests: 'מזיק ביומן',
  journal_actions: 'פעולת טיפול',
  journal_materials: 'חומר ביומן',
  bait_stations: 'תיבת האכלה',
  signatures: 'חתימה',
  attachments: 'קובץ מצורף',
  treatment_templates: 'תבנית טיפול',
  customer_templates: 'תבנית לקוח',
  routes: 'מסלול',
  route_stops: 'תחנה במסלול',
  tasks: 'משימה',
  audit_log: 'רשומת ביקורת',
};

/**
 * חיווי השמירה והסנכרון, יחד עם פירוט שינויים שהשרת דחה.
 *
 * דחייה אינה נזרקת ואינה מוסתרת: הנתון נשאר במכשיר, והמשתמש רואה
 * מה לא נקלט ומדוע, כדי שיוכל לתקן או לנסות שוב.
 */
export function SaveStatus() {
  const {
    saveState, saveErrors, retrySave, pendingSync, online,
    syncRejected, retrySync, dismissSyncRejection,
  } = useStore();
  const [open, setOpen] = useState(false);

  /* דחייה והערה הן שני דברים שונים, ואין לקרוא לשינוי שנקלט
     "לא נקלט". הניסוח נגזר ממה שבאמת קרה. */
  const blocking = syncRejected.filter((r) => !r.accepted).length;
  const rejectedLabel = blocking > 0
    ? (blocking === 1 ? 'שינוי לא נקלט בשרת' : `${blocking} שינויים לא נקלטו`)
    : (syncRejected.length === 1 ? 'הערה מהשרת' : `${syncRejected.length} הערות מהשרת`);

  return (
    <>
      <SaveIndicator
        state={saveState}
        pending={pendingSync}
        online={online}
        errors={saveErrors}
        onRetry={() => void retrySave()}
        rejected={syncRejected.length}
        rejectedLabel={rejectedLabel}
        onShowRejected={() => setOpen(true)}
      />

      <Dialog
        open={open && syncRejected.length > 0}
        title="שינויים שלא נקלטו בשרת"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { void retrySync(); setOpen(false); }}
            >
              נסה לשלוח שוב
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              סגור
            </button>
          </>
        }
      >
        <Notice kind="warn">
          הנתונים נשמרו במכשיר ולא אבדו. להלן שינויים שלא נקלטו בשרת, או
          שנקלטו עם הערה שדורשת תשומת לב.
        </Notice>
        <div>
          {syncRejected.map((r) => (
            <div className="sync-reject-item" key={r.op.id}>
              <div className="bold">
                {ENTITY_LABELS[r.op.entity] ?? r.op.entity}
                {r.accepted && <span className="small muted"> · נקלט בשרת</span>}
              </div>
              <div className={`small ${r.accepted ? 'muted' : 'sync-reject-why'}`}>
                {r.errors.join(' · ')}
              </div>
              <div className="small muted">
                {r.op.deleted ? 'מחיקה' : 'עדכון'} · {new Date(r.at).toLocaleString('he-IL')}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-2"
                onClick={() => void dismissSyncRejection(r.op.id)}
              >
                הסתר הודעה זו
              </button>
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
}
