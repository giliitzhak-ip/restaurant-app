import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { can } from '@/lib/auth/rbac'
import { PageHeader } from '@/components/admin/page-header'
import { RegulatoryForm } from '@/components/admin/regulatory-form'

export default async function RegulatoryDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const session = await requireAdminPage('regulatory.view')
  const { productId } = await params

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { regulatory: true },
  })
  if (!product) notFound()

  const record = product.regulatory

  return (
    <>
      <PageHeader
        title={`רגולציה — ${product.name}`}
        description="כל שדה כאן חייב להיות מגובה במקור מאומת. אין למלא מידע שאינו מופיע בתווית הרשמית."
      />
      <Link href="/admin/regulatory" className="mb-5 inline-block text-sm font-medium text-brand-700 hover:underline">
        ← חזרה לרשימה
      </Link>

      {!can(session.role, 'regulatory.verify') && (
        <p className="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          לתפקיד שלך אין הרשאה לסמן מוצר כ״מאומת לשימוש הקהל הרחב״. ניתן לעדכן את שאר השדות ולהעביר לאישור מנהל על.
        </p>
      )}

      <div className="rounded-card border border-ink-200 bg-white p-5">
        <RegulatoryForm
          productId={product.id}
          canVerify={can(session.role, 'regulatory.verify')}
          initial={{
            status: record?.status ?? 'REQUIRES_VERIFICATION',
            publicUseAllowed: record?.publicUseAllowed === null || record?.publicUseAllowed === undefined ? 'unknown' : record.publicUseAllowed ? 'yes' : 'no',
            registrationNumber: record?.registrationNumber ?? '',
            registrationAuthority: record?.registrationAuthority ?? '',
            labelUrl: record?.labelUrl ?? '',
            labelVersion: record?.labelVersion ?? '',
            labelVerifiedAt: record?.labelVerifiedAt ? record.labelVerifiedAt.toISOString().slice(0, 10) : '',
            expiresAt: record?.expiresAt ? record.expiresAt.toISOString().slice(0, 10) : '',
            sourceOfInformation: record?.sourceOfInformation ?? '',
            targetPests: (record?.targetPests ?? []).join('\n'),
            allowedLocations: (record?.allowedLocations ?? []).join('\n'),
            usageInstructions: record?.usageInstructions ?? '',
            warnings: record?.warnings ?? '',
            humanWarnings: record?.humanWarnings ?? '',
            animalWarnings: record?.animalWarnings ?? '',
            reentryTime: record?.reentryTime ?? '',
            storageInstructions: record?.storageInstructions ?? '',
            disposalInstructions: record?.disposalInstructions ?? '',
            notes: record?.notes ?? '',
          }}
        />
      </div>
    </>
  )
}
