import { prisma } from '@/lib/db'
import {
  parseCostToAgorot, type ColumnMapping, type ParsedSheet, type PreviewRow, type RowChange,
} from './price-list'

function pick(row: Record<string, string>, mapping: ColumnMapping, field: keyof ColumnMapping): string | null {
  const header = mapping[field]
  if (!header) return null
  const value = row[header]
  return value && value.trim() !== '' ? value.trim() : null
}

/**
 * Builds the preview diff. Nothing is written here — the admin reviews the
 * classification first, and only approved rows are applied.
 */
export async function buildPreview(
  supplierId: string,
  sheet: ParsedSheet,
  mapping: ColumnMapping,
): Promise<PreviewRow[]> {
  const rows: PreviewRow[] = []
  const seenKeys = new Set<string>()

  const identifiers = sheet.rows.map((row) => ({
    supplierSku: pick(row, mapping, 'supplierSku'),
    sku: pick(row, mapping, 'sku'),
    barcode: pick(row, mapping, 'barcode'),
    name: pick(row, mapping, 'name'),
  }))

  const skus = identifiers.map((i) => i.sku).filter((v): v is string => Boolean(v))
  const barcodes = identifiers.map((i) => i.barcode).filter((v): v is string => Boolean(v))
  const supplierSkus = identifiers.map((i) => i.supplierSku).filter((v): v is string => Boolean(v))

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { sku: { in: skus, mode: 'insensitive' } },
        { barcode: { in: barcodes } },
        { supplierLinks: { some: { supplierId, supplierSku: { in: supplierSkus, mode: 'insensitive' } } } },
      ],
    },
    select: {
      id: true, name: true, sku: true, barcode: true,
      supplierLinks: { where: { supplierId }, select: { supplierSku: true, cost: true } },
    },
  })

  for (const [index, row] of sheet.rows.entries()) {
    const ids = identifiers[index]
    const cost = parseCostToAgorot(pick(row, mapping, 'cost') ?? undefined)

    const key = (ids.supplierSku ?? ids.sku ?? ids.barcode ?? ids.name ?? `row-${index}`).toLowerCase()
    let change: RowChange
    let note: string | undefined

    if (!ids.supplierSku && !ids.sku && !ids.barcode && !ids.name) {
      rows.push({ index, ...ids, cost, currentCost: null, productId: null, productName: null, change: 'INVALID', note: 'אין מזהה בשורה' })
      continue
    }

    if (seenKeys.has(key)) {
      rows.push({ index, ...ids, cost, currentCost: null, productId: null, productName: null, change: 'DUPLICATE_SKU', note: 'מזהה כפול בקובץ' })
      continue
    }
    seenKeys.add(key)

    const product =
      (ids.sku ? products.find((p) => p.sku?.toLowerCase() === ids.sku!.toLowerCase()) : undefined) ??
      (ids.barcode ? products.find((p) => p.barcode === ids.barcode) : undefined) ??
      (ids.supplierSku
        ? products.find((p) => p.supplierLinks.some((l) => l.supplierSku?.toLowerCase() === ids.supplierSku!.toLowerCase()))
        : undefined)

    const currentCost = product?.supplierLinks[0]?.cost ?? null

    if (!product) {
      change = ids.name ? 'NEW_PRODUCT' : 'NOT_FOUND'
      note = ids.name ? 'לא נמצא מוצר תואם — ייווצר מוצר חדש כטיוטה' : 'לא נמצא מוצר תואם ואין שם מוצר'
    } else if (cost === null) {
      change = 'INVALID'
      note = 'מחיר עלות לא תקין'
    } else if (currentCost === cost) {
      change = 'UNCHANGED'
    } else {
      change = 'PRICE_CHANGED'
    }

    rows.push({
      index,
      ...ids,
      cost,
      currentCost,
      productId: product?.id ?? null,
      productName: product?.name ?? null,
      change,
      note,
    })
  }

  return rows
}

export interface ApplyResult {
  updated: number
  created: number
  skipped: number
}

/**
 * Applies only the rows the admin approved. Manual product data (name,
 * selling price, media, regulatory) is never overwritten by an import —
 * only the supplier link's cost and metadata change.
 */
export async function applyImport(
  supplierId: string,
  rows: PreviewRow[],
  approvedIndexes: number[],
  createdById: string,
): Promise<ApplyResult> {
  const approved = new Set(approvedIndexes)
  let updated = 0
  let created = 0
  let skipped = 0

  for (const row of rows) {
    if (!approved.has(row.index) || row.change === 'INVALID' || row.change === 'DUPLICATE_SKU' || row.change === 'NOT_FOUND') {
      skipped += 1
      continue
    }

    if (row.change === 'NEW_PRODUCT') {
      if (!row.name) {
        skipped += 1
        continue
      }
      const slugBase = (row.sku ?? row.supplierSku ?? row.name).toString()
      const product = await prisma.product.create({
        data: {
          slug: `${slugBase.toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '-')}-${Date.now().toString(36)}`,
          name: row.name,
          sku: row.sku,
          barcode: row.barcode,
          // Imported rows arrive as drafts with no selling price — pricing is
          // a business decision, never derived automatically from cost.
          status: 'DRAFT',
          published: false,
          costPrice: row.cost,
          inventory: { create: { onHand: 0 } },
        },
      })
      await prisma.supplierProduct.create({
        data: {
          supplierId,
          productId: product.id,
          supplierSku: row.supplierSku,
          cost: row.cost,
          lastPriceUpdate: new Date(),
        },
      })
      created += 1
      continue
    }

    if (row.productId) {
      const existing = await prisma.supplierProduct.findUnique({
        where: { supplierId_productId: { supplierId, productId: row.productId } },
      })
      if (existing) {
        await prisma.supplierProduct.update({
          where: { id: existing.id },
          data: { cost: row.cost, supplierSku: row.supplierSku ?? existing.supplierSku, lastPriceUpdate: new Date() },
        })
      } else {
        await prisma.supplierProduct.create({
          data: { supplierId, productId: row.productId, supplierSku: row.supplierSku, cost: row.cost, lastPriceUpdate: new Date() },
        })
      }
      await prisma.product.update({ where: { id: row.productId }, data: { costPrice: row.cost } })
      updated += 1
    }
  }

  void createdById
  return { updated, created, skipped }
}
