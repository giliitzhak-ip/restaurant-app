import { Suspense } from 'react';
import type { Metadata } from 'next';
import { JobWizard } from '@/features/jobs/components/job-wizard';
import { LoadingState } from '@/components/ui/states';
import { getCategories, getServices } from '@/lib/services/catalogue';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'בקשת שירות חדשה' };

export default async function NewJobPage() {
  const [{ t }, session, categories, services] = await Promise.all([
    getServerDictionary(),
    getSessionContext(),
    getCategories(),
    getServices(),
  ]);

  // Pre-fill the location step from the customer's saved default address.
  let defaults: { address: string | null; lat: number | null; lng: number | null } = {
    address: null,
    lat: null,
    lng: null,
  };

  const supabase = await getServerSupabase();
  if (supabase && session) {
    const { data } = await supabase
      .from('customer_profiles')
      .select('default_address, default_lat, default_lng')
      .eq('user_id', session.userId)
      .maybeSingle();

    if (data) {
      defaults = {
        address: data.default_address,
        lat: data.default_lat,
        lng: data.default_lng,
      };
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.wizard.title}</h1>
      <Suspense fallback={<LoadingState />}>
        <JobWizard
          categories={categories}
          services={services}
          defaultAddress={defaults.address}
          defaultLat={defaults.lat}
          defaultLng={defaults.lng}
        />
      </Suspense>
    </div>
  );
}
