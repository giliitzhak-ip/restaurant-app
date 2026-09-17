"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { CartProvider } from "@/features/cart/cart-provider";
import { FavoritesProvider } from "@/features/catalog/favorites-provider";
import { trackPageView } from "@/lib/analytics";
import type { Cart, SessionUser } from "@/types/commerce";

const SessionContext = React.createContext<SessionUser | null>(null);

export function useSessionUser() {
  return React.useContext(SessionContext);
}

function PageViewTracker() {
  const pathname = usePathname();
  React.useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);
  return null;
}

export function AppProviders({
  cart,
  user,
  favorites,
  children,
}: {
  cart: Cart;
  user: SessionUser | null;
  favorites: string[];
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={user}>
      <ToastProvider>
        <TooltipProvider delayDuration={200}>
          <FavoritesProvider initialFavorites={favorites} signedIn={Boolean(user)}>
            <CartProvider initialCart={cart}>
              <PageViewTracker />
              {children}
            </CartProvider>
          </FavoritesProvider>
        </TooltipProvider>
      </ToastProvider>
    </SessionContext.Provider>
  );
}
