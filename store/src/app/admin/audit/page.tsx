import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateHe } from '@/lib/utils'

export default async function AdminAuditPage() {
  await requireAdminPage('audit.view')

  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })

  return (
    <>
      <PageHeader title="יומן פעולות" description="תיעוד של פעולות רגישות במערכת." />

      {logs.length === 0 ? (
        <EmptyState title="היומן ריק" />
      ) : (
        <div className="overflow-x-auto rounded-card border border-ink-200 bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">יומן פעולות מנהלים</caption>
            <thead className="bg-ink-50 text-xs text-ink-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מועד</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">משתמש</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">פעולה</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">ישות</th>
                <th scope="col" className="px-4 py-2.5 text-start font-semibold">מזהה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 text-xs text-ink-500">{formatDateHe(log.createdAt)}</td>
                  <td className="px-4 py-2.5 text-xs" dir="ltr">{log.actorEmail ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs font-medium" dir="ltr">{log.action}</td>
                  <td className="px-4 py-2.5 text-xs">{log.entity}</td>
                  <td className="px-4 py-2.5 text-[11px] text-ink-400" dir="ltr">{log.entityId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
