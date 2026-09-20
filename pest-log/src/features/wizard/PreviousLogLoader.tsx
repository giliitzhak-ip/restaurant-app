import { useEffect, useState } from 'react';
import { CopyPlus } from 'lucide-react';
import { useToast } from '@/state/ToastContext';
import { Alert } from '@/components/Common';
import { getSupabase } from '@/lib/supabase';
import { loadFromPreviousLog, type PreviousLogMode } from './loadPrevious';
import { formatDateHe } from '@/lib/time';
import { getString } from '@/lib/paths';
import type { DraftApi } from '@/state/useDraft';

/**
 * „יש יומן קודם לאותו לקוח” — הועבר מהגרסה הקודמת.
 *
 * טעינה מיומן קודם חוסכת הקלדה חוזרת של מה שלא משתנה, אבל אף פעם אינה
 * מעתיקה תאריך, שעה, חתימות, נ״צ, אצוות ומינונים: אלה נתוני הטיפול
 * הנוכחי בלבד.
 */
interface PreviousLog {
  id: string;
  serialNumber: number | null;
  completedAt: string | null;
  snapshot: Record<string, unknown>;
}

export function PreviousLogLoader({ draft }: { draft: DraftApi }): React.JSX.Element | null {
  const { content, replaceContent, readOnly } = draft;
  const { showToast } = useToast();
  const [previous, setPrevious] = useState<PreviousLog | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const clientId = getString(content, 'orderer.clientId');
  const clientName = getString(content, 'orderer.name');

  useEffect(() => {
    if (!clientId && clientName.trim().length < 2) {
      setPrevious(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        let query = getSupabase()
          .from('pest_logs')
          .select('id, serial_number, completed_at, snapshot')
          .eq('status', 'completed')
          .is('deleted_at', null)
          .order('completed_at', { ascending: false })
          .limit(1);
        query = clientId ? query.eq('client_id', clientId) : query.limit(20);
        const { data, error } = await query;
        if (error || cancelled) return;
        const rows = (data ?? []).map((row) => ({
          id: row.id as string,
          serialNumber: (row.serial_number as number | null) ?? null,
          completedAt: (row.completed_at as string | null) ?? null,
          snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
        }));
        const match = clientId
          ? rows[0]
          : rows.find((row) => {
              const orderer = (row.snapshot.orderer ?? {}) as Record<string, unknown>;
              return typeof orderer.name === 'string' && orderer.name.trim() === clientName.trim();
            });
        setPrevious(match ?? null);
      } catch {
        setPrevious(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, clientName]);

  if (readOnly || dismissed || !previous) return null;

  const load = (mode: PreviousLogMode) => {
    const { content: next, copied, cleared } = loadFromPreviousLog(previous.snapshot, content, mode);
    replaceContent(next);
    setDismissed(true);
    showToast(`נטען מיומן מס׳ ${previous.serialNumber ?? ''}: ${copied.join(', ')}`, 'success');
    globalThis.setTimeout(
      () => showToast(`לא הועתקו: ${cleared.join(', ')} — יש להזין אותם לטיפול הזה`, 'info'),
      2600,
    );
  };

  return (
    <Alert kind="info" title={`קיים יומן קודם ללקוח זה — מס׳ ${previous.serialNumber ?? ''}`}>
      <p className="small">
        {previous.completedAt ? `הושלם ${formatDateHe(previous.completedAt)}. ` : ''}
        אפשר לטעון ממנו כדי לא להקליד הכול מחדש. תאריך, שעה, חתימות, נ״צ, אצוות ומינונים לעולם אינם
        מועתקים.
      </p>
      <div className="btn-row btn-row-compact">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => load('all')}>
          <CopyPlus size={16} aria-hidden="true" /> טעינת הכול (מזיקים, מניעה, תכשירים, אזהרות)
        </button>
        <button type="button" className="btn btn-sm" onClick={() => load('applications')}>
          תכשירים בלבד
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setDismissed(true)}>
          לא עכשיו
        </button>
      </div>
    </Alert>
  );
}
