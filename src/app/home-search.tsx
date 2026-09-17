'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, inputClasses } from '@/components/ui';

interface Category {
  slug: string;
  name_he: string;
  supports_now: boolean;
}

const EXAMPLES = [
  'יש לי נזילה מתחת לכיור',
  'המזגן לא מקרר',
  'ננעלתי מחוץ לבית',
  'אני צריך הדברה',
];

/**
 * The single input that starts everything (spec §7).
 *
 * The customer is never asked to pick a technical service category — they
 * describe the problem and the server classifies it. The three buttons map
 * to the three booking modes (spec §6).
 */
export function HomeSearch({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [description, setDescription] = useState('');
  const [pending, startTransition] = useTransition();

  const go = (mode: 'NOW' | 'SCHEDULE' | 'COMPARE') => {
    const text = description.trim();
    const params = new URLSearchParams({ mode });
    if (text) params.set('q', text);
    startTransition(() => router.push(`/request?${params.toString()}`));
  };

  return (
    <div className="mt-6 space-y-4">
      <div>
        <label htmlFor="problem" className="sr-only">
          תארו מה קרה
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
      </div>

      {/* Examples are tappable: the fastest path is often "that's my problem". */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setDescription(example)}
            className="inline-flex min-h-11 items-center rounded-full border border-navy-600 bg-navy-900 px-4 text-sm text-slate-300 hover:border-accent-500 hover:text-white"
          >
            {example}
          </button>
        ))}
      </div>

      <div className="space-y-3 pt-2">
        <Button
          size="xl"
          fullWidth
          loading={pending}
          onClick={() => go('NOW')}
          disabled={description.trim().length < 3}
        >
          צריך בעל מקצוע עכשיו
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={() => go('SCHEDULE')}
            disabled={description.trim().length < 3}
          >
            קבע למועד אחר
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => go('COMPARE')}
            disabled={description.trim().length < 3}
          >
            עבודה גדולה
          </Button>
        </div>
        {description.trim().length < 3 && (
          <p className="text-center text-sm text-slate-500">
            כתבו כמה מילים על התקלה כדי להמשיך
          </p>
        )}
      </div>

      {categories.length > 0 && (
        <nav aria-label="תחומים פופולריים" className="pt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-400">או בחרו תחום</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.slug}
                type="button"
                onClick={() => {
                  const params = new URLSearchParams({
                    mode: category.supports_now ? 'NOW' : 'SCHEDULE',
                    category: category.slug,
                  });
                  if (description.trim()) params.set('q', description.trim());
                  startTransition(() => router.push(`/request?${params.toString()}`));
                }}
                className="inline-flex min-h-11 items-center rounded-xl border border-navy-700 bg-navy-900 px-4 text-sm font-medium text-slate-200 hover:border-accent-500"
              >
                {category.name_he}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
