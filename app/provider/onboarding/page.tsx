import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ProviderOnboardingWizard } from '@/features/provider/components/onboarding-wizard';
import { getCategories, getServices } from '@/lib/services/catalogue';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'הצטרפות כבעל מקצוע' };

export default async function ProviderOnboardingPage() {
  const [{ t }, session, categories, services] = await Promise.all([
    getServerDictionary(),
    getSessionContext(),
    getCategories(),
    getServices(),
  ]);

  if (!session?.providerId) redirect('/provider');

  const supabase = await getServerSupabase();
  const { data: profile } = supabase
    ? await supabase
        .from('provider_profiles')
        .select(
          `business_name, owner_name, phone, bio, years_experience, base_price, onboarding_completed,
           provider_categories (category_id),
           provider_services (service_id),
           service_areas (label, center_lat, center_lng, radius_km),
           provider_documents (id)`,
        )
        .eq('id', session.providerId)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t.onboarding.title}</h1>
        <p className="text-sm text-muted-foreground">
          השלם את הפרטים כדי שנוכל לאמת את העסק ולשלוח לך עבודות.
        </p>
      </div>

      <ProviderOnboardingWizard
        categories={categories}
        services={services}
        initial={{
          businessName: profile?.business_name ?? '',
          ownerName: profile?.owner_name ?? session.fullName,
          phone: profile?.phone ?? session.phone ?? '',
          bio: profile?.bio ?? '',
          yearsExperience: profile?.years_experience ?? 0,
          basePrice: profile?.base_price === null || profile?.base_price === undefined
            ? null
            : Number(profile.base_price),
          categoryIds: (profile?.provider_categories ?? []).map((link) => link.category_id),
          serviceIds: (profile?.provider_services ?? []).map((link) => link.service_id),
          serviceAreas: (profile?.service_areas ?? []).map((area) => ({
            label: area.label,
            centerLat: area.center_lat,
            centerLng: area.center_lng,
            radiusKm: Number(area.radius_km),
          })),
          documentCount: (profile?.provider_documents ?? []).length,
          onboardingCompleted: profile?.onboarding_completed ?? false,
        }}
      />
    </div>
  );
}
