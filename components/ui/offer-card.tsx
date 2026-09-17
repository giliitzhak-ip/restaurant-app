'use client';

import { BadgeCheck, Briefcase, Clock, MapPin, Quote } from 'lucide-react';
import type { OfferStatus } from '@/types/database';
import { cn } from '@/lib/utils';
import { formatDistance, formatEta, formatRelative } from '@/lib/utils/format';
import { Avatar } from './avatar';
import { Price } from './price';
import { Rating } from './rating';
import { StatusBadge } from './status-badge';
import { useNow } from '@/hooks/use-now';

export interface OfferCardData {
  id: string;
  price: number;
  etaMinutes: number;
  note?: string | null;
  status: OfferStatus;
  validUntil: string;
  distanceKm?: number | null;
  createdAt: string;
  provider: {
    id: string;
    businessName: string;
    avatarUrl?: string | null;
    categories?: string[];
    ratingAvg: number;
    ratingCount: number;
    completedJobs: number;
    isVerified: boolean;
  };
  /** Up to two recent review snippets, shown to help the customer decide. */
  recentReviews?: Array<{ id: string; rating: number; comment: string | null }>;
}

export function OfferCard({
  offer,
  action,
  className,
}: {
  offer: OfferCardData;
  action?: React.ReactNode;
  className?: string;
}) {
  const now = useNow();
  const expired = now > 0 && new Date(offer.validUntil).getTime() < now;

  return (
    <article
      className={cn(
        'rounded-xl border bg-card p-4',
        offer.status === 'accepted' && 'border-success ring-1 ring-success/30',
        expired && offer.status === 'pending' && 'opacity-60',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar src={offer.provider.avatarUrl} name={offer.provider.businessName} size="lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold">{offer.provider.businessName}</span>
            {offer.provider.isVerified ? (
              <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="מאומת" />
            ) : null}
            {offer.status !== 'pending' ? <StatusBadge kind="offer" status={offer.status} /> : null}
          </div>
          {offer.provider.categories?.length ? (
            <p className="truncate text-sm text-muted-foreground">
              {offer.provider.categories.join(' · ')}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Rating value={offer.provider.ratingAvg} count={offer.provider.ratingCount} size="sm" />
            <span className="inline-flex items-center gap-1">
              <Briefcase className="size-3.5" aria-hidden />
              <span className="num">{offer.provider.completedJobs}</span> עבודות
            </span>
            {offer.distanceKm !== null && offer.distanceKm !== undefined ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {formatDistance(offer.distanceKm)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 text-end">
          <Price amount={offer.price} size="lg" />
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden />
            {formatEta(offer.etaMinutes)}
          </p>
        </div>
      </div>

      {offer.note ? (
        <p className="mt-3 flex gap-2 rounded-lg bg-secondary p-3 text-sm">
          <Quote className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>{offer.note}</span>
        </p>
      ) : null}

      {offer.recentReviews?.length ? (
        <ul className="mt-3 space-y-2">
          {offer.recentReviews.slice(0, 2).map((review) => (
            <li key={review.id} className="rounded-lg border p-2.5 text-xs">
              <Rating value={review.rating} size="sm" showValue={false} />
              {review.comment ? <p className="mt-1 line-clamp-2">{review.comment}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {expired ? 'ההצעה פגה' : `נשלחה ${formatRelative(offer.createdAt)}`}
        </span>
        {action ? <div className="flex gap-2">{action}</div> : null}
      </div>
    </article>
  );
}
