'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/audit'

const schema = z.object({
  status: z.enum(['NOT_APPLICABLE', 'REQUIRES_VERIFICATION', 'VERIFIED_PUBLIC_USE', 'PROFESSIONAL_ONLY', 'BLOCKED', 'EXPIRED']),
  publicUseAllowed: z.enum(['unknown', 'yes', 'no']),
  registrationNumber: z.string().trim().optional(),
  registrationAuthority: z.string().trim().optional(),
  labelUrl: z.string().trim().url('כתובת התווית אינה תקינה').or(z.literal('')).optional(),
  labelVersion: z.string().trim().optional(),
  labelVerifiedAt: z.string().trim().optional(),
  expiresAt: z.string().trim().optional(),
  sourceOfInformation: z.string().trim().optional(),
  targetPests: z.string().optional(),
  allowedLocations: z.string().optional(),
  usageInstructions: z.string().trim().optional(),
  warnings: z.string().trim().optional(),
  humanWarnings: z.string().trim().optional(),
  animalWarnings: z.string().trim().optional(),
  reentryTime: z.string().trim().optional(),
  storageInstructions: z.string().trim().optional(),
  disposalInstructions: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

export interface RegulatoryResult {
  ok: boolean
  error?: string
  blockers?: string[]
}

function lines(value: string | undefined): string[] {
  return value ? value.split('\n').map((l) => l.trim()).filter(Boolean) : []
}

function dateOrNull(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Verification is a privileged action: only a role holding
 * `regulatory.verify` may set VERIFIED_PUBLIC_USE, and only with a
 * registration number, a verified label date and an explicit
 * "allowed for public use" flag.
 */
export async function updateRegulatoryAction(productId: string, raw: unknown): Promise<RegulatoryResult> {
  try {
    const session = await requireAdmin('regulatory.view')
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
    }
    const data = parsed.data

    const publicUseAllowed = data.publicUseAllowed === 'unknown' ? null : data.publicUseAllowed === 'yes'
    const labelVerifiedAt = dateOrNull(data.labelVerifiedAt)

    if (data.status === 'VERIFIED_PUBLIC_USE') {
      await requireAdmin('regulatory.verify')
      const blockers: string[] = []
      if (publicUseAllowed !== true) blockers.push('יש לסמן במפורש שהמוצר מותר לשימוש הקהל הרחב')
      if (!data.registrationNumber) blockers.push('חסר מספר רישום')
      if (!data.registrationAuthority) blockers.push('חסרה רשות רישום')
      if (!labelVerifiedAt) blockers.push('חסר תאריך אימות תווית')
      if (!data.sourceOfInformation) blockers.push('חסר מקור המידע')
      if (blockers.length > 0) return { ok: false, error: 'לא ניתן לסמן כמאומת', blockers }
    }

    const before = await prisma.regulatoryRecord.findUnique({ where: { productId } })

    const payload = {
      status: data.status,
      publicUseAllowed,
      registrationNumber: data.registrationNumber || null,
      registrationAuthority: data.registrationAuthority || null,
      labelUrl: data.labelUrl || null,
      labelVersion: data.labelVersion || null,
      labelVerifiedAt,
      expiresAt: dateOrNull(data.expiresAt),
      sourceOfInformation: data.sourceOfInformation || null,
      verifiedById: data.status === 'VERIFIED_PUBLIC_USE' ? session.userId : before?.verifiedById ?? null,
      targetPests: lines(data.targetPests),
      allowedLocations: lines(data.allowedLocations),
      usageInstructions: data.usageInstructions || null,
      warnings: data.warnings || null,
      humanWarnings: data.humanWarnings || null,
      animalWarnings: data.animalWarnings || null,
      reentryTime: data.reentryTime || null,
      storageInstructions: data.storageInstructions || null,
      disposalInstructions: data.disposalInstructions || null,
      notes: data.notes || null,
    }

    await prisma.$transaction(async (tx) => {
      await tx.regulatoryRecord.upsert({
        where: { productId },
        create: { productId, ...payload },
        update: payload,
      })

      // A product that is no longer verified must leave the public store at once.
      if (data.status !== 'VERIFIED_PUBLIC_USE') {
        await tx.product.updateMany({
          where: { id: productId, published: true },
          data: { published: false, status: data.status === 'PROFESSIONAL_ONLY' ? 'ARCHIVED' : 'REQUIRES_VERIFICATION' },
        })
      }
    })

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'regulatory.update', entity: 'RegulatoryRecord', entityId: productId,
      before: before ? { status: before.status, registrationNumber: before.registrationNumber } : null,
      after: { status: data.status, registrationNumber: payload.registrationNumber },
    })

    revalidatePath('/admin/regulatory')
    revalidatePath(`/admin/regulatory/${productId}`)
    revalidatePath(`/admin/products/${productId}`)
    revalidatePath('/')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'אירעה שגיאה' }
  }
}
