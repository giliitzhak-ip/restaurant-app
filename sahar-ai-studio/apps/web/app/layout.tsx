import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import type { ReactNode } from 'react';
import { getDictionary, getDirection } from '@/lib/i18n/config';
import { getLocale } from '@/lib/i18n/server';
import './globals.css';

const heebo = Heebo({ subsets: ['hebrew', 'latin'], variable: '--font-heebo', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return {
    title: { default: t.meta.title, template: `%s · ${t.meta.title}` },
    description: t.meta.description,
    robots: { index: false, follow: false },
    appleWebApp: { capable: true, title: 'SAHAR', statusBarStyle: 'black-translucent' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#09090b',
  colorScheme: 'dark',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={getDirection(locale)} className={heebo.variable}>
      <body>{children}</body>
    </html>
  );
}
