import Link from 'next/link'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { MediaImporter } from '@/components/admin/media-importer'

export default async function MediaImportPage() {
  await requireAdminPage('media.upload')

  return (
    <>
      <PageHeader
        title="ייבוא תמונות מרוכז"
        description="בחרו תיקייה או מספר תמונות. המערכת תציע שיוך לפי שם הקובץ, ותשמור רק לאחר אישור."
      />
      <Link href="/admin/products" className="mb-5 inline-block text-sm font-medium text-brand-700 hover:underline">
        ← חזרה למוצרים
      </Link>
      <MediaImporter />
    </>
  )
}
