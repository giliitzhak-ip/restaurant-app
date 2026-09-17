'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Inset,
  LoadingState,
  SectionLabel,
  Switch,
} from '@/components/ui';
import { apiFetch, ApiRequestError } from '@/lib/client/api';

/**
 * Hours, in two layers (spec §9, §13, §50).
 *
 *   1. Am I accepting work RIGHT NOW?  — the switch, plus an optional end.
 *   2. When do I normally work?        — the weekly plan.
 *
 * The provider home carries layer 1 alone. This screen exists for layer 2 and
 * for the exceptions that a weekly plan cannot express: not today, not next
 * week, only until six. Everything here is a change to data the matching
 * engine reads directly — there is no separate "display" copy of the hours.
 */

interface Window {
  weekday: number;
  startsAt: string;
  endsAt: string;
}

interface Override {
  id: string;
  on_date: string;
  kind: string;
  starts_at: string | null;
  ends_at: string | null;
  note: string | null;
}

interface Payload {
  windows: { id: string; weekday: number; starts_at: string; ends_at: string }[];
  overrides: Override[];
  state: { state: 'OFFLINE' | 'ONLINE' | 'BUSY'; verification: string } | null;
  dayNames: string[];
  summary: {
    availableNow: boolean;
    openUntil: string | null;
    onlineUntil: string | null;
    nextAvailableAt: string | null;
  };
  phrase: string;
}

const DEFAULT_WINDOW = { startsAt: '08:00', endsAt: '17:00' };

