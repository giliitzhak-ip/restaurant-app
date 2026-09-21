import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin, ForbiddenError } from '@/lib/auth/guard'
import { parseCsv, parseXlsx, suggestMapping, type ColumnMapping } from '@/lib/suppliers/price-list'
import { buildPreview } from '@/lib/suppliers/import-service'
import { recordAudit } from '@/lib/audit'
import type { Prisma } from '@/generated/prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 15 * 1024 * 1024

/** Upload + parse + preview. Writes nothing to the catalogue. */
export async function POST(request: Request) {
  let session
  try {
    session = await requireAdmin('suppliers.import')
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'לא מורשה' },
      { status: error instanceof ForbiddenError ? 403 : 401 },
    )
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'לא ניתן לקרוא את הקובץ' }, { status: 400 })

  const supplierId = String(form.get('supplierId') ?? '')
  const file = form.get('file')
  const mappingRaw = form.get('mapping')

  if (!supplierId) return NextResponse.json({ error: 'לא נבחר ספק' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'לא נשלח קובץ' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 15MB)' }, { status: 413 })

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) return NextResponse.json({ error: 'הספק לא נמצא' }, { status: 404 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const name = file.name.toLowerCase()

  let sheet
  try {
    sheet = name.endsWith('.csv') ? parseCsv(buffer.toString('utf8')) : await parseXlsx(buffer)
  } catch {
    return NextResponse.json({ error: 'לא ניתן לקרוא את הקובץ. נתמכים CSV ו-XLSX.' }, { status: 400 })
  }

  if (sheet.headers.length === 0 || sheet.rows.length === 0) {
    return NextResponse.json({ error: 'הקובץ ריק או ללא שורת כותרות' }, { status: 400 })
  }

  const mapping: ColumnMapping = mappingRaw ? JSON.parse(String(mappingRaw)) : suggestMapping(sheet.headers)
  const preview = await buildPreview(supplierId, sheet, mapping)

  const summary = preview.reduce<Record<string, number>>((acc, row) => {
    acc[row.change] = (acc[row.change] ?? 0) + 1
    return acc
  }, {})

  const record = await prisma.supplierImport.create({
    data: {
      supplierId,
      fileName: file.name,
      status: 'PREVIEWED',
      mapping: mapping as unknown as Prisma.InputJsonValue,
      preview: preview as unknown as Prisma.InputJsonValue,
      summary: summary as unknown as Prisma.InputJsonValue,
      createdById: session.userId,
    },
  })

  await recordAudit({
    userId: session.userId, actorEmail: session.email,
    action: 'supplier.import_preview', entity: 'SupplierImport', entityId: record.id,
    after: { fileName: file.name, summary },
  })

  return NextResponse.json({
    importId: record.id,
    headers: sheet.headers,
    mapping,
    preview,
    summary,
  })
}
