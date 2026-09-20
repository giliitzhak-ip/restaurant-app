"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, ShoppingBag } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatPrice } from "@/lib/format";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormMessage } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { Steps, type Step } from "@/components/ui/steps";
import { useToast } from "@/components/ui/toast";
import { CartSummary } from "@/features/cart/cart-summary";
import { israeliCities } from "@/data/israeli-cities";
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

  /*
   * `useWatch` subscribes to one field through the form's store; `form.watch()`
   * hands back a fresh function on every render, which the React Compiler
   * cannot memoize and which quietly opts this whole component out of
   * optimisation.
   */
  const fulfilment = useWatch({ control: form.control, name: "fulfilment" });
  const termsAccepted = useWatch({ control: form.control, name: "terms" });
  const contact = useWatch({
    control: form.control,
    name: ["fullName", "email", "phone"],
  });
  const address = useWatch({ control: form.control, name: ["street", "city"] });

  /*
   * Which sections are filled in. Read straight off the form's own values —
   * there is no separate notion of progress being kept in sync with the
   * fields, so the indicator cannot drift away from what is on screen, and it
   * never claims a step is done because time has passed.
   */
  const contactDone = contact.every((value) => Boolean(value?.trim()));
  const deliveryDone =
    fulfilment === "PICKUP" || address.every((value) => Boolean(value?.trim()));

  const steps: Step[] = [
    {
      id: "contact",
      label: t.checkout.contact,
      state: contactDone ? "done" : "current",
    },
    {
      id: "delivery",
      label: t.checkout.delivery,
      state: deliveryDone ? "done" : contactDone ? "current" : "upcoming",
    },
    {
      id: "payment",
      label: t.checkout.payment,
      state:
        contactDone && deliveryDone && termsAccepted === true ? "current" : "upcoming",
    },
  ];

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

  /*
   * Errors move the page only after someone has pressed the button. Scrolling
   * while a form is still being filled in — on blur, on change — moves the
   * field out from under the cursor of the person typing in it.
   */
  const focusFirstError = () => {
    const invalid = document.querySelector<HTMLElement>(
      "form [aria-invalid='true']",
    );
    if (!invalid) return;
    invalid.scrollIntoView({ block: "center", behavior: "smooth" });
    invalid.focus({ preventScroll: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    /*
     * No client nonce is sent: the server derives the idempotency key from the
     * basket itself (cart id, lines, prices, contact details), which already
     * collapses a double-clicked button or a retried request into one order.
     * A nonce would have to be minted during render to be stable, and random
     * values during render are impure.
     */
    const result = await placeOrderAction(values);
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          form.setError(field as keyof CheckoutInput, {
            message: messages?.[0] ?? t.common.required,
          });
        }
      }
      // Each failure names what to do about it, rather than "something went wrong".
      const messages: Record<string, { title: string; description: string }> = {
        PAYMENT_FAILED: {
          title: "התשלום נכשל",
          description:
            "לא הצלחנו לפתוח את עמוד הסליקה ולא בוצע חיוב. נסו שוב או התקשרו אלינו ונשלים את ההזמנה.",
        },
        OUT_OF_STOCK: {
          title: "המלאי השתנה",
          description: result.shortages?.length
            ? `נשאר פחות ממה שביקשתם מ־${result.shortages
                .map((item) => `${item.name} (${item.available} במקום ${item.requested})`)
                .join(", ")}. עדכנו את הכמות בסל ונמשיך.`
            : "חלק מהפריטים אזלו בזמן ההזמנה. עדכנו את הסל ונמשיך.",
        },
        EMPTY_CART: { title: t.cart.empty, description: t.cart.emptyBody },
        RATE_LIMITED: {
          title: "רגע אחד",
          description: "נשלחו יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.",
        },
      };
      const copy = messages[result.error] ?? {
        title: t.states.errorTitle,
        description: t.states.errorBody,
      };
      toast({ tone: "error", ...copy });
      if (result.error === "OUT_OF_STOCK") router.push(routes.cart);
      else if (result.fieldErrors) focusFirstError();
      return;
    }

    track("purchase", {
      orderNumber: result.orderNumber,
      value: cart.totals.total,
      items: cart.totals.itemCount,
    });

    if (result.redirectUrl) {
      // assign() rather than `location.href = …`: the same navigation, but a
      // method call instead of mutating a value the component does not own.
      window.location.assign(result.redirectUrl);
      return;
    }
    // The token is what authorises the confirmation page for a guest.
    router.push(`${routes.order(result.orderNumber)}?token=${encodeURIComponent(result.token)}`);
  }, focusFirstError);

  return (
    <form onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
      <div className="space-y-10">
        <Steps steps={steps} compact className="-mt-2" />

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

          {/*
            * Shown and hidden rather than collapsed. Animating the height of
            * a block of four fields is the one transition here that would
            * reflow the page on every frame, and it would do it while the
            * radio it belongs to is under the thumb. It fades instead.
            */}
          {fulfilment === "SHIPPING" ? (
            <div className="enter-soft mt-5 grid gap-4 sm:grid-cols-2">
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
                  {...form.register("street")}
                />
              </Field>
              <Field
                label={t.checkout.city}
                htmlFor="city"
                required
                error={form.formState.errors.city?.message}
              >
                <Input
                  id="city"
                  list="city-suggestions"
                  autoComplete="address-level2"
                  {...form.register("city")}
                />
                {/*
                  Local suggestions, not a geocoding service: this saves the
                  typing without sending every keystroke of someone's home
                  address to a third party, and it cannot break checkout when
                  that service is down. Free text still works.
                */}
                <datalist id="city-suggestions">
                  {israeliCities.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
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

      {/*
        Sticky beside the form on desktop, so the total stays in view while the
        address is filled in — surprise at the last step is where carts get
        abandoned. On mobile it sits directly above the submit button, which is
        the moment it matters.
      */}
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
                checked={termsAccepted === true}
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
            <FormMessage tone="error">
              {form.formState.errors.terms?.message}
            </FormMessage>

            {/*
              * `loading` rather than a label swap: "מעבד…" is narrower than
              * "השלמת ההזמנה", and a submit button that shrinks the moment it
              * is pressed is the last thing anyone should see at checkout. The
              * label stays where it is and the spinner sits over it.
              */}
            <Button
              type="submit"
              block
              size="lg"
              loading={form.formState.isSubmitting}
              loadingLabel={t.checkout.processing}
            >
              {t.checkout.placeOrder}
            </Button>
          </div>
        </CartSummary>
      </div>
    </form>
  );
}
