import { prisma } from '@sahar/db';
import type { Metadata } from 'next';
import { EmptyList } from '@/components/empty-list';
import { PageHeader } from '@/components/page-header';
import { PhaseNotice } from '@/components/phase-notice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.pages.characters.title };
}

export default async function CharactersPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const page = t.pages.characters;
  const characters = await prisma.character.findMany({
    where: { ownerId: user.id, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, description: true },
  });

  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{page.listTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {characters.length === 0 ? (
              <EmptyList label={t.common.empty} />
            ) : (
              <ul className="divide-y divide-border">
                {characters.map((character) => (
                  <li key={character.id} className="py-3">
                    <p className="font-medium">{character.name}</p>
                    <p className="text-sm text-muted-foreground">{character.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <PhaseNotice t={t} phase={2} features={page.features} />
      </div>
    </>
  );
}
