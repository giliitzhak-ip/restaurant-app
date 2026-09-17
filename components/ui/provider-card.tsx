import Link from 'next/link';
import { BadgeCheck, Briefcase, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistance, formatEta } from '@/lib/utils/format';
import { Avatar } from './avatar';
import { Badge } from './badge';
import { Price } from './price';
import { Rating } from './rating';

export interface ProviderCardData {
  id: string;
  businessName: string;
  ownerName?: string | null;
  avatarUrl?: string | null;
  categories?: string[];
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  distanceKm?: number | null;
  etaMinutes?: number | null;
  basePrice?: number | null;
  isVerified?: boolean;
  isAvailable?: boolean;
}

interface ProviderCardProps {
  provider: ProviderCardData;
  href?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ProviderCard({ provider, href, action, className }: ProviderCardProps) {
  const body = (
    <div className="flex items-start gap-3">
      <Avatar src={provider.avatarUrl} name={provider.businessName} size="lg" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-semibold">{provider.businessName}</span>
          {provider.isVerified ? (
            <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="בעל מקצוע מאומת" />
          ) : null}
          {provider.isAvailable ? (
            <Badge variant="success" className="shrink-0">
              זמין
            </Badge>
          ) : null}
        </div>

        {provider.categories?.length ? (
          <p className="truncate text-sm text-muted-foreground">{provider.categories.join(' · ')}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Rating value={provider.ratingAvg} count={provider.ratingCount} size="sm" />
          <span className="inline-flex items-center gap-1">
            <Briefcase className="size-3.5" aria-hidden />
            <span className="num">{provider.completedJobs}</span> עבודות
          </span>
          {provider.distanceKm !== null && provider.distanceKm !== undefined ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {formatDistance(provider.distanceKm)}
            </span>
          ) : null}
          {provider.etaMinutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {formatEta(provider.etaMinutes)}
            </span>
          ) : null}
        </div>
      </div>

      {provider.basePrice ? (
        <div className="shrink-0 text-end">
          <p className="text-[11px] text-muted-foreground">מחיר קריאה</p>
          <Price amount={provider.basePrice} />
        </div>
      ) : null}
    </div>
  );

  return (
    <article
      className={cn(
        'rounded-xl border bg-card p-4 transition-colors',
        href && 'hover:border-accent/60',
        className,
      )}
    >
      {href ? (
        <Link href={href} className="block rounded-lg">
          {body}
        </Link>
      ) : (
        body
      )}
      {action ? <div className="mt-3 flex gap-2">{action}</div> : null}
    </article>
  );
}
