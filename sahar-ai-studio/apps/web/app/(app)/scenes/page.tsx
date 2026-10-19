import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { PhaseNotice } from '@/components/phase-notice';
import { ProjectPicker } from '@/components/project-picker';
import { requireUser } from '@/lib/auth/session';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.scenes.title };
}

export default async function Page() {
  const user = await requireUser();
  const { t } = await getI18n();
  const page = t.pages.scenes;
  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <div className="flex flex-col gap-6">
        <ProjectPicker
          ownerId={user.id}
          suffix="scenes"
          intro={t.scenes.choose}
          empty={t.timeline.noProjects}
        />
        <PhaseNotice t={t} phase={5} features={page.features} />
      </div>
    </>
  );
}
