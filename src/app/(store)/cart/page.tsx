import type { Metadata } from "next";
import { t } from "@/i18n";
import { routes } from "@/config/site";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CartView } from "@/features/cart/cart-view";

export const metadata: Metadata = {
  title: t.cart.title,
  robots: { index: false, follow: false },
  alternates: { canonical: routes.cart },
};

export default function CartPage() {
  return (
    <div className="container-page py-8 md:py-12">
      <Breadcrumbs items={[{ label: t.cart.title, href: routes.cart }]} />
      <h1 className="mt-6 text-display-sm">{t.cart.title}</h1>
      <div className="mt-10">
        <CartView />
      </div>
    </div>
  );
}