/** Today's date in the platform timezone — the same zone the server evaluates in. */
function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year?.slice(2)}`;
}

export function AvailabilityEditor() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Window[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [vacationFrom, setVacationFrom] = useState('');
  const [vacationTo, setVacationTo] = useState('');

  const load = useCallback(async (): Promise<Payload | null> => {
    const fresh = await apiFetch<Payload>('/api/provider/availability');
    setData(fresh);
    setDraft(
      fresh.windows.map((w) => ({
        weekday: w.weekday,
        startsAt: w.starts_at.slice(0, 5),
        endsAt: w.ends_at.slice(0, 5),
      })),
    );
    return fresh;
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const fresh = await apiFetch<Payload>('/api/provider/availability');
        if (!alive) return;
        setData(fresh);
        setDraft(
          fresh.windows.map((w) => ({
            weekday: w.weekday,
            startsAt: w.starts_at.slice(0, 5),
            endsAt: w.ends_at.slice(0, 5),
          })),
        );
      } catch (caught) {
        if (alive) {
          setError(caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לטעון את השעות');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dayNames = data?.dayNames ?? ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const state = data?.state?.state ?? 'OFFLINE';

  /* The "until" quick action follows the provider's own plan where there is
     one: offering "until 18:00" to someone who works till 15:00 would be
     inventing a shift they never declared. */
  const plannedEndToday = useMemo(() => {
    const today = new Date().getDay();
    const ends = draft.filter((w) => w.weekday === today).map((w) => w.endsAt).sort();
    return ends.length ? ends[ends.length - 1] : null;
  }, [draft]);

  const untilTarget = plannedEndToday ?? '18:00';

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setActionError(null);
    setNotice(null);
    try {
      const message = await action();
      await load();
      setNotice(message);
    } catch (caught) {
      setActionError(caught instanceof ApiRequestError ? caught.message : 'הפעולה נכשלה');
    } finally {
      setBusy(null);
    }
  };

  const setSwitch = (next: boolean) =>
    void run('switch', async () => {
      await apiFetch('/api/provider/state', {
        method: 'POST',
        json: { state: next ? 'ONLINE' : 'OFFLINE' },
      });
      return next ? 'אתה מקבל עבודות' : 'הפסקת לקבל עבודות';
    });

  const onlineFor = (minutes: number) =>
    void run(`for-${minutes}`, async () => {
      await apiFetch('/api/provider/state', {
        method: 'POST',
        json: { state: 'ONLINE', forMinutes: minutes },
      });
      return `מקבל עבודות ל-${minutes / 60} שעות`;
    });

  const onlineUntil = (time: string) =>
    void run('until', async () => {
      await apiFetch('/api/provider/state', {
        method: 'POST',
        json: { state: 'ONLINE', untilLocalTime: time },
      });
      return `מקבל עבודות עד ${time}`;
    });

  const blockToday = () =>
    void run('block-today', async () => {
      const today = localToday();
      await apiFetch('/api/provider/availability', {
        method: 'POST',
        json: { onDate: today, kind: 'unavailable', note: 'לא זמין היום' },
      });
      // Both layers, because "not today" that leaves the switch on would send
      // work anyway for the next few minutes of tolerance.
      if (state === 'ONLINE') {
        await apiFetch('/api/provider/state', { method: 'POST', json: { state: 'OFFLINE' } });
      }
      return 'סימנו שאתה לא זמין היום';
    });

  const saveVacation = () =>
    void run('vacation', async () => {
      const result = await apiFetch<{ days: number }>('/api/provider/availability', {
        method: 'POST',
        json: {
          onDate: vacationFrom,
          untilDate: vacationTo || vacationFrom,
          kind: 'unavailable',
          note: 'חופשה',
        },
      });
      setVacationFrom('');
      setVacationTo('');
      return `נחסמו ${result.days} ימים`;
    });

  const removeOverride = (onDate: string) =>
    void run(`rm-${onDate}`, async () => {
      await apiFetch(`/api/provider/availability?onDate=${onDate}`, { method: 'DELETE' });
      return 'החריג הוסר — התאריך חזר לתוכנית השבועית';
    });

  const savePlan = () =>
    void run('plan', async () => {
      const result = await apiFetch<{ windows: number; days: number }>(
        '/api/provider/availability',
        { method: 'PUT', json: { windows: draft } },
      );
      return result.days === 0
        ? 'התוכנית רוקנה — הזמינות נקבעת עכשיו לפי המפסק בלבד'
        : `נשמרו ${result.windows} חלונות ב-${result.days} ימים`;
    });

  const dirty = useMemo(() => {
    if (!data) return false;
    const saved = data.windows
      .map((w) => `${w.weekday}|${w.starts_at.slice(0, 5)}|${w.ends_at.slice(0, 5)}`)
      .sort()
      .join(',');
    const current = [...draft]
      .map((w) => `${w.weekday}|${w.startsAt}|${w.endsAt}`)
      .sort()
      .join(',');
    return saved !== current;
  }, [data, draft]);

  const addWindow = (weekday: number) =>
    setDraft((prev) => [...prev, { weekday, ...DEFAULT_WINDOW }]);

  const removeWindow = (index: number) =>
    setDraft((prev) => prev.filter((_, i) => i !== index));

  const editWindow = (index: number, patch: Partial<Window>) =>
    setDraft((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  /** "Use these hours every day" — the single most common thing to want. */
  const copyToAllDays = (weekday: number) =>
    setDraft((prev) => {
      const source = prev.filter((w) => w.weekday === weekday);
      if (source.length === 0) return prev;
      return [0, 1, 2, 3, 4, 5, 6].flatMap((day) =>
        source.map((w) => ({ weekday: day, startsAt: w.startsAt, endsAt: w.endsAt })),
      );
    });

  if (loading) return <LoadingState label="טוען שעות…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <Link
          href="/provider"
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <span aria-hidden="true">›</span>
          חזרה
        </Link>
        <h1 className="text-base font-bold text-ink">שעות עבודה</h1>
      </header>

      {notice && (
        <p role="status" className="rounded-xl bg-ok/10 px-4 py-3 text-sm text-ok-bright">
          {notice}
        </p>
      )}
      {actionError && (
        <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad-bright">
          {actionError}
        </p>
      )}

      {/* ── Layer 1: right now ──────────────────────────────────────────── */}
      <section>
        <SectionLabel>עכשיו</SectionLabel>
        {state === 'BUSY' ? (
          <Card className="flex items-center justify-between gap-3">
            <p className="font-bold text-ink">בעבודה</p>
            <Badge tone="brand">עבודה פעילה</Badge>
          </Card>
        ) : (
          <>
            <Switch
              checked={state === 'ONLINE'}
              busy={busy === 'switch'}
              label="מקבל עבודות"
              detail={data?.phrase}
              onChange={setSwitch}
            />

            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="md"
                variant="secondary"
                loading={busy === 'for-120'}
                onClick={() => onlineFor(120)}
              >
                זמין לשעתיים
              </Button>
              <Button
                size="md"
                variant="secondary"
                loading={busy === 'until'}
                onClick={() => onlineUntil(untilTarget)}
              >
                זמין עד <span className="ltr-nums" dir="ltr">{untilTarget}</span>
              </Button>
              <Button
                size="md"
                variant="secondary"
                loading={busy === 'block-today'}
                onClick={blockToday}
              >
                לא זמין היום
              </Button>
            </div>

            {data?.summary.onlineUntil && (
              <p className="mt-2 text-[13px] text-ink-3">
                נכבה אוטומטית בסוף הזמן שקבעת — לא נשלח לך עבודות אחרי זה.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── Layer 2: the weekly plan ───────────────────────────────────── */}
      <section>
        <SectionLabel>התוכנית השבועית</SectionLabel>
        <Card className="space-y-2.5">
          {draft.length === 0 && (
            <p className="text-sm text-ink-2">
              לא הגדרת שעות. במצב הזה הזמינות שלך נקבעת לפי המפסק למעלה בלבד,
              ולא נוכל לשבץ לך תורים מתוכננים.
            </p>
          )}

          {dayNames.map((name, weekday) => {
            const windows = draft
              .map((w, index) => ({ ...w, index }))
              .filter((w) => w.weekday === weekday);

            return (
              <div key={weekday} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{name}</p>
                  <div className="flex items-center gap-1">
                    {windows.length > 0 && (
                      <button
                        type="button"
                        onClick={() => copyToAllDays(weekday)}
                        className="min-h-11 rounded-lg px-2 text-[12.5px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink"
                      >
                        לכל הימים
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => addWindow(weekday)}
                      aria-label={`הוספת חלון ביום ${name}`}
                      className="inline-flex size-11 items-center justify-center rounded-lg text-brand-bright hover:bg-surface-2"
                    >
                      +
                    </button>
                  </div>
                </div>

                {windows.length === 0 ? (
                  <p className="text-[13px] text-ink-3">לא עובד</p>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    {windows.map((w) => (
                      <div key={w.index} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={w.startsAt}
                          aria-label={`שעת התחלה ביום ${name}`}
                          onChange={(event) =>
                            editWindow(w.index, { startsAt: event.target.value })
                          }
                          className="ltr-nums min-h-11 flex-1 rounded-lg border border-line-strong bg-surface-2 px-2 text-center text-[15px] text-ink"
                          dir="ltr"
                        />
                        <span aria-hidden="true" className="text-ink-3">–</span>
                        <input
                          type="time"
                          value={w.endsAt}
                          aria-label={`שעת סיום ביום ${name}`}
                          onChange={(event) => editWindow(w.index, { endsAt: event.target.value })}
                          className="ltr-nums min-h-11 flex-1 rounded-lg border border-line-strong bg-surface-2 px-2 text-center text-[15px] text-ink"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => removeWindow(w.index)}
                          aria-label={`הסרת החלון ${w.startsAt} עד ${w.endsAt} ביום ${name}`}
                          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-bad-bright"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        <Button
          fullWidth
          className="mt-3"
          disabled={!dirty}
          loading={busy === 'plan'}
          onClick={savePlan}
        >
          {dirty ? 'שמור תוכנית' : 'התוכנית שמורה'}
        </Button>
      </section>

      {/* ── Exceptions ─────────────────────────────────────────────────── */}
      <section>
        <SectionLabel>חופשה וחריגים</SectionLabel>
        <Card className="space-y-3">
          <div className="flex items-end gap-2">
            <label className="flex-1 text-[13px] text-ink-2">
              מתאריך
              <input
                type="date"
                value={vacationFrom}
                min={localToday()}
                onChange={(event) => setVacationFrom(event.target.value)}
                className="ltr-nums mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface-2 px-2 text-[15px] text-ink"
                dir="ltr"
              />
            </label>
            <label className="flex-1 text-[13px] text-ink-2">
              עד
              <input
                type="date"
                value={vacationTo}
                min={vacationFrom || localToday()}
                onChange={(event) => setVacationTo(event.target.value)}
                className="ltr-nums mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface-2 px-2 text-[15px] text-ink"
                dir="ltr"
              />
            </label>
          </div>
          <Button
            fullWidth
            size="md"
            variant="secondary"
            disabled={!vacationFrom}
            loading={busy === 'vacation'}
            onClick={saveVacation}
          >
            חסום את התאריכים
          </Button>

          {(data?.overrides.length ?? 0) > 0 && (
            <Inset className="space-y-1.5">
              {data?.overrides.map((override) => (
                <div key={override.id} className="flex items-center justify-between gap-2">
                  <p className="text-sm text-ink">
                    <span className="ltr-nums" dir="ltr">
                      {formatDate(override.on_date)}
                    </span>
                    {' · '}
                    {override.kind === 'unavailable' ? (
                      <span className="text-ink-2">לא זמין</span>
                    ) : (
                      <span className="ltr-nums text-ink-2" dir="ltr">
                        {override.starts_at?.slice(0, 5)}–{override.ends_at?.slice(0, 5)}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeOverride(override.on_date)}
                    aria-label={`הסרת החריג בתאריך ${formatDate(override.on_date)}`}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-bad-bright"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </Inset>
          )}
        </Card>
      </section>
    </div>
  );
}
