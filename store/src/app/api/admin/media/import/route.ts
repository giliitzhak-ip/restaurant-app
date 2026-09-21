import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAdmin, ForbiddenError } from '@/lib/auth/guard'
import { parseImportFileName, sortMatchRows, type MatchRow } from '@/lib/media/filename-match'

export const dynamic = 'force-dynamic'

const schema = z.object({ fileNames: z.array(z.string().min(1)).max(500) })

/**
 * Preview step for bulk media import. It only reports proposed matches —
 * nothing is written until the admin approves and the files are uploaded.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin('media.upload')
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'לא מורשה' },
      { status: error instanceof ForbiddenError ? 403 : 401 },
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'קלט לא תקין' }, { status: 400 })

  const parsedNames = parsed.data.fileNames.map(parseImportFileName)
  const skus = Array.from(new Set(parsedNames.map((p) => p.sku)))

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { sku: { in: skus, mode: 'insensitive' } },
        { barcode: { in: skus } },
        { supplierLinks: { some: { supplierSku: { in: skus, mode: 'insensitive' } } } },
        { name: { in: skus, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true, name: true, sku: true, barcode: true,
      supplierLinks: { select: { supplierSku: true } },
      _count: { select: { media: true } },
    },
  })

  function findMatch(sku: string): { product: (typeof products)[number]; matchedBy: MatchRow['matchedBy'] } | null {
    const lower = sku.toLowerCase()
    const bySku = products.find((p) => p.sku?.toLowerCase() === lower)
    if (bySku) return { product: bySku, matchedBy: 'sku' }
    const byBarcode = products.find((p) => p.barcode === sku)
    if (byBarcode) return { product: byBarcode, matchedBy: 'barcode' }
    const bySupplier = products.find((p) => p.supplierLinks.some((l) => l.supplierSku?.toLowerCase() === lower))
    if (bySupplier) return { product: bySupplier, matchedBy: 'supplierSku' }
    const byName = products.find((p) => p.name.toLowerCase() === lower)
    if (byName) return { product: byName, matchedBy: 'name' }
    return null
  }

  const rows: MatchRow[] = parsedNames.map((parsedName) => {
    const match = findMatch(parsedName.sku)
    return {
      ...parsedName,
      productId: match?.product.id ?? null,
      productName: match?.product.name ?? null,
      matchedBy: match?.matchedBy ?? null,
      existingImages: match?.product._count.media ?? 0,
    }
  })

  return NextResponse.json({ rows: sortMatchRows(rows) })
}
