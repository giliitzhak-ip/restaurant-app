import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMART MABAT · AI Marketing",
  description: "מבט חכם – מערכת שיווק אוטומטית לאינסטגרם",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "מבט חכם", statusBarStyle: "black-translucent" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#03060c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
