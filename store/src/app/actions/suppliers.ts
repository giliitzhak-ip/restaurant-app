'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/guard'
import { recordAudit } from '@/lib/audit'
import { applyImport } from '@/lib/suppliers/import-service'
import type { PreviewRow } from '@/lib/suppliers/price-list'

export interface ImportApplyResult {
  ok: boolean
  error?: string
  updated?: number
  created?: number
  skipped?: number
}

/** Commits an already-previewed import. Only the approved rows are written. */
export async function approveImportAction(importId: string, approvedIndexes: number[]): Promise<ImportApplyResult> {
  try {
    const session = await requireAdmin('suppliers.import')
    const record = await prisma.supplierImport.findUnique({ where: { id: importId } })
    if (!record) return { ok: false, error: 'הייבוא לא נמצא' }
    if (record.status === 'IMPORTED') return { ok: false, error: 'הייבוא כבר בוצע' }

    const rows = (record.preview ?? []) as unknown as PreviewRow[]
    const result = await applyImport(record.supplierId, rows, approvedIndexes, session.userId)

    await prisma.supplierImport.update({
      where: { id: importId },
      data: { status: 'IMPORTED', summary: { ...result } },
    })

    await recordAudit({
      userId: session.userId, actorEmail: session.email,
      action: 'supplier.import_apply', entity: 'SupplierImport', entityId: importId, after: result,
    })

    revalidatePath('/admin/products')
    revalidatePath('/admin/suppliers')
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'אירעה שגיאה' }
  }
}
