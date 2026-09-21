'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { updateSettingAction } from '@/app/actions/admin-misc'

export function SettingsForm({ settingKey, label, value }: { settingKey: string; label: string; value: unknown }) {
  const [current, setCurrent] = useState(value)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(next: unknown) {
    setCurrent(next)
    setError(null)
    startTransition(async () => {
      const result = await updateSettingAction(settingKey, String(next))
      if (!result.ok) {
        setError(result.error ?? 'השמירה נכשלה')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    })
  }

  const inputId = `setting-${settingKey}`

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
      <label htmlFor={inputId} className="min-w-52 flex-1 text-sm text-ink-700">
        {label}
        <span className="block text-[11px] text-ink-400" dir="ltr">{settingKey}</span>
      </label>

      {typeof current === 'boolean' ? (
        <input
          id={inputId}
          type="checkbox"
          checked={current}
          disabled={pending}
          onChange={(e) => save(e.target.checked)}
          className="size-5 rounded accent-brand-700"
        />
      ) : (
        <input
          id={inputId}
          type={typeof current === 'number' ? 'number' : 'text'}
          defaultValue={String(current ?? '')}
          disabled={pending}
          onBlur={(e) => { if (e.target.value !== String(current)) save(typeof current === 'number' ? Number(e.target.value) : e.target.value) }}
          className="h-9 w-48 rounded-lg border border-ink-200 px-2.5 text-sm"
        />
      )}

      {saved && <Check className="size-4 text-brand-600" aria-label="נשמר" />}
      {error && <span role="alert" className="text-xs font-medium text-red-600">{error}</span>}
    </div>
  )
}
