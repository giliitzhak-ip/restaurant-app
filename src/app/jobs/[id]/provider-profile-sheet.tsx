'use client';

import { useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Inset,
  LoadingState,
  Money,
  Rating,
  SectionLabel,
  Sheet,
} from '@/components/ui';
import { apiFetch, ApiRequestError } from '@/lib/client/api';

interface ProviderProfile {
  id: string;
  fullName: string;
  businessName: string | null;
  bio: string | null;
  initials: string;
  yearsExperience: number;
  isVerified: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  completedJobs: number;
  isNew: boolean;
  avgResponseSeconds: number | null;
  memberSince: string;
  ratingBreakdown: { five: number; four: number; three: number; low: number } | null;
  services: {
    slug: string;
    name: string;
    categoryName: string;
    priceIls: number | null;
    isRequested: boolean;
  }[];
  serviceAreas: { label: string | null; radiusKm: number }[];
  reviews: {
    rating: number;
    comment: string | null;
    authorName: string;
    createdAt: string;
    punctuality: number | null;
    professionalism: number | null;
  }[];
  availability: { availableNow: boolean; nextAvailableAt: string | null; phrase: string };
}

/**
 * The provider profile, opened from a match (spec §17–§20, §47, §56).
 *
 * Progressive disclosure, and a bottom sheet rather than a page, for one
 * reason: the customer is in the middle of deciding. Navigating away from the
 * match would lose the price, the ETA and the sense of a live moment, and
 * coming back to a rebuilt screen feels like starting over. Closing this
 * returns to exactly the match that was behind it.
 *
 * The order is the trust order, not the data order: verification first,
 * because it is the only claim the platform itself stands behind; then a
 * rating shown WITH its review count, because 5.0 from one review is not
 * better than 4.8 from three hundred; then work actually completed; then
 * experience; then availability, in a sentence.
 *
 * There is no calendar here, and no map. A customer needs to know whether
 * this person can come when they need them — not the provider's week.
 */
