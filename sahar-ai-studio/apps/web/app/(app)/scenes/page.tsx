import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { PhaseNotice } from '@/components/phase-notice';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.scenes.title };
}

export default async function Page() {
  const { t } = await getI18n();
  const page = t.pages.scenes;
  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <PhaseNotice t={t} phase={5} features={page.features} />
    </>
  );
}
