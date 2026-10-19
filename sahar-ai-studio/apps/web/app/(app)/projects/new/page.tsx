import { CONSENT_STATEMENTS } from '@sahar/shared';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { NewProjectForm } from '@/components/projects/new-project-form';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { listCharacterOptions } from '@/lib/characters';
import { getServerEnv } from '@/lib/env';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.newProject.title };
}

export default async function NewProjectPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const characters = await listCharacterOptions(user.id);
  const consent = CONSENT_STATEMENTS.MUSIC;
  return (
    <>
      <PageHeader title={t.pages.newProject.title} description={t.pages.newProject.description} />
      <Card className="max-w-2xl">
        <CardContent className="pt-5 sm:pt-6">
          <NewProjectForm
            t={t}
            characters={characters.map((c) => ({
              id: c.id,
              name: c.name,
              hasReference: c.referenceImages.length > 0,
            }))}
            maxMb={getServerEnv().MAX_AUDIO_UPLOAD_MB}
            consentText={consent[locale]}
            consentVersion={consent.version}
          />
        </CardContent>
      </Card>
    </>
  );
}
