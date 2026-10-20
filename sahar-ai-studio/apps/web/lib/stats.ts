import 'server-only';
import { type Prisma, prisma } from '@sahar/db';

export function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Dashboard numbers, always scoped to the owner. */
export async function getDashboardStats(ownerId: string, now = new Date()) {
  const monthStart = startOfUtcMonth(now);
  const [projects, characters, generationsThisMonth, spend] = await Promise.all([
    prisma.project.count({ where: { ownerId, deletedAt: null } }),
    prisma.character.count({ where: { ownerId, deletedAt: null } }),
    prisma.generationJob.count({ where: { ownerId, approvedAt: { gte: monthStart } } }),
    // Actual billed amount when the provider reported one, otherwise the approved estimate.
    prisma.$queryRaw<{ total: Prisma.Decimal | null }[]>`
      SELECT SUM(COALESCE("actualCostUsd", "estimatedCostUsd")) AS total
      FROM "GenerationJob"
      WHERE "ownerId" = ${ownerId} AND "approvedAt" >= ${monthStart}
        AND NOT ("status" = 'CANCELLED' AND "submittedAt" IS NULL)`,
  ]);
  return {
    projects,
    characters,
    generationsThisMonth,
    spendThisMonthUsd: spend[0]?.total ? Number(spend[0].total) : 0,
  };
}
