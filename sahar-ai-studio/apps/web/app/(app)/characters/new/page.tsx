import type { Metadata } from 'next';
import { CharacterForm } from '@/components/characters/character-form';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { createCharacterAction } from '@/lib/character-actions';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.characters.create.title };
}

export default async function NewCharacterPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.characters.create.title} description={t.characters.description} />
      <Card className="max-w-2xl">
        <CardContent className="pt-5 sm:pt-6">
          <CharacterForm
            action={createCharacterAction}
            t={t.characters}
            common={t.common}
            submitLabel={t.characters.create.submit}
          />
        </CardContent>
      </Card>
    </>
  );
}
