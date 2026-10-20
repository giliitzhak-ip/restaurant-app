import 'server-only';
import { prisma } from '@sahar/db';
import { getDashboardStats } from './stats';

/** Budget context shown next to every estimate. */
export async function getStats(ownerId: string) {
  const [user, dashboard] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { monthlyBudgetUsd: true } }),
    getDashboardStats(ownerId),
  ]);
  return {
    monthlyBudgetUsd: user.monthlyBudgetUsd === null ? null : Number(user.monthlyBudgetUsd),
    spentThisMonthUsd: dashboard.spendThisMonthUsd,
  };
}
