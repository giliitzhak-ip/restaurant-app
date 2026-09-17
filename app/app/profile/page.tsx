import Link from 'next/link';
import type { Metadata } from 'next';
import { FileText, LogOut } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProfileForm } from '@/features/customer/components/profile-form';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'הפרופיל שלי' };

const LEGAL_LINKS = [
  { href: '/legal/terms', key: 'terms' },
  { href: '/legal/privacy', key: 'privacy' },
  { href: '/legal/cancellation', key: 'cancellation' },
  { href: '/legal/payment-terms', key: 'paymentTerms' },
] as const;

export default async function CustomerProfilePage() {
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  const supabase = await getServerSupabase();

  let defaultAddress: string | null = null;
  if (supabase && session) {
    const { data } = await supabase
      .from('customer_profiles')
      .select('default_address')
      .eq('user_id', session.userId)
      .maybeSingle();
    defaultAddress = data?.default_address ?? null;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar src={session?.avatarUrl} name={session?.fullName ?? ''} size="xl" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{session?.fullName}</h1>
          <p className="truncate text-sm text-muted-foreground">{session?.email}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.nav.profile}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            fullName={session?.fullName ?? ''}
            phone={session?.phone ?? null}
            defaultAddress={defaultAddress}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4" aria-hidden />
            {t.landing.footerLegal}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-accent hover:underline">
                  {t.legal[link.key]}
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <form action="/auth/signout" method="post">
        <Button type="submit" variant="outline" size="full">
          <LogOut aria-hidden />
          {t.common.logout}
        </Button>
      </form>
    </div>
  );
}
