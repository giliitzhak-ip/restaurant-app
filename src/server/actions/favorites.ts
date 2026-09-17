"use server";

import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";

export async function toggleFavoriteAction(
  productId: string,
): Promise<{ signedIn: boolean; favorite: boolean }> {
  const user = await getSessionUser();
  if (!user) return { signedIn: false, favorite: false };
  const favorite = await getRepository().toggleFavorite(user.id, productId);
  return { signedIn: true, favorite };
}

export async function listFavoritesAction(): Promise<string[]> {
  const user = await getSessionUser();
  if (!user) return [];
  return getRepository().listFavorites(user.id);
}
