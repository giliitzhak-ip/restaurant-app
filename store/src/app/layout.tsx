import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'בית וגינה — פתרונות חכמים לבית ולגינה',
    template: '%s | בית וגינה',
  },
  description: 'חנות פתרונות לבית, לגינה, לסדר ולארגון, ולמניעת מזיקים לשימוש ביתי.',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'בית וגינה',
  },
}

export const viewport: Viewport = {
  themeColor: '#1d523d',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
