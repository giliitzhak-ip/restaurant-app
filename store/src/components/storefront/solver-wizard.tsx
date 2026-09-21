'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Phone, Info } from 'lucide-react'
import { ProductCard } from './product-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import type { SolverQuestionView, SolverResult } from '@/lib/solver/service'

/**
 * Progressive disclosure: one question at a time, answers held in the URL so
 * the step is shareable and the back button works.
 */
export function SolverWizard({
  pestSlug,
  questions,
  answers,
  result,
}: {
  pestSlug: string
  questions: SolverQuestionView[]
  answers: Record<string, string>
  result: SolverResult | null
}) {
  const router = useRouter()
  const params = useSearchParams()

  const currentIndex = questions.findIndex((q) => !answers[q.key])
  const current = currentIndex === -1 ? null : questions[currentIndex]

  function choose(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    next.set(key, value)
    router.push(`/solver/${pestSlug}?${next.toString()}`, { scroll: false })
  }

  function restart() {
    router.push(`/solver/${pestSlug}`)
  }

  if (current) {
    return (
      <div className="mt-8">
        <p className="text-xs font-semibold text-brand-700">
          שאלה {currentIndex + 1} מתוך {questions.length}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-ink-100" role="progressbar" aria-valuenow={currentIndex} aria-valuemin={0} aria-valuemax={questions.length}>
          <div className="h-full bg-brand-600 transition-[width] duration-500" style={{ width: `${(currentIndex / questions.length) * 100}%` }} />
        </div>

        <fieldset className="mt-6">
          <legend className="text-lg font-bold text-ink-900">{current.prompt}</legend>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {current.options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => choose(current.key, option.value)}
                className="rounded-xl border border-ink-200 bg-white px-4 py-3.5 text-start text-sm font-medium text-ink-800 transition-all hover:-translate-y-0.5 hover:border-brand-400 hover:bg-brand-50 hover:shadow-soft"
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        {currentIndex > 0 && (
          <button type="button" onClick={restart} className="mt-6 text-sm font-medium text-ink-500 underline">
            התחלה מחדש
          </button>
        )}
      </div>
    )
  }

  if (!result) return null

  return (
    <div className="mt-10 space-y-10">
      {result.needsProfessional && (
        <div className="rounded-card border border-amber-200 bg-amber-50 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <Phone className="size-5 text-amber-600" aria-hidden />
            הבעיה דורשת בדיקה מקצועית
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">
            לפי התשובות שמסרתם, מדובר בהיקף שמומלץ לבדוק מול גורם מקצועי לפני טיפול עצמאי.
            אנחנו לא מספקים אבחון, וניתן לפנות אלינו כדי שנפנה אתכם להמשך בירור.
          </p>
        </div>
      )}

      <div className="rounded-xl bg-ink-50 p-4 text-xs leading-relaxed text-ink-600">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          ההמלצות מבוססות על התשובות שלכם ועל נתוני המוצרים שאומתו במערכת. יש לקרוא את הוראות היצרן ולפעול לפיהן.
        </p>
      </div>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-ink-900">מוצרים מומלצים</h2>
        {result.recommended.length === 0 ? (
          <EmptyState
            className="mt-5"
            title="עדיין אין מוצר מפורסם שמתאים לשילוב הזה"
            description="הקטלוג מתעדכן. אפשר להשאיר פרטים ונעדכן כשיתפרסם פתרון מתאים, או לפנות לשירות הלקוחות."
            action={<Link href="/"><Button variant="outline">חזרה לחנות</Button></Link>}
          />
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {result.recommended.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      {result.complementary.length > 0 && (
        <section>
          <h2 className="text-xl font-bold tracking-tight text-ink-900">מוצרים משלימים</h2>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {result.complementary.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <button type="button" onClick={restart} className="text-sm font-medium text-brand-700 underline">
        מענה מחדש על השאלות
      </button>
    </div>
  )
}
