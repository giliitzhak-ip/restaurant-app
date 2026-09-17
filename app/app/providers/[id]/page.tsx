import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BadgeCheck, Briefcase, CalendarDays, MapPin } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { Rating } from '@/components/ui/rating';
import { EmptyState } from '@/components/ui/states';
import { FavoriteButton } from '@/features/customer/components/favorite-button';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'פרופיל בעל מקצוע' };

export default async function ProviderProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  const supabase = await getServerSupabase();
  if (!supabase) notFound();

  const { data: provider } = await supabase
    .from('provider_profiles')
    .select(
      `id, business_name, owner_name, avatar_url, bio, years_experience, base_price,
       rating_avg, rating_count, completed_jobs, status, created_at,
       provider_categories (categories (id, name, slug)),
       provider_services (price_from, services (id, name)),
       service_areas (label, radius_km),
       provider_availability (is_available)`,
    )
    .eq('id', id)
    .eq('status', 'verified')
    .maybeSingle();

  if (!provider) notFound();

  const [{ data: reviews }, { data: favorite }] = await Promise.all([
    supabase
      .from('reviews')
      .select('id, rating, comment, created_at')
      .eq('provider_id', id)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(10),
    session
      ? supabase
          .from('favorites')
          .select('id')
          .eq('customer_id', session.userId)
          .eq('provider_id', id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const availability = provider.provider_availability as { is_available: boolean } | null;
  const categories = (provider.provider_categories ?? [])
    .map((link) => link.categories as { id: string; name: string; slug: string } | null)
    .filter((category): category is { id: string; name: string; slug: string } => Boolean(category));

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start gap-4">
            <Avatar src={provider.avatar_url} name={provider.business_name} size="xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold">{provider.business_name}</h1>
                <BadgeCheck className="size-5 text-accent" aria-label="מאומת" />
                {availability?.is_available ? <Badge variant="success">זמין</Badge> : null}
              </div>
              <Rating value={Number(provider.rating_avg)} count={provider.rating_count} />
              <ul className="flex flex-wrap gap-1.5">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Badge variant="secondary">{category.name}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-center">
            <div>
              <dt className="text-xs text-muted-foreground">{t.provider.completedJobs}</dt>
              <dd className="num text-lg font-bold">{provider.completed_jobs}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">שנות ניסיון</dt>
              <dd className="num text-lg font-bold">{provider.years_experience}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">מחיר קריאה</dt>
              <dd className="text-lg font-bold">
                {provider.base_price ? <Price amount={Number(provider.base_price)} /> : '—'}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            {session?.role === 'customer' ? (
              <FavoriteButton providerId={provider.id} initiallySaved={Boolean(favorite)} />
            ) : null}
            <Button asChild variant="accent" size="sm">
              <Link href={`/app/new${categories[0] ? `?category=${categories[0].slug}` : ''}`}>
                {t.customer.newJob}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {provider.bio ? (
        <Card>
          <CardHeader>
            <CardTitle>על העסק</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm">{provider.bio}</p>
          </CardContent>
        </Card>
      ) : null}

      {provider.provider_services?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="size-4" aria-hidden />
              שירותים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {provider.provider_services.map((link, index) => {
                const service = link.services as { id: string; name: string } | null;
                if (!service) return null;
                return (
                  <li key={service.id ?? index} className="flex items-center justify-between gap-4">
                    <span>{service.name}</span>
                    {link.price_from ? (
                      <span className="text-muted-foreground">
                        החל מ־ <Price amount={Number(link.price_from)} size="sm" />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {provider.service_areas?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4" aria-hidden />
              אזורי שירות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {provider.service_areas.map((area, index) => (
                <li key={`${area.label}-${index}`}>
                  <Badge variant="outline">
                    {area.label} · <span className="num">{Number(area.radius_km)}</span> ק״מ
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section aria-labelledby="reviews">
        <h2 id="reviews" className="mb-3 text-lg font-semibold">
          ביקורות
        </h2>
        {!reviews?.length ? (
          <EmptyState title={t.empty.noReviews} />
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <Rating value={Number(review.rating)} size="sm" />
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" aria-hidden />
                    {formatDate(review.created_at)}
                  </span>
                </div>
                {review.comment ? <p className="mt-2 text-sm">{review.comment}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
