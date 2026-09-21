import { prisma } from '@/lib/db'
import { requireAdminPage } from '@/lib/auth/guard'
import { PageHeader } from '@/components/admin/page-header'
import { ContentPageEditor } from '@/components/admin/content-page-editor'

export default async function AdminContentPage() {
  await requireAdminPage('content.manage')
  const pages = await prisma.contentPage.findMany({ orderBy: [{ kind: 'asc' }, { position: 'asc' }] })

  return (
    <>
      <PageHeader title="תוכן" description="מדיניות, מדריכים ושאלות נפוצות — ניתנים לעריכה ללא שינוי קוד." />
      <div className="space-y-4">
        {pages.map((page) => (
          <ContentPageEditor
            key={page.id}
            page={{
              id: page.id,
              slug: page.slug,
              kind: page.kind,
              title: page.title,
              excerpt: page.excerpt ?? '',
              bodyHtml: page.bodyHtml ?? '',
              published: page.published,
              metaTitle: page.metaTitle ?? '',
              metaDescription: page.metaDescription ?? '',
            }}
          />
        ))}
      </div>
    </>
  )
}
