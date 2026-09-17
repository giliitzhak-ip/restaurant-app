"use client";

import * as React from "react";
import { toggleFavoriteAction } from "@/server/actions/favorites";
import {
  getFavoritesServerSnapshot,
  getFavoritesSnapshot,
  initFavorites,
  subscribeFavorites,
  toggleFavoriteLocal,
} from "./favorites-store";

interface FavoritesContextValue {
  favorites: ReadonlySet<string>;
  isFavorite: (productId: string) => boolean;
  toggle: (productId: string) => void;
}

const FavoritesContext = React.createContext<FavoritesContextValue | null>(null);

/**
 * Favourites work for guests too — they live in localStorage until the visitor
 * signs in, at which point the server copy takes over. No sign-up wall on a
 * "save for later" click.
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
  // Runs before the first subscription reads the snapshot, and again whenever
  // the session or the server list changes.
  React.useMemo(
    () => initFavorites(initialFavorites, signedIn),
    [initialFavorites, signedIn],
  );

  const favorites = React.useSyncExternalStore(
    subscribeFavorites,
    getFavoritesSnapshot,
    getFavoritesServerSnapshot,
  );

  const toggle = React.useCallback(
    (productId: string) => {
      toggleFavoriteLocal(productId);
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
