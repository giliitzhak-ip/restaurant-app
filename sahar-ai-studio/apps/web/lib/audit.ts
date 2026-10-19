import 'server-only';
import { prisma, type Prisma } from '@sahar/db';
import { logger } from './logger';

export type AuditAction =
  | 'auth.register'
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.login.rate_limited'
  | 'auth.logout'
  | 'settings.locale.update'
  | 'settings.budget.update'
  | 'media.audio.upload'
  | 'media.reference.upload'
  | 'media.reference.delete'
  | 'character.create'
  | 'character.update'
  | 'character.delete'
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'project.scenes.update';

/** Writes an audit row. Audit failures are logged but never break the user's request. */
export async function audit(entry: {
  action: AuditAction;
  userId?: string | null;
  ipAddress?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        userId: entry.userId ?? null,
        ipAddress: entry.ipAddress ?? null,
        ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
      },
    });
  } catch (error) {
    logger.error({ err: error, action: entry.action }, 'failed to write audit log');
  }
}
