import { prisma } from '@/lib/db'
import type { Prisma } from '@/generated/prisma/client'

export interface AuditInput {
  userId?: string | null
  actorEmail?: string | null
  action: string
  entity: string
  entityId?: string | null
  before?: unknown
  after?: unknown
  ip?: string | null
  userAgent?: string | null
}

/** Records a sensitive action. Never throws into the caller's happy path. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (error) {
    console.error('[audit] failed to record', input.action, error)
  }
}
