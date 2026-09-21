'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/audit'
import { changeProductStatus, publishDecisionFor } from '@/lib/catalog/product-service'
import { slugify } from '@/lib/utils'

export interface ProductActionResult {
  ok: boolean
  error?: string
  blockers?: string[]
  fieldErrors?: Record<string, string>
}

function failure(error: unknown): ProductActionResult {
  return { ok: false, error: error instanceof Error ? error.message : 'אירעה שגיאה' }
}

const optionalAgorot = z
  .union([z.literal(''), z.coerce.number().int().min(0).max(100_000_000)])
  .transform((v) => (v === '' ? null : v))
  .nullable()

const quickEditSchema = z.object({
  productId: z.string().min(1),
  price: optionalAgorot,
  salePrice: optionalAgorot,
  stock: z.union([z.literal(''), z.coerce.number().int().min(0)]).transform((v) => (v === '' ? null : v)).nullable(),
})

/** Inline edits from the product list: price, sale price and stock. */
export async function quickEditProductAction(input: {
  productId: string
  price: number | null
  salePrice: number | null
  stock: number | null
}): Promise<ProductActionResult> {
  try {
    const session = await requireAdmin('products.edit')
    const parsed = quickEditSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'ערכים אינם תקינים' }
    const { productId, price, salePrice, stock } = parsed.data

    if (price !== null && salePrice !== null && salePrice >= price) {
      return { ok: false, error: 'מחיר המבצע חייב להיות נמוך ממחיר המכירה' }
    }

    const before = await prisma.product.findUnique({
      where: { id: productId },
      select: { price: true, salePrice: true, published: true, inventory: { select: { onHand: true } } },
    })
    if (!before) return { ok: false, error: 'המוצר לא נמצא' }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        // Removing the price pulls the product out of the public store.
        data: { price, salePrice, ...(price === null ? { published: false } : {}) },
      })
      if (stock !== null) {
        const inventory = await tx.inventory.upsert({
          where: { productId },
          create: { productId, onHand: stock },
          update: { onHand: stock },
        })
        const delta = stock - (before.inventory?.onHand ?? 0)
        if (delta !== 0) {
          await tx.inventoryMovement.create({
            data: { productId, type: 'ADJUSTMENT', quantity: delta, note: 'עדכון מהיר מרשימת המוצרים', createdById: session.userId },
          })
        }
        void inventory
      }
    })

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'product.quick_edit', entity: 'Product', entityId: productId,
      before, after: { price, salePrice, stock },
    })

    revalidatePath('/admin/products')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function changeProductStatusAction(productId: string, status: string): Promise<ProductActionResult> {
  try {
    const session = await requireAdmin('products.publish')
    const allowed = ['DRAFT', 'READY_FOR_REVIEW', 'REQUIRES_VERIFICATION', 'READY_TO_PUBLISH', 'PUBLISHED', 'ARCHIVED'] as const
    if (!allowed.includes(status as (typeof allowed)[number])) return { ok: false, error: 'סטטוס לא מוכר' }

    const result = await changeProductStatus(productId, status as (typeof allowed)[number])
    if (!result.ok) return result

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'product.status_change', entity: 'Product', entityId: productId, after: { status },
    })

    revalidatePath('/admin/products')
    revalidatePath(`/admin/products/${productId}`)
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function getPublishBlockersAction(productId: string): Promise<{ allowed: boolean; blockers: string[] }> {
  await requireAdmin('products.view')
  const decision = await publishDecisionFor(productId)
  return { allowed: decision.allowed, blockers: decision.blockers }
}

