import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GET SERVICE — צריך? אנחנו מוצאים.',
  description:
    'GET SERVICE היא רשת שירות בזמן אמת. תארו מה קרה, ואנחנו נמצא את בעל המקצוע המתאים שכבר נמצא באזור שלכם.',
  applicationName: 'GET SERVICE',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#060a14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:font-semibold focus:text-bg"
        >
          דילוג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  );
}
