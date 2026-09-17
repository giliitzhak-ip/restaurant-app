import Link from 'next/link';
import { Clock, ImageIcon, MapPin, MessageSquare } from 'lucide-react';
import type { JobStatus, JobUrgency } from '@/types/database';
import { cn } from '@/lib/utils';
import { formatDistance, formatPrice, formatRelative } from '@/lib/utils/format';
import { getDictionary } from '@/lib/i18n';
import { Badge } from './badge';
import { CategoryIcon } from './category-icon';
import { StatusBadge } from './status-badge';

export interface JobCardData {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: JobStatus;
  urgency: JobUrgency;
  categoryName: string;
  categoryIcon: string;
  address: string;
  createdAt: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  offersCount?: number;
  distanceKm?: number | null;
  imageCount?: number;
}

const URGENCY_VARIANT: Record<JobUrgency, 'destructive' | 'warning' | 'secondary'> = {
  now: 'destructive',
  today: 'warning',
  tomorrow: 'secondary',
  scheduled: 'secondary',
};

export function JobCard({
  job,
  href,
  action,
  className,
}: {
  job: JobCardData;
  href?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = getDictionary('he');

  const budget =
    job.budgetMin || job.budgetMax
      ? [job.budgetMin ? formatPrice(job.budgetMin) : null, job.budgetMax ? formatPrice(job.budgetMax) : null]
          .filter(Boolean)
          .join(' – ')
      : null;

  const body = (
    <>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
          <CategoryIcon name={job.categoryIcon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate font-semibold">{job.title}</h3>
            <Badge variant={URGENCY_VARIANT[job.urgency]}>{t.job.urgencyLabel[job.urgency]}</Badge>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
        </div>
        <StatusBadge kind="job" status={job.status} className="shrink-0" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <MapPin className="size-3.5" aria-hidden />
          <span className="truncate">{job.address}</span>
        </span>
        {job.distanceKm !== null && job.distanceKm !== undefined ? (
          <span className="num">{formatDistance(job.distanceKm)}</span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          {formatRelative(job.createdAt)}
        </span>
        {job.offersCount ? (
          <span className="inline-flex items-center gap-1 font-medium text-accent">
            <MessageSquare className="size-3.5" aria-hidden />
            <span className="num">{job.offersCount}</span> {t.job.offers}
          </span>
        ) : null}
        {job.imageCount ? (
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="size-3.5" aria-hidden />
            <span className="num">{job.imageCount}</span>
          </span>
        ) : null}
        {budget ? <span className="num">{budget}</span> : null}
      </div>
    </>
  );

  return (
    <article className={cn('rounded-xl border bg-card p-4 transition-colors', href && 'hover:border-accent/60', className)}>
      {href ? (
        <Link href={href} className="block rounded-lg">
          {body}
        </Link>
      ) : (
        body
      )}
      {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
    </article>
  );
}
