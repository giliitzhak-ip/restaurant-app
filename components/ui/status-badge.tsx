import type { DisputeStatus, JobStatus, OfferStatus, PaymentStatus, ProviderStatus } from '@/types/database';
import { getDictionary } from '@/lib/i18n';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { Badge, type BadgeProps } from './badge';

type Variant = NonNullable<BadgeProps['variant']>;

const JOB_VARIANTS: Record<JobStatus, Variant> = {
  requested: 'secondary',
  searching: 'accent',
  offers_received: 'accent',
  provider_selected: 'default',
  provider_on_the_way: 'default',
  arrived: 'default',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
  disputed: 'destructive',
};

const OFFER_VARIANTS: Record<OfferStatus, Variant> = {
  pending: 'secondary',
  accepted: 'success',
  rejected: 'destructive',
  expired: 'outline',
  withdrawn: 'outline',
};

const PAYMENT_VARIANTS: Record<PaymentStatus, Variant> = {
  pending: 'secondary',
  authorized: 'accent',
  captured: 'success',
  refunded: 'warning',
  failed: 'destructive',
  cancelled: 'outline',
};

const PROVIDER_VARIANTS: Record<ProviderStatus, Variant> = {
  pending: 'warning',
  verified: 'success',
  rejected: 'destructive',
  suspended: 'destructive',
};

const PROVIDER_LABELS: Record<ProviderStatus, string> = {
  pending: 'ממתין לאימות',
  verified: 'מאומת',
  rejected: 'נדחה',
  suspended: 'מושעה',
};

const DISPUTE_VARIANTS: Record<DisputeStatus, Variant> = {
  open: 'warning',
  under_review: 'accent',
  resolved: 'success',
  rejected: 'outline',
};

interface Props {
  kind: 'job' | 'offer' | 'payment' | 'provider' | 'dispute';
  status: string;
  locale?: Locale;
  className?: string;
}

/** One badge component for every status enum in the system. */
export function StatusBadge({ kind, status, locale = DEFAULT_LOCALE, className }: Props) {
  const t = getDictionary(locale);

  switch (kind) {
    case 'job': {
      const key = status as JobStatus;
      return (
        <Badge variant={JOB_VARIANTS[key] ?? 'secondary'} className={className}>
          {t.job.statusLabel[key] ?? status}
        </Badge>
      );
    }
    case 'offer': {
      const key = status as OfferStatus;
      return (
        <Badge variant={OFFER_VARIANTS[key] ?? 'secondary'} className={className}>
          {t.offer.statusLabel[key] ?? status}
        </Badge>
      );
    }
    case 'payment': {
      const key = status as PaymentStatus;
      return (
        <Badge variant={PAYMENT_VARIANTS[key] ?? 'secondary'} className={className}>
          {t.payment.statusLabel[key] ?? status}
        </Badge>
      );
    }
    case 'provider': {
      const key = status as ProviderStatus;
      return (
        <Badge variant={PROVIDER_VARIANTS[key] ?? 'secondary'} className={className}>
          {PROVIDER_LABELS[key] ?? status}
        </Badge>
      );
    }
    default: {
      const key = status as DisputeStatus;
      return (
        <Badge variant={DISPUTE_VARIANTS[key] ?? 'secondary'} className={className}>
          {t.dispute.statusLabel[key] ?? status}
        </Badge>
      );
    }
  }
}
