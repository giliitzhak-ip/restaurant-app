import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { PriceListImporter } from '@/components/admin/price-list-importer'

export default async function SupplierImportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage('suppliers.import')
  const { id } = await params

  const supplier = await prisma.supplier.findUnique({ where: { id } })
  if (!supplier) notFound()

  return (
    <>
      <PageHeader
        title={`ייבוא מחירון — ${supplier.name}`}
        description="העלאה ← מיפוי עמודות ← תצוגה מקדימה ← אישור ← ייבוא. שום שינוי אינו מבוצע לפני אישור."
      />
      <Link href="/admin/suppliers" className="mb-5 inline-block text-sm font-medium text-brand-700 hover:underline">
        ← חזרה לספקים
      </Link>
      <PriceListImporter supplierId={supplier.id} />
    </>
  )
}
