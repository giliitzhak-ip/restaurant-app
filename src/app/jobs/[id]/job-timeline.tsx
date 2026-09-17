'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, Spinner } from '@/components/ui';
import { apiFetch } from '@/lib/client/api';

interface TimelineEvent {
  id: string;
  from_status: string | null;
  to_status: string;
  actor_role: string | null;
  actor_name: string | null;
  reason: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'הבקשה נוצרה',
  SEARCHING: 'החיפוש התחיל',
  OFFERS_AVAILABLE: 'נשלחו הצעות למקצוענים',
  PROVIDER_SELECTED: 'מקצוען אישר את הקריאה',
  CONFIRMED: 'הלקוח אישר',
  EN_ROUTE: 'המקצוען יצא לדרך',
  ARRIVED: 'המקצוען הגיע',
  IN_PROGRESS: 'העבודה החלה',
  AWAITING_CUSTOMER_CONFIRMATION: 'העבודה הושלמה — ממתין לאישור',
  COMPLETED: 'העבודה אושרה',
  PAID: 'התשלום נקלט',
  REVIEWED: 'דירוג הוגש',
  CANCELLED_BY_CUSTOMER: 'בוטל על ידי הלקוח',
  CANCELLED_BY_PROVIDER: 'בוטל על ידי המקצוען',
  CANCELLED_BY_SYSTEM: 'בוטל על ידי המערכת',
  DISPUTED: 'נפתחה מחלוקת',
};

/** Timestamps stay LTR so 14:32 is never reordered (spec §40). */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export function JobTimeline({ jobId, refreshKey }: { jobId: string; refreshKey: string }) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<{ events: TimelineEvent[] }>(`/api/jobs/${jobId}/timeline`);
      setEvents(result.events);
    } catch {
      setEvents([]);
    }
  }, [jobId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load, refreshKey]);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-start"
      >
        <span className="text-sm font-semibold text-slate-300">מה קרה עד כה</span>
        <span aria-hidden="true" className="text-slate-500">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="mt-4">
          {events === null ? (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Spinner className="size-4" /> טוען…
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-slate-500">אין עדיין אירועים.</p>
          ) : (
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <time
                    className="ltr-nums shrink-0 text-sm text-slate-500"
                    dir="ltr"
                    dateTime={event.created_at}
                  >
                    {timeOf(event.created_at)}
                  </time>
                  <div>
                    <p className="text-sm text-slate-200">
                      {STATUS_LABEL[event.to_status] ?? event.to_status}
                    </p>
                    {event.reason && <p className="text-xs text-slate-500">{event.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}