const detailsSchema = z.object({
  name: z.string().trim().min(2, 'יש להזין שם מוצר'),
  nameEn: z.string().trim().optional(),
  slug: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  shortDescription: z.string().trim().max(400).optional(),
  description: z.string().trim().max(8000).optional(),
  benefits: z.string().optional(),
  suitableFor: z.string().optional(),
  keywords: z.string().optional(),
  kind: z.enum(['GENERAL', 'PEST_CONTROL', 'REPELLENT', 'TRAP', 'PHYSICAL_BARRIER', 'SMART_DEVICE']),
  environment: z.enum(['INDOOR', 'OUTDOOR', 'BOTH', 'UNKNOWN']),
  stockPolicy: z.enum(['HIDE', 'SHOW_UNAVAILABLE', 'ALLOW_BACKORDER']),
  poisonFree: z.boolean(),
  readyToUse: z.boolean(),
  isBestSeller: z.boolean(),
  isNew: z.boolean(),
  costPrice: optionalAgorot,
  price: optionalAgorot,
  salePrice: optionalAgorot,
  reorderPoint: z.coerce.number().int().min(0).default(0),
  stock: z.coerce.number().int().min(0).default(0),
  metaTitle: z.string().trim().optional(),
  metaDescription: z.string().trim().optional(),
  categoryIds: z.array(z.string()).default([]),
  primaryCategoryId: z.string().optional(),
  supplierSku: z.string().trim().optional(),
})

function splitLines(value: string | undefined): string[] {
  if (!value) return []
  return value.split('\n').map((line) => line.trim()).filter(Boolean)
}

export async function updateProductAction(productId: string, raw: unknown): Promise<ProductActionResult> {
  try {
    const session = await requireAdmin('products.edit')
    const parsed = detailsSchema.safeParse(raw)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        fieldErrors[key] ??= issue.message
      }
      return { ok: false, error: 'יש לתקן את השדות המסומנים', fieldErrors }
    }
    const data = parsed.data

    if (data.price !== null && data.salePrice !== null && data.salePrice >= data.price) {
      return { ok: false, error: 'מחיר המבצע חייב להיות נמוך ממחיר המכירה', fieldErrors: { salePrice: 'נמוך ממחיר המכירה' } }
    }

    const before = await prisma.product.findUnique({ where: { id: productId } })
    if (!before) return { ok: false, error: 'המוצר לא נמצא' }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          name: data.name,
          nameEn: data.nameEn || null,
          slug: data.slug ? slugify(data.slug) : before.slug,
          sku: data.sku || null,
          barcode: data.barcode || null,
          brand: data.brand || null,
          shortDescription: data.shortDescription || null,
          description: data.description || null,
          benefits: splitLines(data.benefits),
          suitableFor: splitLines(data.suitableFor),
          keywords: splitLines(data.keywords),
          kind: data.kind,
          environment: data.environment,
          stockPolicy: data.stockPolicy,
          poisonFree: data.poisonFree,
          readyToUse: data.readyToUse,
          isBestSeller: data.isBestSeller,
          isNew: data.isNew,
          costPrice: data.costPrice,
          price: data.price,
          salePrice: data.salePrice,
          metaTitle: data.metaTitle || null,
          metaDescription: data.metaDescription || null,
          ...(data.price === null ? { published: false } : {}),
        },
      })

      if (data.categoryIds.length > 0) {
        await tx.productCategory.deleteMany({ where: { productId } })
        for (const categoryId of data.categoryIds) {
          await tx.productCategory.create({
            data: { productId, categoryId, isPrimary: categoryId === data.primaryCategoryId },
          })
        }
      }

      const inventoryBefore = await tx.inventory.findUnique({ where: { productId } })
      await tx.inventory.upsert({
        where: { productId },
        create: { productId, onHand: data.stock, reorderPoint: data.reorderPoint },
        update: { onHand: data.stock, reorderPoint: data.reorderPoint },
      })
      const delta = data.stock - (inventoryBefore?.onHand ?? 0)
      if (delta !== 0) {
        await tx.inventoryMovement.create({
          data: { productId, type: 'ADJUSTMENT', quantity: delta, note: 'עדכון מדף המוצר', createdById: session.userId },
        })
      }

      if (data.supplierSku !== undefined) {
        const link = await tx.supplierProduct.findFirst({ where: { productId }, orderBy: { createdAt: 'asc' } })
        if (link) {
          await tx.supplierProduct.update({
            where: { id: link.id },
            data: { supplierSku: data.supplierSku || null, cost: data.costPrice },
          })
        }
      }
    })

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'product.update', entity: 'Product', entityId: productId,
      before: { name: before.name, price: before.price, status: before.status },
      after: { name: data.name, price: data.price },
    })

    revalidatePath('/admin/products')
    revalidatePath(`/admin/products/${productId}`)
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}
