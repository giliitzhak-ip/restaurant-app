import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { FileText, LogOut, Pencil } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { Rating } from '@/components/ui/rating';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/states';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext } from '@/lib/auth/session';
import { getServerDictionary } from '@/lib/i18n/server';
import { formatDate } from '@/lib/utils/format';
import type { DocumentStatus, DocumentType } from '@/types/database';

export const metadata: Metadata = { title: 'הפרופיל שלי' };

const DOC_STATUS_VARIANT: Record<DocumentStatus, 'warning' | 'success' | 'destructive'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
};

const LEGAL_LINKS = [
  { href: '/legal/provider-agreement', key: 'providerAgreement' },
  { href: '/legal/payment-terms', key: 'paymentTerms' },
  { href: '/legal/cancellation', key: 'cancellation' },
  { href: '/legal/privacy', key: 'privacy' },
] as const;

export default async function ProviderProfilePage() {
  const [{ t }, session] = await Promise.all([getServerDictionary(), getSessionContext()]);
  if (!session?.providerId) redirect('/provider');

  const supabase = await getServerSupabase();
  const { data: profile } = supabase
    ? await supabase
        .from('provider_profiles')
        .select(
          `*,
           provider_categories (categories (id, name)),
           service_areas (id, label, radius_km),
           provider_documents (id, doc_type, status, file_name, review_note, created_at)`,
        )
        .eq('id', session.providerId)
        .maybeSingle()
    : { data: null };

  if (!profile) redirect('/provider/onboarding');

  const categories = (profile.provider_categories ?? [])
    .map((link) => link.categories as { id: string; name: string } | null)
    .filter((category): category is { id: string; name: string } => Boolean(category));

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start gap-4">
            <Avatar src={profile.avatar_url} name={profile.business_name} size="xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold">{profile.business_name}</h1>
                <StatusBadge kind="provider" status={profile.status} />
              </div>
              <p className="text-sm text-muted-foreground">{profile.owner_name}</p>
              <Rating value={Number(profile.rating_avg)} count={profile.rating_count} />
            </div>
          </div>

          {profile.status_reason ? (
            <p className="mt-3 rounded-lg bg-warning/10 p-3 text-sm">{profile.status_reason}</p>
          ) : null}

          <dl className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-center">
            <div>
              <dt className="text-xs text-muted-foreground">{t.provider.completedJobs}</dt>
              <dd className="num text-lg font-bold">{profile.completed_jobs}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">שנות ניסיון</dt>
              <dd className="num text-lg font-bold">{profile.years_experience}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">מחיר קריאה</dt>
              <dd className="text-lg font-bold">
                {profile.base_price ? <Price amount={Number(profile.base_price)} /> : '—'}
              </dd>
            </div>
          </dl>

          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/provider/onboarding">
              <Pencil aria-hidden />
              {t.common.edit}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.onboarding.stepCategories}</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <EmptyState title="לא נבחרו תחומים" />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <li key={category.id}>
                  <Badge variant="secondary">{category.name}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.onboarding.stepAreas}</CardTitle>
        </CardHeader>
        <CardContent>
          {!profile.service_areas?.length ? (
            <EmptyState title="לא הוגדרו אזורי שירות" />
          ) : (
            <ul className="space-y-2 text-sm">
              {profile.service_areas.map((area) => (
                <li key={area.id} className="flex items-center justify-between rounded-lg border p-3">
                  <span>{area.label}</span>
                  <span className="num text-muted-foreground">{Number(area.radius_km)} ק״מ</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4" aria-hidden />
            {t.onboarding.stepDocuments}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">{t.onboarding.documentsHint}</p>
          {!profile.provider_documents?.length ? (
            <EmptyState title="לא הועלו מסמכים" />
          ) : (
            <ul className="space-y-2 text-sm">
              {profile.provider_documents.map((document) => (
                <li
                  key={document.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {t.onboarding.documentTypes[document.doc_type as DocumentType]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {document.file_name ?? formatDate(document.created_at)}
                    </p>
                    {document.review_note ? (
                      <p className="text-xs text-destructive">{document.review_note}</p>
                    ) : null}
                  </div>
                  <Badge variant={DOC_STATUS_VARIANT[document.status as DocumentStatus]}>
                    {document.status === 'approved'
                      ? 'אושר'
                      : document.status === 'rejected'
                        ? 'נדחה'
                        : 'בבדיקה'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.landing.footerLegal}</CardTitle>
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
