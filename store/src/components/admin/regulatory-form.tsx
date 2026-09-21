'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Select, Field } from '@/components/ui/input'
import { REGULATORY_STATUS_LABELS } from '@/lib/catalog/status'
import { updateRegulatoryAction } from '@/app/actions/regulatory'
import type { RegulatoryStatus } from '@/generated/prisma/enums'

export interface RegulatoryFormValues {
  status: RegulatoryStatus
  publicUseAllowed: 'unknown' | 'yes' | 'no'
  registrationNumber: string
  registrationAuthority: string
  labelUrl: string
  labelVersion: string
  labelVerifiedAt: string
  expiresAt: string
  sourceOfInformation: string
  targetPests: string
  allowedLocations: string
  usageInstructions: string
  warnings: string
  humanWarnings: string
  animalWarnings: string
  reentryTime: string
  storageInstructions: string
  disposalInstructions: string
  notes: string
}

export function RegulatoryForm({
  productId,
  initial,
  canVerify,
}: {
  productId: string
  initial: RegulatoryFormValues
  canVerify: boolean
}) {
  const [values, setValues] = useState(initial)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string; blockers?: string[] } | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const set = <K extends keyof RegulatoryFormValues>(key: K, value: RegulatoryFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <form
      className="space-y-7"
      onSubmit={(event) => {
        event.preventDefault()
        setMessage(null)
        startTransition(async () => {
          const result = await updateRegulatoryAction(productId, values)
          if (!result.ok) {
            setMessage({ tone: 'error', text: result.error ?? 'השמירה נכשלה', blockers: result.blockers })
            return
          }
          setMessage({ tone: 'ok', text: 'הרשומה נשמרה' })
          router.refresh()
        })
      }}
    >
      {message && (
        <div role="alert" className={`rounded-xl px-4 py-3 text-sm ${message.tone === 'ok' ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-700'}`}>
          <p className="font-medium">{message.text}</p>
          {message.blockers && (
            <ul className="mt-1.5 list-disc ps-5">
              {message.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="סטטוס רגולטורי" htmlFor="status">
          <Select id="status" value={values.status} onChange={(e) => set('status', e.target.value as RegulatoryStatus)}>
            {(Object.keys(REGULATORY_STATUS_LABELS) as RegulatoryStatus[]).map((key) => (
              <option key={key} value={key} disabled={key === 'VERIFIED_PUBLIC_USE' && !canVerify}>
                {REGULATORY_STATUS_LABELS[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="מותר לשימוש הקהל הרחב" htmlFor="publicUseAllowed" hint="נדרש אימות מול התווית הרשמית">
          <Select id="publicUseAllowed" value={values.publicUseAllowed} onChange={(e) => set('publicUseAllowed', e.target.value as RegulatoryFormValues['publicUseAllowed'])}>
            <option value="unknown">לא ידוע / ממתין לעדכון</option>
            <option value="yes">כן — מאומת</option>
            <option value="no">לא</option>
          </Select>
        </Field>
        <Field label="מספר רישום" htmlFor="registrationNumber">
          <Input id="registrationNumber" dir="ltr" value={values.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)} />
        </Field>
        <Field label="רשות הרישום" htmlFor="registrationAuthority">
          <Input id="registrationAuthority" value={values.registrationAuthority} onChange={(e) => set('registrationAuthority', e.target.value)} />
        </Field>
        <Field label="קישור לתווית" htmlFor="labelUrl">
          <Input id="labelUrl" type="url" dir="ltr" value={values.labelUrl} onChange={(e) => set('labelUrl', e.target.value)} />
        </Field>
        <Field label="גרסת תווית" htmlFor="labelVersion">
          <Input id="labelVersion" dir="ltr" value={values.labelVersion} onChange={(e) => set('labelVersion', e.target.value)} />
        </Field>
        <Field label="תאריך אימות תווית" htmlFor="labelVerifiedAt">
          <Input id="labelVerifiedAt" type="date" value={values.labelVerifiedAt} onChange={(e) => set('labelVerifiedAt', e.target.value)} />
        </Field>
        <Field label="תפוגת אימות" htmlFor="expiresAt">
          <Input id="expiresAt" type="date" value={values.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
        </Field>
        <Field label="מקור המידע" htmlFor="sourceOfInformation" className="sm:col-span-2" hint="לדוגמה: תווית יצרן שהתקבלה מהספק בתאריך…">
          <Input id="sourceOfInformation" value={values.sourceOfInformation} onChange={(e) => set('sourceOfInformation', e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="מזיקי מטרה" htmlFor="targetPests" hint="שורה לכל מזיק — רק כפי שמופיע בתווית">
          <Textarea id="targetPests" rows={4} value={values.targetPests} onChange={(e) => set('targetPests', e.target.value)} />
        </Field>
        <Field label="מקומות שימוש מאושרים" htmlFor="allowedLocations" hint="שורה לכל מקום">
          <Textarea id="allowedLocations" rows={4} value={values.allowedLocations} onChange={(e) => set('allowedLocations', e.target.value)} />
        </Field>
      </div>

      <Field label="אופן השימוש" htmlFor="usageInstructions">
        <Textarea id="usageInstructions" rows={4} value={values.usageInstructions} onChange={(e) => set('usageInstructions', e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="אזהרות כלליות" htmlFor="warnings">
          <Textarea id="warnings" rows={4} value={values.warnings} onChange={(e) => set('warnings', e.target.value)} />
        </Field>
        <Field label="אזהרות לבני אדם" htmlFor="humanWarnings">
          <Textarea id="humanWarnings" rows={4} value={values.humanWarnings} onChange={(e) => set('humanWarnings', e.target.value)} />
        </Field>
        <Field label="אזהרות לבעלי חיים" htmlFor="animalWarnings">
          <Textarea id="animalWarnings" rows={4} value={values.animalWarnings} onChange={(e) => set('animalWarnings', e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="זמן המתנה לחזרה" htmlFor="reentryTime">
          <Input id="reentryTime" value={values.reentryTime} onChange={(e) => set('reentryTime', e.target.value)} />
        </Field>
        <Field label="הוראות אחסון" htmlFor="storageInstructions">
          <Input id="storageInstructions" value={values.storageInstructions} onChange={(e) => set('storageInstructions', e.target.value)} />
        </Field>
        <Field label="הוראות השלכה" htmlFor="disposalInstructions">
          <Input id="disposalInstructions" value={values.disposalInstructions} onChange={(e) => set('disposalInstructions', e.target.value)} />
        </Field>
      </div>

      <Field label="הערות פנימיות" htmlFor="notes">
        <Textarea id="notes" rows={3} value={values.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      <Button type="submit" size="lg" disabled={pending}>{pending ? 'שומר…' : 'שמירת הרשומה'}</Button>
    </form>
  )
}
