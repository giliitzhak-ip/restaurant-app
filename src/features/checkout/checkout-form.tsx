"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, ShoppingBag } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatPrice } from "@/lib/format";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { useToast } from "@/components/ui/toast";
import { CartSummary } from "@/features/cart/cart-summary";
import { useCart } from "@/features/cart/cart-provider";
import { useSessionUser } from "@/components/providers";
import { placeOrderAction } from "@/server/actions/checkout";
import { checkoutSchema, type CheckoutInput } from "@/features/checkout/schema";

export function CheckoutForm({
  paymentLabel,
  paymentDescription,
}: {
  paymentLabel: string;
  paymentDescription: string;
}) {
  const { cart, setFulfilment } = useCart();
  const user = useSessionUser();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      fullName: user?.fullName ?? "",
      email: user?.email ?? "",
      phone: "",
      fulfilment: cart.fulfilment,
      street: "",
      city: "",
      zip: "",
      floor: "",
      notes: "",
      terms: false as unknown as true,
    },
  });

  const fulfilment = form.watch("fulfilment");

  React.useEffect(() => {
    if (fulfilment !== cart.fulfilment) void setFulfilment(fulfilment);
  }, [cart.fulfilment, fulfilment, setFulfilment]);

  if (!cart.items.length) {
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title={t.cart.empty}
        body={t.cart.emptyBody}
        action={
          <Button asChild>
            <Link href={routes.catalog}>{t.cart.emptyCta}</Link>
          </Button>
        }
      />
    );
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await placeOrderAction(values);
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof CheckoutInput, {
            message: messages?.[0] ?? t.common.required,
          });
        }
      }
      toast({
        tone: "error",
        title: result.error === "PAYMENT_FAILED" ? "התשלום נכשל" : t.states.errorTitle,
        description:
          result.error === "PAYMENT_FAILED"
            ? "לא הצלחנו לפתוח את עמוד הסליקה. נסו שוב או התקשרו אלינו ונשלים את ההזמנה."
            : t.states.errorBody,
      });
      return;
    }

    track("purchase", {
      orderNumber: result.orderNumber,
      value: cart.totals.total,
      items: cart.totals.itemCount,
    });

    if (result.redirectUrl) {
      window.location.href = result.redirectUrl;
      return;
    }
    router.push(routes.order(result.orderNumber));
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
      <div className="space-y-10">
        <fieldset>
          <legend className="text-lg">{t.checkout.contact}</legend>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label={t.checkout.fullName}
              htmlFor="fullName"
              required
              error={form.formState.errors.fullName?.message}
            >
              <Input
                id="fullName"
                autoComplete="name"
                aria-invalid={Boolean(form.formState.errors.fullName)}
                {...form.register("fullName")}
              />
            </Field>
            <Field
              label={t.checkout.phone}
              htmlFor="phone"
              required
              error={form.formState.errors.phone?.message}
            >
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="050-0000000"
                className="num"
                aria-invalid={Boolean(form.formState.errors.phone)}
                {...form.register("phone")}
              />
            </Field>
            <Field
              label={t.checkout.email}
              htmlFor="email"
              required
              error={form.formState.errors.email?.message}
              className="sm:col-span-2"
            >
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(form.formState.errors.email)}
                {...form.register("email")}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-lg">{t.checkout.delivery}</legend>
          <RadioGroup
            value={fulfilment}
            onValueChange={(value) =>
              form.setValue("fulfilment", value as "SHIPPING" | "PICKUP")
            }
            className="mt-4 gap-2 sm:grid-cols-2"
          >
            <RadioCard
              value="SHIPPING"
              title={t.checkout.shippingOption}
              description="2–5 ימי עסקים"
            />
            <RadioCard
              value="PICKUP"
              title={t.checkout.pickupOption}
              description="מוכן לאיסוף בתוך 24 שעות"
            />
          </RadioGroup>

          {fulfilment === "SHIPPING" ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                label={t.checkout.street}
                htmlFor="street"
                required
                error={form.formState.errors.street?.message}
                className="sm:col-span-2"
              >
                <Input
                  id="street"
                  autoComplete="street-address"
                  aria-invalid={Boolean(form.formState.errors.street)}
                  {...form.register("street")}
                />
              </Field>
              <Field
                label={t.checkout.city}
                htmlFor="city"
                required
                error={form.formState.errors.city?.message}
              >
                <Input id="city" autoComplete="address-level2" {...form.register("city")} />
              </Field>
              <Field label={t.checkout.zip} htmlFor="zip">
                <Input
                  id="zip"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  className="num"
                  {...form.register("zip")}
                />
              </Field>
              <Field label={t.checkout.floor} htmlFor="floor">
                <Input id="floor" {...form.register("floor")} />
              </Field>
            </div>
          ) : null}

          <Field
            label={t.checkout.notes}
            htmlFor="notes"
            hint={t.checkout.notesPlaceholder}
            className="mt-5"
          >
            <Textarea id="notes" rows={3} {...form.register("notes")} />
          </Field>
        </fieldset>

        <fieldset>
          <legend className="text-lg">{t.checkout.payment}</legend>
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-line bg-surface p-5">
            <Lock className="mt-0.5 size-5 shrink-0 text-brass" />
            <div>
              <p className="text-sm font-medium text-ink">{paymentLabel}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {paymentDescription}
              </p>
            </div>
          </div>
        </fieldset>
      </div>

      <div className="lg:sticky lg:top-24 lg:h-fit">
        <CartSummary cart={cart}>
          <div className="space-y-4">
            <ul className="space-y-3 border-t border-line pt-4">
              {cart.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-xs bg-surface-2">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-ink">{item.name}</span>
                    <span className="num block text-xs text-muted">
                      {item.units} × {formatPrice(item.unitPrice)}
                      {item.coveredSqm ? ` · ${formatArea(item.coveredSqm)}` : ""}
                    </span>
                  </span>
                  <span className="num shrink-0 text-xs text-ink">
                    {formatPrice(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>

            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-ink-soft">
              <Checkbox
                checked={form.watch("terms") === true}
                onCheckedChange={(checked) =>
                  form.setValue("terms", (checked === true) as true, {
                    shouldValidate: true,
                  })
                }
                aria-invalid={Boolean(form.formState.errors.terms)}
                className="mt-0.5"
              />
              <span>
                {t.checkout.agreeTerms}{" "}
                <Link href={routes.terms} className="link-quiet underline">
                  תקנון
                </Link>
                {" · "}
                <Link href={routes.privacy} className="link-quiet underline">
                  פרטיות
                </Link>
              </span>
            </label>
            {form.formState.errors.terms ? (
              <p role="alert" className="text-xs text-danger">
                {form.formState.errors.terms.message}
              </p>
            ) : null}

            <Button
              type="submit"
              block
              size="lg"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting
                ? t.checkout.processing
                : t.checkout.placeOrder}
            </Button>
          </div>
        </CartSummary>
      </div>
    </form>
  );
}
