'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Segmented, inputClasses } from '@/components/ui';

export type Timing = 'NOW' | 'ASAP' | 'SCHEDULED';

const EXAMPLES = [
  'יש לי נזילה מתחת לכיור',
  'המזגן לא מקרר',
  'ננעלתי מחוץ לבית',
  'אני צריך הדברה',
];

const TIMING_OPTIONS = [
  { value: 'NOW' as const, label: 'עכשיו', hint: 'מיד' },
  { value: 'ASAP' as const, label: 'היום', hint: 'בהקדם' },
  { value: 'SCHEDULED' as const, label: 'בתאריך', hint: 'אני אבחר' },
];

/**
 * The whole request, on one screen (spec §5, §6, §18).
 *
 * Two questions: WHAT happened, and WHEN. Nothing else is asked, because
 * nothing else has to be: the trade is classified from the description on the
 * server, the radius comes from who is actually reachable, and a customer who
 * has not met anyone yet has no basis for a rating filter. Asking would look
 * like thoroughness and function as an obstacle.
 *
 * Timing is not cosmetic. It is carried into matching and decides which
 * providers are eligible at all — "now" is answered by the realtime switch,
 * a chosen time by the weekly plan (spec §52).
 */
export function HomeSearch({ minScheduleValue }: { minScheduleValue: string }) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [timing, setTiming] = useState<Timing>('NOW');
  const [requestedFor, setRequestedFor] = useState('');
  const [pending, startTransition] = useTransition();

  const ready =
    description.trim().length >= 3 && (timing !== 'SCHEDULED' || requestedFor.length > 0);

  const go = () => {
    const params = new URLSearchParams({ q: description.trim(), timing });
    if (timing === 'SCHEDULED' && requestedFor) params.set('at', requestedFor);
    startTransition(() => router.push(`/request?${params.toString()}`));
  };

  return (
    <div className="mt-7 space-y-7">
      <section>
        <label htmlFor="problem" className="mb-2.5 block text-lg font-bold text-ink">
          מה צריך?
        </label>
        <textarea
          id="problem"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="כתבו מה קרה…"
          rows={3}
          maxLength={2000}
          autoComplete="off"
          className={`${inputClasses} resize-none text-lg`}
        />

        {/* Tappable examples: the fastest path is often "that's my problem". */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setDescription(example)}
              className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface-1 px-3.5 text-[13px] text-ink-2 hover:border-brand hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2.5 text-lg font-bold text-ink">מתי?</p>
        <Segmented options={TIMING_OPTIONS} value={timing} onChange={setTiming} label="מתי" />

        {/* The picker appears only once a specific time is actually wanted. */}
        {timing === 'SCHEDULED' && (
          <div className="mt-2.5">
            <label htmlFor="when" className="sr-only">
              מועד מבוקש
            </label>
            <input
              id="when"
              type="datetime-local"
              dir="ltr"
              className={`${inputClasses} ltr-nums`}
              value={requestedFor}
              min={minScheduleValue || undefined}
              onChange={(event) => setRequestedFor(event.target.value)}
            />
          </div>
        )}
      </section>

      <section>
        <Button size="xl" fullWidth loading={pending} disabled={!ready} onClick={go}>
          מצא לי מקצוען
        </Button>
        <p className="mt-2.5 text-center text-[13px] text-ink-3">
          {description.trim().length < 3
            ? 'כתבו כמה מילים על התקלה כדי להמשיך'
            : timing === 'SCHEDULED' && !requestedFor
              ? 'בחרו מועד כדי להמשיך'
              : 'לא תחויבו עד שתאשרו את המקצוען והמחיר.'}
        </p>
      </section>
    </div>
  );
}
