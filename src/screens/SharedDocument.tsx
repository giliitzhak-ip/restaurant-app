import { useEffect, useState } from 'react';
import { Card, EmptyState, Notice } from '../components/ui';
import { DocumentView, type DocumentSources } from './JournalDocument';
import { apiUrl } from '../lib/config';
import type { JournalSnapshot } from '../types';

interface SharedPayload {
  businessName: string;
  expiresAt: string;
  snapshot: JournalSnapshot;
}

/**
 * מסמך שהתקבל בקישור ללקוח.
 *
 * אין כאן התחברות ואין חנות מקומית: הנתונים מגיעים מהשרת לפי
 * אסימון, ומוצגים לקריאה בלבד. אין אפשרות לערוך, ואין גישה
 * לשום יומן אחר של העסק.
 */
export function SharedDocument({ token }: { token?: string }) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: SharedPayload }
  >(() => (token ? { kind: 'loading' } : { kind: 'error', message: 'הקישור חסר.' }));

  useEffect(() => {
    if (!token) return;   // מצב הכשל נקבע כבר באתחול
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/api/doc/${encodeURIComponent(token)}`));
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setState({
            kind: 'error',
            message: body.errors?.[0] ?? 'הקישור אינו פעיל.',
          });
          return;
        }
        setState({ kind: 'ready', data: body as SharedPayload });
      } catch {
        if (!cancelled) {
          setState({ kind: 'error', message: 'אין חיבור לשרת. יש לנסות שוב מאוחר יותר.' });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (state.kind === 'loading') {
    return (
      <div className="app-shell" dir="rtl" lang="he">
        <main className="page"><p className="muted">טוען את המסמך…</p></main>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="app-shell" dir="rtl" lang="he">
        <main className="page">
          <Card><EmptyState icon="⚠" title={state.message} /></Card>
        </main>
      </div>
    );
  }

  const { snapshot, businessName, expiresAt } = state.data;
  const sources: DocumentSources = {
    full: snapshot.full,
    snapshot,
    materials: snapshot.materials,
    treatmentTemplates: snapshot.treatmentTemplates,
    findLabel: (id) => snapshot.materialLabels.find((l) => l.materialId === id),
    customer: snapshot.customer,
  };

  return (
    <div className="app-shell" dir="rtl" lang="he">
      <main className="page">
        <div className="no-print mb-3">
          <Notice kind="info" title={businessName || 'מסמך הדברה'}>
            זה מסמך לקריאה בלבד שנשלח אליכם. הוא מופק מצילום שנשמר בעת סיום העבודה.
            הקישור פעיל עד {new Date(expiresAt).toLocaleDateString('he-IL')}.
          </Notice>
        </div>
        <DocumentView sources={sources} toolbar={<span />} />
      </main>
    </div>
  );
}
