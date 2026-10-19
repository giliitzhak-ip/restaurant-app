import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LanguageToggle } from '@/components/language-toggle';
import { Brand } from '@/components/shell/brand';
import { getCurrentUser } from '@/lib/auth/session';
import { getI18n } from '@/lib/i18n/server';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) redirect('/');
  const { t, locale } = await getI18n();

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 safe-area-pt safe-area-pb">
      <div
        aria-hidden
        className="pointer-events-none absolute start-1/2 -top-40 size-[36rem] -translate-x-1/2 rounded-full bg-gold-400/10 blur-3xl rtl:translate-x-1/2"
      />
      <div className="absolute end-4 top-4">
        <LanguageToggle locale={locale} labels={t.settings.language} />
      </div>
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        {children}
      </div>
    </div>
  );
}
