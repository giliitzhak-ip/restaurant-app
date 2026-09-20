import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, CircleHelp } from 'lucide-react';
import { useApp } from '@/state/AppContext';
import { PoisonNotice } from '@/components/Common';
import { countFailedOperations, countPendingOperations, getDb } from '@/lib/db/idb';
import { clientEnv } from '@/lib/env';
import { getServerTimeOffset, serverTimeLastSyncedAt } from '@/lib/time';
import { pdfServiceHealth } from '@/lib/api';

/**
 * „בדיקת מערכת” — הועבר מהגרסה הקודמת.
 *
 * כל שורה כאן היא בדיקה אמיתית שמתבצעת ברגע הפתיחה, ולא הצהרה. זה
 * המסך שמאפשר לענות על „למה זה לא עובד אצלי” בלי לנחש.
 */
interface Check {
  label: string;
  status: 'ok' | 'warn' | 'unknown';
  detail: string;
}

export function DiagnosticsPage(): React.JSX.Element {
  const { profile, syncStatus } = useApp();
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(true);

  const run = useCallback(async () => {
    setRunning(true);
    const result: Check[] = [];

    result.push({
      label: 'הגדרות סביבה',
      status: clientEnv.isConfigured ? 'ok' : 'warn',
      detail: clientEnv.isConfigured
        ? 'כל משתני הסביבה הנדרשים הוגדרו.'
        : `חסרים: ${clientEnv.missing.join(', ')}`,
    });

    result.push({
      label: 'חיבור לרשת',
      status: navigator.onLine ? 'ok' : 'warn',
      detail: navigator.onLine ? 'המכשיר מחובר.' : 'אין חיבור. העבודה נשמרת מקומית ותסתנכרן בהמשך.',
    });

    result.push({
      label: 'התחברות',
      status: profile ? 'ok' : 'warn',
      detail: profile ? `מחובר כ-${profile.fullName} (${profile.organizationName})` : 'אין פרופיל טעון.',
    });

    try {
      const db = await getDb();
      result.push({
        label: 'אחסון מקומי (IndexedDB)',
        status: 'ok',
        detail: `המסד המקומי פתוח: ${db.name} גרסה ${db.version}.`,
      });
    } catch (error) {
      result.push({
        label: 'אחסון מקומי (IndexedDB)',
        status: 'warn',
        detail: `המסד המקומי אינו זמין: ${error instanceof Error ? error.message : 'שגיאה לא ידועה'}`,
      });
    }

    const pending = await countPendingOperations().catch(() => 0);
    const failed = await countFailedOperations().catch(() => 0);
    result.push({
      label: 'תור הסנכרון',
      status: failed > 0 ? 'warn' : 'ok',
      detail: `${pending} פעולות ממתינות, ${failed} נכשלו. מצב: ${syncStatus.state}.`,
    });

    if (navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usedMb = Math.round(((estimate.usage ?? 0) / 1024 / 1024) * 10) / 10;
        const quotaMb = Math.round(((estimate.quota ?? 0) / 1024 / 1024) * 10) / 10;
        result.push({
          label: 'מקום פנוי במכשיר',
          status: 'ok',
          detail: `בשימוש ${usedMb}MB מתוך ${quotaMb}MB שהדפדפן מקצה.`,
        });
      } catch {
        result.push({ label: 'מקום פנוי במכשיר', status: 'unknown', detail: 'הדפדפן אינו מדווח.' });
      }
    }

    const lastSync = serverTimeLastSyncedAt();
    result.push({
      label: 'שעון מול השרת',
      status: Math.abs(getServerTimeOffset()) > 120_000 ? 'warn' : 'ok',
      detail: lastSync
        ? `פער של ${Math.round(getServerTimeOffset() / 1000)} שניות. סונכרן לאחרונה ${new Date(lastSync).toLocaleTimeString('he-IL')}.`
        : 'טרם בוצע סנכרון שעון מול השרת.',
    });

    const health = await pdfServiceHealth();
    result.push({
      label: 'שירות ההשלמה וה-PDF',
      status: health.ok ? 'ok' : 'warn',
      detail: health.detail,
    });

    result.push({
      label: 'שיתוף קבצים מהמכשיר',
      status: typeof navigator.share === 'function' ? 'ok' : 'unknown',
      detail:
        typeof navigator.share === 'function'
          ? 'תפריט השיתוף של המכשיר זמין.'
          : 'הדפדפן אינו תומך בשיתוף. ניתן להוריד את ה-PDF ולשלוח ידנית.',
    });

    result.push({
      label: 'התקנה כאפליקציה (PWA)',
      status: 'serviceWorker' in navigator ? 'ok' : 'unknown',
      detail:
        'serviceWorker' in navigator
          ? 'הדפדפן תומך בהתקנה ובעבודה ללא קליטה.'
          : 'הדפדפן אינו תומך ב-Service Worker.',
    });

    setChecks(result);
    setRunning(false);
  }, [profile, syncStatus.state]);

  useEffect(() => {
    void run();
  }, [run]);

  const icon = (status: Check['status']) =>
    status === 'ok' ? (
      <CheckCircle2 size={18} aria-hidden="true" />
    ) : status === 'warn' ? (
      <CircleAlert size={18} aria-hidden="true" />
    ) : (
      <CircleHelp size={18} aria-hidden="true" />
    );

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>בדיקת מערכת</h2>
        <p className="card-sub">
          כל שורה נבדקת עכשיו במכשיר הזה. זה המסך שעונה על „למה זה לא עובד אצלי”.
        </p>

        <ul className="plain-list">
          {checks.map((check) => (
            <li key={check.label} className={`diag-row tone-${check.status}`}>
              <span className="diag-icon" aria-hidden="true">
                {icon(check.status)}
              </span>
              <span className="diag-main">
                <strong>{check.label}</strong>
                <span className="small muted">{check.detail}</span>
              </span>
              <span className="visually-hidden">
                {check.status === 'ok' ? 'תקין' : check.status === 'warn' ? 'דורש תשומת לב' : 'לא ידוע'}
              </span>
            </li>
          ))}
        </ul>

        <button type="button" className="btn" onClick={() => void run()} disabled={running}>
          בדיקה מחדש
        </button>
      </section>
    </>
  );
}
