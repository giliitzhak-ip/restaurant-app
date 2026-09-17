import type { Metadata, Viewport } from 'next';
import { Assistant } from 'next/font/google';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { directionOf } from '@/lib/i18n/config';
import { getLocale } from '@/lib/i18n/server';
import './globals.css';

// Assistant covers Hebrew and Latin; Arabic and Cyrillic fall back to system UI.
const assistant = Assistant({
  subsets: ['hebrew', 'latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'GET SERVICE — המקצוען הנכון. בדיוק כשצריך.',
    template: '%s | GET SERVICE',
  },
  description:
    'GET SERVICE מחברת בין לקוחות לבעלי מקצוע מאומתים בסביבה, בזמן אמת: בקשה, הצעות מחיר, מעקב ותשלום מאובטח.',
  applicationName: 'GET SERVICE',
  openGraph: {
    title: 'GET SERVICE',
    description: 'המקצוען הנכון. בדיוק כשצריך.',
    type: 'website',
    locale: 'he_IL',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0b1220',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} dir={directionOf(locale)} suppressHydrationWarning>
      <body className={`${assistant.variable} font-sans`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          דילוג לתוכן הראשי
        </a>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
