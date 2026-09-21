'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Play, Trash2, CheckCircle2, XCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatAgorot } from '@/lib/money'
import { runSimulationAction, purgeSimulationAction } from '@/app/actions/simulator'
import type { SimulationReport } from '@/lib/simulator/engine'
import type { ScenarioDefinition, ScenarioKey } from '@/lib/simulator/scenarios'
import type { SimulationSummary } from '@/lib/simulator/purge'

export function SimulatorPanel({
  enabled,
  scenarios,
  summary,
  sellableProducts,
}: {
  enabled: boolean
  scenarios: ScenarioDefinition[]
  summary: SimulationSummary
  sellableProducts: number
}) {
  const [count, setCount] = useState('25')
  const [spreadDays, setSpreadDays] = useState('30')
  const [seed, setSeed] = useState('')
  const [selected, setSelected] = useState<Set<ScenarioKey>>(new Set())
  const [report, setReport] = useState<SimulationReport | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function toggle(key: ScenarioKey) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function run() {
    setMessage(null)
    setReport(null)
    startTransition(async () => {
      const result = await runSimulationAction({
        count: Number(count),
        spreadDays: Number(spreadDays),
        scenarios: [...selected],
        seed: seed === '' ? '' : Number(seed),
      })
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? 'ההרצה נכשלה' })
        return
      }
      setReport(result.report ?? null)
      setMessage({ tone: 'ok', text: `נוצרו ${result.report?.created ?? 0} תרחישים` })
      router.refresh()
    })
  }

  function purge() {
    setMessage(null)
    startTransition(async () => {
      const result = await purgeSimulationAction(confirmation)
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? 'המחיקה נכשלה' })
        return
      }
      setReport(null)
      setConfirmation('')
      setMessage({
        tone: 'ok',
        text: `נמחקו ${result.result?.orders ?? 0} הזמנות, ${result.result?.customers ?? 0} לקוחות ו-${result.result?.carts ?? 0} עגלות. המלאי הוחזר.`,
      })
      router.refresh()
    })
  }

  const scenarioLabel = (key: string) => scenarios.find((s) => s.key === key)?.label ?? key

  return (
    <div className="space-y-6">
      {message && (
        <p
          role="alert"
          className={`rounded-xl px-4 py-3 text-sm font-medium ${message.tone === 'ok' ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'}`}
        >
          {message.text}
        </p>
      )}

      {/* Current simulated footprint */}
      <section className="rounded-card border border-ink-200 bg-white p-5">
        <h2 className="text-sm font-bold text-ink-900">נתוני סימולציה במערכת כרגע</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ['הזמנות', String(summary.orders)],
            ['לקוחות', String(summary.customers)],
            ['עגלות', String(summary.carts)],
            ['״הכנסות״ מדומות', formatAgorot(summary.revenue)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-ink-500">{label}</dt>
              <dd className="mt-0.5 text-lg font-bold text-ink-900">{value}</dd>
            </div>
          ))}
        </dl>
        {summary.orders > 0 && (
          <p className="mt-3 text-xs text-ink-500">
            הנתונים האלה נכללים בדשבורד ובמסך ההזמנות ומסומנים כ״סימולציה״.{' '}
            <Link href="/admin/orders?simulated=1" className="font-medium text-brand-700 underline">
              לצפייה בהזמנות הסימולציה
            </Link>
          </p>
        )}
      </section>

      {/* Run */}
      <section className="rounded-card border border-ink-200 bg-white p-5">
        <h2 className="text-sm font-bold text-ink-900">הרצת סימולציה</h2>
        <p className="mt-1 text-xs text-ink-500">
          {sellableProducts} מוצרים מפורסמים זמינים להזמנה. ללא בחירת תרחישים תרוץ תערובת משוקללת.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="כמות תרחישים" htmlFor="sim-count" hint="1–200">
            <Input id="sim-count" type="number" min={1} max={200} value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
          <Field label="פיזור לאחור (ימים)" htmlFor="sim-days" hint="0 = הכול היום">
            <Input id="sim-days" type="number" min={0} max={365} value={spreadDays} onChange={(e) => setSpreadDays(e.target.value)} />
          </Field>
          <Field label="Seed (אופציונלי)" htmlFor="sim-seed" hint="אותו seed מייצר בדיוק אותה ריצה">
            <Input id="sim-seed" type="number" min={0} dir="ltr" value={seed} onChange={(e) => setSeed(e.target.value)} />
          </Field>
        </div>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold text-ink-700">תרחישים</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {scenarios.map((scenario) => (
              <label
                key={scenario.key}
                className="flex cursor-pointer gap-2.5 rounded-xl border border-ink-200 p-3 transition-colors hover:border-brand-300"
              >
                <input
                  type="checkbox"
                  checked={selected.has(scenario.key)}
                  onChange={() => toggle(scenario.key)}
                  className="mt-0.5 size-4 shrink-0 rounded accent-brand-700"
                />
                <span>
                  <span className="block text-sm font-medium text-ink-900">{scenario.label}</span>
                  <span className="block text-xs leading-relaxed text-ink-500">{scenario.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button size="lg" className="mt-5" disabled={!enabled || pending} onClick={run}>
          <Play className="size-4" aria-hidden />
          {pending ? 'מריץ…' : 'הרצת סימולציה'}
        </Button>
      </section>

      {/* Report */}
      {report && (
        <section className="rounded-card border border-ink-200 bg-white">
          <div className="border-b border-ink-100 px-5 py-4">
            <h2 className="text-sm font-bold text-ink-900">תוצאות הריצה</h2>
            <p className="mt-1 text-xs text-ink-500">
              seed <span dir="ltr" className="font-mono">{report.seed}</span> · {report.created} הצליחו · {report.failed} נכשלו
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(report.byScenario).map(([key, value]) => (
                <Badge key={key} tone="neutral">{scenarioLabel(key)}: {value}</Badge>
              ))}
            </div>
          </div>

          {report.warnings.length > 0 && (
            <ul className="border-b border-ink-100 bg-amber-50 px-5 py-3 text-xs text-amber-900">
              {report.warnings.map((warning) => (
                <li key={warning} className="flex gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {warning}
                </li>
              ))}
            </ul>
          )}

          <ul className="max-h-96 divide-y divide-ink-100 overflow-auto">
            {report.outcomes.map((outcome, index) => (
              <li key={`${outcome.orderNumber ?? 'x'}-${index}`} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                {outcome.ok
                  ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-label="הצליח" />
                  : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="נכשל" />}
                <span className="w-36 shrink-0 text-xs font-medium text-ink-700">{scenarioLabel(outcome.scenario)}</span>
                {outcome.orderNumber && (
                  <span className="shrink-0 text-xs text-ink-400" dir="ltr">{outcome.orderNumber}</span>
                )}
                <span className="text-xs text-ink-600">{outcome.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Purge */}
      <section className="rounded-card border border-red-200 bg-white p-5">
        <h2 className="text-sm font-bold text-ink-900">מחיקת נתוני הסימולציה</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          מוחק את כל ההזמנות, הלקוחות, העגלות והתשלומים שנוצרו בסימולציה, ומחזיר את המלאי שנצרך.
          הזמנות אמיתיות אינן מושפעות. הפעולה אינה הפיכה.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="הקלידו ״מחק״ לאישור" htmlFor="sim-confirm">
            <Input id="sim-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="w-40" />
          </Field>
          <Button variant="danger" disabled={pending || summary.orders + summary.carts === 0} onClick={purge}>
            <Trash2 className="size-4" aria-hidden />
            מחיקת נתוני סימולציה
          </Button>
        </div>
      </section>
    </div>
  )
}
