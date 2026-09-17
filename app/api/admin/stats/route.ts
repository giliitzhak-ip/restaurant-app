import { route } from '@/lib/api/handler';
import { jsonOk } from '@/lib/api/response';
import { requireAdmin, requireServiceClient } from '@/lib/api/guards';

/**
 * GET /api/admin/stats — the KPI strip on the admin dashboard.
 *
 * Counts run through the service role so the numbers are platform-wide rather
 * than whatever RLS would let the admin's own rows show.
 */
export const GET = route(async () => {
  await requireAdmin();
  const admin = requireServiceClient();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayIso = startOfToday.toISOString();

  const [
    users,
    activeProviders,
    jobsToday,
    jobsCompleted,
    jobsCancelled,
    jobsTotal,
    openDisputes,
    pendingProviders,
  ] = await Promise.all([
    admin.from('users').select('id', { count: 'exact', head: true }),
    admin.from('provider_profiles').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
    admin.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
    admin.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    admin.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
    admin.from('jobs').select('id', { count: 'exact', head: true }),
    admin.from('disputes').select('id', { count: 'exact', head: true }).in('status', ['open', 'under_review']),
    admin.from('provider_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  const { data: captured } = await admin
    .from('payments')
    .select('amount, platform_fee')
    .eq('status', 'captured');

  const gmv = (captured ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const revenue = (captured ?? []).reduce((sum, row) => sum + Number(row.platform_fee), 0);

  const { data: ratings } = await admin
    .from('provider_profiles')
    .select('rating_avg, rating_count')
    .gt('rating_count', 0);

  const totalRatings = (ratings ?? []).reduce((sum, row) => sum + row.rating_count, 0);
  const avgRating = totalRatings
    ? (ratings ?? []).reduce((sum, row) => sum + Number(row.rating_avg) * row.rating_count, 0) /
      totalRatings
    : 0;

  const totalJobs = jobsTotal.count ?? 0;

  return jsonOk({
    totalUsers: users.count ?? 0,
    activeProviders: activeProviders.count ?? 0,
    pendingProviders: pendingProviders.count ?? 0,
    jobsToday: jobsToday.count ?? 0,
    jobsCompleted: jobsCompleted.count ?? 0,
    gmv: Math.round(gmv * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    avgRating: Math.round(avgRating * 100) / 100,
    cancellationRate: totalJobs ? Math.round(((jobsCancelled.count ?? 0) / totalJobs) * 1000) / 10 : 0,
    openDisputes: openDisputes.count ?? 0,
  });
});
