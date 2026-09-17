import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { ProductCard } from "@/features/catalog/product-card";

export const metadata: Metadata = {
  title: t.account.favorites,
  robots: { index: false, follow: false },
};

export default async function AccountFavoritesPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const repository = getRepository();
  const ids = await repository.listFavorites(user.id);
  const products = await repository.getProductsByIds(ids);

  if (!products.length) {
    return (
      <EmptyState
        icon={<Heart />}
        title={t.account.favoritesEmpty}
        action={
          <Button asChild>
            <Link href={routes.catalog}>{t.cart.emptyCta}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <h2 className="text-xl">{t.account.favorites}</h2>
      <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </div>
  );
}
