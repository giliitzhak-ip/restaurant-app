import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { jsonOk, parseQuery } from '@/lib/api/response';
import { requireAdmin, requireServiceClient } from '@/lib/api/guards';
import { verificationState } from '@/lib/services/jobs/verification';
import { getSetting } from '@/lib/services/settings';

const querySchema = z.object({
  minAccepted: z.coerce.number().int().min(1).max(100).default(3),
  days: z.coerce.number().int().min(7).max(730).default(180),
});

/**
 * GET /api/admin/integrity — what charged bookings actually produced.
 *
 * With the commission taken at acceptance, the risk is not unpaid invoices but
 * bookings that were charged and never happened: the platform collects, the
 * work moves off-platform, and nothing in the job record contradicts it.
 *
 * Three reads, in the order a person would actually ask them:
 *   1. per provider — how many accepted jobs ever reached a verified ending;
 *   2. per provider — how many customers came back (the thing commission buys);
 *   3. the individual jobs with no evidence at all, to look at.
 *
 * None of this proves anything on its own. It is a list of what to look at,
 * which is the honest claim to make for it.
 */
export const GET = route(async (request: NextRequest) => {
  await requireAdmin();
  const admin = requireServiceClient();
  const { minAccepted, days } = parseQuery(request, querySchema);

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const verification = await getSetting('verification');

  const [integrity, repeats, unverified] = await Promise.all([
    admin.rpc('provider_integrity_report', { min_accepted: minAccepted }),
    admin.rpc('repeat_customer_report', { since }),
    admin
      .from('jobs')
      .select(
        `id, reference, title, status, completed_at, commission_amount,
         arrival_verified_at, arrival_distance_m, customer_confirmed_at,
         provider:provider_profiles (id, business_name)`,
      )
      .not('commission_charged_at', 'is', null)
      .is('customer_confirmed_at', null)
      .is('arrival_verified_at', null)
      .gte('created_at', since)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(100),
  ]);

  // Photos are the one signal not on the job row, and leaving them out would
  // mark an evidenced job as having none.
  const jobIds = (unverified.data ?? []).map((job) => job.id);
  const photoCounts = new Map<string, number>();
  if (jobIds.length > 0) {
    const { data: photos } = await admin
      .from('job_images')
      .select('job_id')
      .eq('stage', 'completion')
      .in('job_id', jobIds);
    for (const photo of photos ?? []) {
      photoCounts.set(photo.job_id, (photoCounts.get(photo.job_id) ?? 0) + 1);
    }
  }

  const flagged = (unverified.data ?? []).map((job) => {
    const state = verificationState(
      {
        arrivalVerifiedAt: job.arrival_verified_at,
        completionPhotos: photoCounts.get(job.id) ?? 0,
        customerConfirmedAt: job.customer_confirmed_at,
        completedAt: job.completed_at,
      },
      verification,
    );
    return { ...job, completionPhotos: photoCounts.get(job.id) ?? 0, verification: state };
  });

  return jsonOk({
    providers: integrity.data ?? [],
    repeatCustomers: repeats.data ?? [],
    unverifiedJobs: flagged,
    suspectedNoShows: flagged.filter((job) => job.verification.suspectedNoShow).length,
    window: { days, since },
    thresholds: {
      arrivalRadiusM: verification.arrival_radius_m,
      autoConfirmAfterHours: verification.auto_confirm_after_hours,
    },
  });
});
