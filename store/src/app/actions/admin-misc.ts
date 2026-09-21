'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/audit'
import { setSetting } from '@/lib/settings'
import { DEFAULT_SETTINGS, type SettingKey } from '@/config/settings'

export interface SimpleResult {
  ok: boolean
  error?: string
}

function failure(error: unknown): SimpleResult {
  return { ok: false, error: error instanceof Error ? error.message : 'אירעה שגיאה' }
}

export async function updateSettingAction(key: string, rawValue: string): Promise<SimpleResult> {
  try {
    const session = await requireAdmin('settings.manage')
    if (!(key in DEFAULT_SETTINGS)) return { ok: false, error: 'הגדרה לא מוכרת' }
    const settingKey = key as SettingKey
    const current = DEFAULT_SETTINGS[settingKey].value

    let value: unknown = rawValue
    if (typeof current === 'boolean') value = rawValue === 'true'
    else if (typeof current === 'number') {
      const parsed = Number(rawValue)
      if (!Number.isFinite(parsed)) return { ok: false, error: 'ערך מספרי אינו תקין' }
      value = parsed
    }

    await setSetting(settingKey, value as never)
    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'setting.update', entity: 'Setting', entityId: key, after: { value },
    })
    revalidatePath('/admin/settings')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

const contentSchema = z.object({
  title: z.string().trim().min(2),
  excerpt: z.string().trim().optional(),
  bodyHtml: z.string().max(100_000).optional(),
  published: z.boolean(),
  metaTitle: z.string().trim().optional(),
  metaDescription: z.string().trim().optional(),
})

export async function updateContentPageAction(id: string, raw: unknown): Promise<SimpleResult> {
  try {
    const session = await requireAdmin('content.manage')
    const parsed = contentSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'יש למלא כותרת תקינה' }

    const page = await prisma.contentPage.update({
      where: { id },
      data: {
        title: parsed.data.title,
        excerpt: parsed.data.excerpt || null,
        bodyHtml: parsed.data.bodyHtml || null,
        published: parsed.data.published,
        metaTitle: parsed.data.metaTitle || null,
        metaDescription: parsed.data.metaDescription || null,
      },
    })

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'content.update', entity: 'ContentPage', entityId: id, after: { published: parsed.data.published },
    })

    revalidatePath('/admin/content')
    revalidatePath(`/page/${page.slug}`)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function moderateReviewAction(id: string, status: 'APPROVED' | 'REJECTED'): Promise<SimpleResult> {
  try {
    const session = await requireAdmin('reviews.moderate')
    await prisma.review.update({ where: { id }, data: { status, moderatedById: session.userId } })
    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'review.moderate', entity: 'Review', entityId: id, after: { status },
    })
    revalidatePath('/admin/reviews')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

const couponSchema = z.object({
  code: z.string().trim().min(3).max(40),
  description: z.string().trim().optional(),
  type: z.enum(['PERCENTAGE', 'FIXED', 'FREE_SHIPPING']),
  value: z.coerce.number().int().min(0),
  minBasket: z.coerce.number().int().min(0).optional(),
  usageLimit: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean(),
})

export async function upsertCouponAction(id: string | null, raw: unknown): Promise<SimpleResult> {
  try {
    const session = await requireAdmin('promotions.manage')
    const parsed = couponSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'יש למלא קוד וערך תקינים' }
    const data = parsed.data

    const payload = {
      code: data.code.toUpperCase(),
      description: data.description || null,
      type: data.type,
      value: data.value,
      minBasket: data.minBasket || null,
      usageLimit: data.usageLimit || null,
      isActive: data.isActive,
    }

    const coupon = id
      ? await prisma.coupon.update({ where: { id }, data: payload })
      : await prisma.coupon.create({ data: payload })

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: id ? 'coupon.update' : 'coupon.create', entity: 'Coupon', entityId: coupon.id, after: payload,
    })

    revalidatePath('/admin/coupons')
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}
