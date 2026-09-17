import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { getServerDictionary } from '@/lib/i18n/server';

const LINKS = [
  { href: '/legal/terms', key: 'terms' },
  { href: '/legal/privacy', key: 'privacy' },
  { href: '/legal/cancellation', key: 'cancellation' },
  { href: '/legal/provider-agreement', key: 'providerAgreement' },
  { href: '/legal/payment-terms', key: 'paymentTerms' },
] as const;

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getServerDictionary();

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo size="sm" />
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            חזרה לאתר
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>

      <main id="main" className="container-page py-8">
        {/* Every document here is an unreviewed draft. Saying so is not optional. */}
        <div
          role="note"
          className="mb-6 flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          <AlertTriangle className="size-5 shrink-0 text-warning" aria-hidden />
          <p>
            <strong>טיוטה — לא אושרה משפטית.</strong> {t.legal.draftNotice}
          </p>
        </div>

        <nav aria-label={t.landing.footerLegal} className="mb-8 flex flex-wrap gap-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              {t.legal[link.key]}
            </Link>
          ))}
        </nav>

        <article className="prose-gs space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:text-muted-foreground [&_ul]:list-disc [&_ul]:ps-6">
          {children}
        </article>
      </main>
    </div>
  );
}
