"use client";

import * as React from "react";
import { toggleFavoriteAction } from "@/server/actions/favorites";

const STORAGE_KEY = "tn_favorites";

interface FavoritesContextValue {
  favorites: Set<string>;
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => void;
}

const FavoritesContext = React.createContext<FavoritesContextValue | null>(null);

function readLocal(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Favourites work for guests too: they live in localStorage, and once the
 * visitor signs in the server copy becomes the source of truth. No sign-up
 * wall on a "save for later" click.
 */
export function FavoritesProvider({
  initialFavorites,
  signedIn,
  children,
}: {
  initialFavorites: string[];
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const [favorites, setFavorites] = React.useState<Set<string>>(
    () => new Set(initialFavorites),
  );

  React.useEffect(() => {
    if (signedIn) {
      setFavorites(new Set(initialFavorites));
      return;
    }
    setFavorites(new Set(readLocal()));
  }, [initialFavorites, signedIn]);

  const toggle = React.useCallback(
    (productId: string) => {
      setFavorites((current) => {
        const next = new Set(current);
        if (next.has(productId)) next.delete(productId);
        else next.add(productId);
        if (!signedIn) {
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
          } catch {
            /* private mode — favourites simply do not persist */
          }
        }
        return next;
      });
      if (signedIn) void toggleFavoriteAction(productId);
    },
    [signedIn],
  );

  const value = React.useMemo<FavoritesContextValue>(
    () => ({
      favorites,
      isFavorite: (productId: string) => favorites.has(productId),
      toggle,
    }),
    [favorites, toggle],
  );

  return (
    <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = React.useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used inside <FavoritesProvider>");
  }
  return context;
}
