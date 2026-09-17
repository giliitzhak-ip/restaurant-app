import Link from 'next/link';
import type { Metadata } from 'next';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProviderCard } from '@/components/ui/provider-card';
import { EmptyState } from '@/components/ui/states';
import { FavoriteButton } from '@/features/customer/components/favorite-button';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'מועדפים' };

interface FavoriteRow {
  id: string;
  provider: {
    id: string;
    business_name: string;
    avatar_url: string | null;
    base_price: number | null;
    rating_avg: number;
    rating_count: number;
    completed_jobs: number;
    status: string;
    provider_categories: Array<{ categories: { name: string } | null }> | null;
    provider_availability: { is_available: boolean } | null;
  } | null;
}

export default async function FavoritesPage() {
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  const supabase = await getServerSupabase();

  let favorites: FavoriteRow[] = [];
  if (supabase && session) {
    const { data } = await supabase
      .from('favorites')
      .select(
        `id,
         provider:provider_profiles (
           id, business_name, avatar_url, base_price, rating_avg, rating_count,
           completed_jobs, status,
           provider_categories (categories (name)),
           provider_availability (is_available)
         )`,
      )
      .eq('customer_id', session.userId)
      .order('created_at', { ascending: false });

    favorites = (data ?? []) as unknown as FavoriteRow[];
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.favorites.title}</h1>

      {favorites.length === 0 ? (
        <EmptyState
          title={t.empty.noFavorites}
          description="שמור בעלי מקצוע שאהבת — הם יקבלו עדיפות בהתאמות הבאות."
          icon={<Heart className="size-6" aria-hidden />}
          action={
            <Button asChild size="sm" variant="accent">
              <Link href="/app/search">{t.search.title}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {favorites
            .filter((favorite) => favorite.provider)
            .map((favorite) => {
              const provider = favorite.provider!;
              return (
                <li key={favorite.id}>
                  <ProviderCard
                    href={`/app/providers/${provider.id}`}
                    provider={{
                      id: provider.id,
                      businessName: provider.business_name,
                      avatarUrl: provider.avatar_url,
                      categories: (provider.provider_categories ?? [])
                        .map((link) => link.categories?.name)
                        .filter((name): name is string => Boolean(name)),
                      ratingAvg: Number(provider.rating_avg),
                      ratingCount: provider.rating_count,
                      completedJobs: provider.completed_jobs,
                      basePrice: provider.base_price === null ? null : Number(provider.base_price),
                      isVerified: provider.status === 'verified',
                      isAvailable: provider.provider_availability?.is_available ?? false,
                    }}
                    action={<FavoriteButton providerId={provider.id} initiallySaved />}
                  />
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
