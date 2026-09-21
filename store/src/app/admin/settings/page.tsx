import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { getSettings } from '@/lib/settings'
import { DEFAULT_SETTINGS } from '@/config/settings'
import { SettingsForm } from '@/components/admin/settings-form'

const GROUP_LABELS: Record<string, string> = {
  general: 'כללי',
  catalog: 'קטלוג',
  cart: 'עגלה ומשלוחים',
  tax: 'מסים',
  media: 'מדיה',
  privacy: 'פרטיות',
  integrations: 'אינטגרציות',
}

export default async function AdminSettingsPage() {
  await requireAdminPage('settings.manage')
  const values = await getSettings()

  const groups = new Map<string, { key: string; label: string; value: unknown }[]>()
  for (const [key, definition] of Object.entries(DEFAULT_SETTINGS)) {
    const list = groups.get(definition.group) ?? []
    list.push({ key, label: definition.label, value: values[key] })
    groups.set(definition.group, list)
  }

  return (
    <>
      <PageHeader title="הגדרות" description="ברירות מחדל תפעוליות. כל שינוי נרשם ביומן הפעולות." />
      <div className="space-y-6">
        {[...groups.entries()].map(([group, items]) => (
          <section key={group} className="rounded-card border border-ink-200 bg-white p-5">
            <h2 className="text-sm font-bold text-ink-900">{GROUP_LABELS[group] ?? group}</h2>
            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <SettingsForm key={item.key} settingKey={item.key} label={item.label} value={item.value} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
