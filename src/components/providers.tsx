"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineBanner } from "@/components/offline-banner";
import { ToastProvider } from "@/components/ui/toast";
import { CartProvider } from "@/features/cart/cart-provider";
import { FavoritesProvider } from "@/features/catalog/favorites-provider";
import { trackPageView } from "@/lib/analytics";
import { ConsentProvider, useConsent } from "@/components/consent/consent-provider";
import { CookieBanner } from "@/components/consent/cookie-banner";
import type { ConsentChoice } from "@/lib/consent";
import type { Cart, SessionUser } from "@/types/commerce";

const SessionContext = React.createContext<SessionUser | null>(null);

export function useSessionUser() {
  return React.useContext(SessionContext);
}

/**
 * Page views, gated on consent.
 *
 * The effect still runs on every navigation, but it does nothing at all until
 * the visitor has both decided *and* allowed analytics. That ordering is the
 * point: there is no window in which a page view is recorded "just this once"
 * before the banner is answered.
 */
function PageViewTracker() {
  const pathname = usePathname();
  const { consent, decided } = useConsent();
  const allowed = decided && consent.analytics;
  React.useEffect(() => {
    if (!allowed) return;
    trackPageView(pathname);
  }, [pathname, allowed]);
  return null;
}

export function AppProviders({
  cart,
  user,
  favorites,
  consent,
  children,
}: {
  cart: Cart;
  user: SessionUser | null;
  favorites: string[];
  consent: ConsentChoice;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={user}>
      <ConsentProvider initial={consent}>
        <ToastProvider>
          <TooltipProvider delayDuration={200}>
            <FavoritesProvider initialFavorites={favorites} signedIn={Boolean(user)}>
              <CartProvider initialCart={cart}>
                <PageViewTracker />
                <OfflineBanner />
                {children}
                <CookieBanner />
              </CartProvider>
            </FavoritesProvider>
          </TooltipProvider>
        </ToastProvider>
      </ConsentProvider>
    </SessionContext.Provider>
  );
}
