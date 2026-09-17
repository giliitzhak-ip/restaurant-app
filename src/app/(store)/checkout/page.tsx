import type { Metadata } from "next";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getPaymentProvider } from "@/server/payments";
import { CheckoutForm } from "@/features/checkout/checkout-form";

export const metadata: Metadata = {
  title: t.checkout.title,
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  const provider = getPaymentProvider();

  return (
    <div className="container-page py-8 md:py-12">
      <Breadcrumbs
        items={[
          { label: t.cart.title, href: routes.cart },
          { label: t.checkout.title, href: routes.checkout },
        ]}
      />
      <h1 className="mt-6 text-display-sm">{t.checkout.title}</h1>
      <div className="mt-10">
        <CheckoutForm
          paymentLabel={provider.label}
          paymentDescription={provider.description}
        />
      </div>
    </div>
  );
}