export function ProviderProfileSheet({
  providerId,
  serviceSlug,
  open,
  onClose,
}: {
  providerId: string;
  serviceSlug?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const query = serviceSlug ? `?service=${encodeURIComponent(serviceSlug)}` : '';
    void (async () => {
      try {
        const result = await apiFetch<ProviderProfile>(`/api/providers/${providerId}${query}`);
        if (alive) {
          setProfile(result);
          setError(null);
        }
      } catch (caught) {
        if (alive) {
          setError(
            caught instanceof ApiRequestError ? caught.message : 'לא הצלחנו לטעון את הפרופיל',
          );
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, providerId, serviceSlug]);

  const title = profile?.businessName ?? profile?.fullName ?? 'פרופיל מקצוען';

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {error ? (
        <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad-bright">
          {error}
        </p>
      ) : !profile ? (
        <LoadingState label="טוען פרופיל…" />
      ) : (
        <div className="space-y-5">
          {/* ── Identity, and the one claim the platform makes itself ──── */}
          <div className="flex items-start gap-3">
            <Avatar name={profile.fullName} initials={profile.initials} size={52} />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold leading-tight text-ink">{profile.fullName}</p>
              {profile.businessName && (
                <p className="truncate text-sm text-ink-2">{profile.businessName}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {profile.isVerified && <Badge tone="ok">✓ מאומת</Badge>}
                <Badge tone={profile.availability.availableNow ? 'live' : 'neutral'}>
                  {profile.availability.phrase}
                </Badge>
              </div>
            </div>
          </div>

          {/* ── Track record. A rating never appears without its count ─── */}
          <Inset className="flex items-center justify-between gap-3">
            <div>
              <Rating value={profile.ratingAvg} count={profile.ratingCount} size="lg" />
              {profile.isNew && (
                <p className="mt-0.5 text-[12.5px] text-ink-3">
                  חדש בפלטפורמה — עבר אימות מסמכים
                </p>
              )}
            </div>
            <div className="text-end">
              <p className="ltr-nums text-xl font-black text-ink" dir="ltr">
                {profile.completedJobs}
              </p>
              <p className="text-[12px] text-ink-3">עבודות שהושלמו</p>
            </div>
          </Inset>

          {profile.bio && <p className="text-[15px] leading-relaxed text-ink-2">{profile.bio}</p>}

          {/* ── Facts, LTR-isolated so the bidi algorithm cannot reorder ─ */}
          <dl className="grid grid-cols-2 gap-2">
            <Inset>
              <dt className="text-[12px] text-ink-3">ניסיון</dt>
              <dd className="mt-0.5 text-[15px] font-bold text-ink">
                <span className="ltr-nums" dir="ltr">
                  {profile.yearsExperience}
                </span>{' '}
                שנים
              </dd>
            </Inset>
            <Inset>
              <dt className="text-[12px] text-ink-3">זמן תגובה ממוצע</dt>
              <dd className="mt-0.5 text-[15px] font-bold text-ink">
                {profile.avgResponseSeconds === null ? (
                  <span className="text-ink-3">—</span>
                ) : (
                  <>
                    <span className="ltr-nums" dir="ltr">
                      {Math.max(1, Math.round(profile.avgResponseSeconds / 60))}
                    </span>{' '}
                    דק׳
                  </>
                )}
              </dd>
            </Inset>
          </dl>

          {/* ── What they do. The requested service leads. ─────────────── */}
          {profile.services.length > 0 && (
            <section>
              <SectionLabel>מה הוא עושה</SectionLabel>
              <div className="space-y-1.5">
                {[...profile.services]
                  .sort((a, b) => Number(b.isRequested) - Number(a.isRequested))
                  .slice(0, 8)
                  .map((service) => (
                    <div
                      key={service.slug}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                        service.isRequested ? 'bg-brand/12' : 'bg-surface-2'
                      }`}
                    >
                      <p className="min-w-0 truncate text-sm text-ink">
                        {service.name}
                        {service.isRequested && (
                          <span className="ms-2 text-[12px] text-brand-bright">מה שביקשתם</span>
                        )}
                      </p>
                      {service.priceIls !== null && (
                        <p className="shrink-0 text-sm font-bold text-ink">
                          <Money shekels={service.priceIls} />
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* ── Reviews. Only real ones, with the reviewer's first name. ─ */}
          {profile.reviews.length > 0 && (
            <section>
              <SectionLabel>מה לקוחות כתבו</SectionLabel>
              <div className="space-y-2">
                {profile.reviews.map((review, index) => (
                  <Inset key={`${review.authorName}-${index}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink">{review.authorName}</p>
                      <Rating value={review.rating} count={1} />
                    </div>
                    {review.comment && (
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{review.comment}</p>
                    )}
                  </Inset>
                ))}
              </div>
            </section>
          )}

          {/*
            The star distribution is shown only when real review rows back it.
            A 0/0/0/0 chart beside "341 ביקורות" would read as "nobody gave
            five stars", which is a claim we have no basis for (spec §27).
          */}
          {profile.ratingBreakdown && (
            <section>
              <SectionLabel>פירוט דירוגים</SectionLabel>
              <dl className="space-y-1">
                {(
                  [
                    ['5 כוכבים', profile.ratingBreakdown.five],
                    ['4 כוכבים', profile.ratingBreakdown.four],
                    ['3 כוכבים', profile.ratingBreakdown.three],
                    ['2 ומטה', profile.ratingBreakdown.low],
                  ] as const
                ).map(([label, count]) => {
                  const total =
                    profile.ratingBreakdown!.five +
                    profile.ratingBreakdown!.four +
                    profile.ratingBreakdown!.three +
                    profile.ratingBreakdown!.low;
                  const share = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <dt className="w-20 shrink-0 text-[12.5px] text-ink-3">{label}</dt>
                      <dd className="flex flex-1 items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className="block h-full rounded-full bg-warn"
                            style={{ width: `${share}%` }}
                          />
                        </span>
                        <span className="ltr-nums w-8 text-end text-[12px] text-ink-3" dir="ltr">
                          {count}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          )}

          {profile.serviceAreas.length > 0 && (
            <p className="text-[12.5px] text-ink-3">
              עובד באזור{' '}
              {profile.serviceAreas
                .map((area) => area.label ?? 'אזור שירות')
                .join(', ')}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
