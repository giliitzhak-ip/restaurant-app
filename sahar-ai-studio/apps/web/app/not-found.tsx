import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getI18n } from '@/lib/i18n/server';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="gold-gradient-text text-6xl font-bold">404</p>
      <h1 className="text-2xl font-semibold">{t.notFound.title}</h1>
      <p className="max-w-md text-muted-foreground">{t.notFound.body}</p>
      <Button asChild variant="outline">
        <Link href="/">{t.notFound.back}</Link>
      </Button>
    </div>
  );
}
