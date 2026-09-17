import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/brand/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-brand-surface">
      <header className="border-b bg-background">
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
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
