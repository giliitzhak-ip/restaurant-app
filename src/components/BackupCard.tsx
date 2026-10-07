import { useRef, useState } from 'react';
import { Card, Notice } from './ui';
import { useStore } from '../state/store';
import { backupFileName, readBackup, type ImportPlan } from '../lib/backup';

const LABELS: Record<string, string> = {
  customers: 'לקוחות',
  sites: 'אתרים',
  journals: 'יומנים',
  journalPests: 'מזיקים ביומנים',
  journalActions: 'פעולות טיפול',
  journalMaterials: 'תכשירים ביומנים',
  baitStations: 'תיבות האכלה',
  signatures: 'חתימות',
  attachments: 'קבצים מצורפים',
  journalSnapshots: 'מסמכים סופיים',
  treatmentTemplates: 'תבניות טיפול',
  customerTemplates: 'תבניות לקוח',
  routes: 'מסלולים',
  routeStops: 'תחנות במסלול',
  tasks: 'משימות',
  auditLog: 'רשומות ביקורת',
  exterminators: 'מדבירים',
  users: 'משתמשים',
};

function summary(counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${LABELS[key] ?? key}: ${n}`);
  return parts.length ? parts.join(' · ') : 'אין רשומות';
}

/**
 * גיבוי וייבוא של נתוני המכשיר.
 *
 * זה הכלי שמאפשר להעביר נתונים למכשיר חדש, או לשחזר אחרי אובדן
 * מכשיר, גם כשאין שרת. הייבוא אינו דורס תיעוד קיים, ולכן אינו
 * יכול למחוק יומן בטעות.
 */
export function BackupCard() {
  const { exportBackup, importBackup } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  function download(): void {
    const file = exportBackup();
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    /* העוגן חייב להיות במסמך כדי שתכונת download תיכבד,
       והכתובת משוחררת רק אחרי שההורדה התחילה. */
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
    setErrors([]);
    setPlan(null);
    setExported(summary(file.counts));
  }

  async function pick(file: File): Promise<void> {
    setErrors([]);
    setPlan(null);
    setExported(null);
    const result = readBackup(await file.text());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setPlan(importBackup(result.file));
  }

  return (
    <Card>
      <div className="card-title"><h3>גיבוי ושחזור</h3></div>
      <p className="small">
        הגיבוי הוא קובץ אחד עם כל הלקוחות, היומנים, המסמכים הסופיים והחתימות
        שבמכשיר הזה. אפשר לשמור אותו, להעביר אותו למכשיר אחר ולייבא שם.
      </p>

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={download}>
          ייצוא גיבוי לקובץ
        </button>
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => fileRef.current?.click()}
        >
          ייבוא מקובץ
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          aria-label="בחירת קובץ גיבוי"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void pick(file);
          }}
        />
      </div>

      {exported && <Notice kind="info" title="הגיבוי נוצר">{exported}</Notice>}

      {errors.length > 0 && (
        <Notice kind="error" title="הייבוא לא בוצע">
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </Notice>
      )}

      {plan && (
        <Notice kind="info" title={plan.total > 0 ? 'הייבוא הושלם' : 'לא נוספו רשומות'}>
          {plan.total > 0 ? <div>נוספו · {summary(plan.added)}</div> : null}
          {Object.keys(plan.skipped).length > 0 && (
            <div className="small muted mt-2">
              דולגו (קיימות כבר במכשיר) · {summary(plan.skipped)}
            </div>
          )}
          <div className="small muted mt-2">
            ייבוא אינו דורס תיעוד שקיים במכשיר ואינו מוחק יומנים.
          </div>
        </Notice>
      )}

      <Notice kind="warn">
        קובץ הגיבוי מכיל פרטי לקוחות וחתימות. יש לשמור אותו במקום מוגן,
        ולא לשלוח אותו בערוצים פתוחים.
      </Notice>
    </Card>
  );
}
