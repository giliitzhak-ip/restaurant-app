import type { Metadata, Viewport } from "next";
import { Assistant, Frank_Ruhl_Libre } from "next/font/google";
import { brand } from "@/config/brand";
import { siteUrl } from "@/config/site";
import { defaultLocale, localeMeta, t } from "@/i18n";
import { AppProviders } from "@/components/providers";
import { getCart } from "@/server/cart/cart-service";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { cookies } from "next/headers";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import "./globals.css";

const sans = Assistant({
  subsets: ["hebrew", "latin"],
  variable: "--font-assistant",
  display: "swap",
});

const display = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  variable: "--font-frank",
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${brand.name} — ${brand.tagline}`,
    template: `%s · ${brand.name}`,
  },
  description: t.home.heroSubtitle,
  applicationName: brand.name,
  openGraph: {
    type: "website",
    locale: localeMeta[defaultLocale].htmlLang,
    siteName: brand.name,
    title: `${brand.name} — ${brand.tagline}`,
    description: t.home.heroSubtitle,
    url: siteUrl,
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f4f1",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cart, user, jar] = await Promise.all([getCart(), getSessionUser(), cookies()]);
  const favorites = user ? await getRepository().listFavorites(user.id) : [];
  /*
   * Read here rather than in the client so a returning visitor's choice is
   * known at first paint. A banner that flashes on for someone who already
   * answered is its own kind of nagging.
   */
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);

  return (
    <html
      lang={localeMeta[defaultLocale].htmlLang}
      dir={localeMeta[defaultLocale].dir}
      className={`${sans.variable} ${display.variable}`}
      // Smooth scrolling is intentional; this tells Next not to warn about it.
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[200] focus:rounded-sm focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-canvas"
        >
          {t.common.skipToContent}
        </a>
        <AppProviders cart={cart} user={user} favorites={favorites} consent={consent}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
