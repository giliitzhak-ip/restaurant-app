"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/analytics";
import { t } from "@/i18n";
import { formatPrice } from "@/lib/format";
import { routes } from "@/config/site";
import { useToast } from "@/components/ui/toast";
import {
  addToCartAction,
  applyCouponAction,
  clearCartAction,
  removeCartItemAction,
  setCartUnitsAction,
  setFulfilmentAction,
  setInstallationAction,
} from "@/server/actions/cart";
import type { Cart, FulfilmentMethod } from "@/types/commerce";

interface AddInput {
  productId: string;
  slug: string;
  name: string;
  units?: number;
  sqm?: number;
  sample?: boolean;
  designId?: string | null;
  designLabel?: string | null;
  /** Suppresses the toast when the caller shows its own confirmation. */
  silent?: boolean;
}

interface CartContextValue {
  cart: Cart;
  pending: boolean;
  add: (input: AddInput) => Promise<boolean>;
  setUnits: (lineId: string, units: number) => Promise<void>;
  remove: (lineId: string, slug?: string) => Promise<void>;
  clear: () => Promise<void>;
  applyCoupon: (code: string) => Promise<boolean>;
  setInstallation: (enabled: boolean, sqm?: number) => Promise<void>;
  setFulfilment: (method: FulfilmentMethod) => Promise<void>;
}

const CartContext = React.createContext<CartContextValue | null>(null);

export function CartProvider({
  initialCart,
  children,
}: {
  initialCart: Cart;
  children: React.ReactNode;
}) {
  const [cart, setCart] = React.useState(initialCart);
  const [syncedCart, setSyncedCart] = React.useState(initialCart);
  const [pending, startTransition] = React.useTransition();
  const { toast } = useToast();
  const router = useRouter();

  // Server-rendered pages are the source of truth: when a navigation brings a
  // fresh cart, adopt it during render rather than in an effect.
  if (initialCart !== syncedCart) {
    setSyncedCart(initialCart);
    setCart(initialCart);
  }

  const run = React.useCallback(
    <T,>(work: () => Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        startTransition(() => {
          work().then(resolve, reject);
        });
      }),
    [],
  );

  const add = React.useCallback<CartContextValue["add"]>(
    async (input) => {
      const result = await run(() =>
        addToCartAction({
          productId: input.productId,
          units: input.units,
          sqm: input.sqm,
          sample: input.sample,
          designId: input.designId,
          designLabel: input.designLabel,
        }),
      );
      setCart(result.cart);
      if (!result.ok) {
        toast({ tone: "error", title: t.states.errorTitle, description: t.states.errorBody });
        return false;
      }
      const line = result.cart.items.find((item) => item.productSlug === input.slug);
      track("add_to_cart", {
        slug: input.slug,
        units: line?.units ?? input.units ?? 1,
        sqm: input.sqm ?? null,
        value: line?.lineTotal ?? 0,
        fromDesign: Boolean(input.designId),
      });
      if (!input.silent) {
        toast({
          title: t.product.added,
          description: input.name,
          action: { label: t.cart.checkout, href: routes.cart },
        });
      }
      router.refresh();
      return true;
    },
    [router, run, toast],
  );

  const setUnits = React.useCallback<CartContextValue["setUnits"]>(
    async (lineId, units) => {
      const result = await run(() => setCartUnitsAction(lineId, units));
      setCart(result.cart);
      router.refresh();
    },
    [router, run],
  );

  const remove = React.useCallback<CartContextValue["remove"]>(
    async (lineId, slug) => {
      const line = cart.items.find((item) => item.id === lineId);
      const result = await run(() => removeCartItemAction(lineId));
      setCart(result.cart);
      track("remove_from_cart", {
        slug: slug ?? line?.productSlug ?? "",
        units: line?.units ?? 0,
      });
      router.refresh();
    },
    [cart.items, router, run],
  );

  const clear = React.useCallback(async () => {
    const result = await run(() => clearCartAction());
    setCart(result.cart);
    router.refresh();
  }, [router, run]);

  const applyCouponValue = React.useCallback(async (code: string) => {
    const result = await run(() => applyCouponAction(code));
    setCart(result.cart);
    if (!result.ok) {
      toast({
        tone: "error",
        title:
          result.error === "MIN_NOT_MET"
            ? t.cart.couponMinNotMet
            : t.cart.couponInvalid,
        description:
          result.error === "MIN_NOT_MET" && result.minSubtotal
            ? t.cart.couponMinHint(formatPrice(result.minSubtotal))
            : undefined,
      });
      return false;
    }
    toast({ title: t.cart.couponApplied });
    router.refresh();
    return true;
  }, [router, run, toast]);

  const setInstallationValue = React.useCallback(
    async (enabled: boolean, sqm?: number) => {
      const result = await run(() => setInstallationAction(enabled, sqm));
      setCart(result.cart);
      if (enabled) toast({ title: t.cart.installationAdded });
      router.refresh();
    },
    [router, run, toast],
  );

  const setFulfilmentValue = React.useCallback(
    async (method: FulfilmentMethod) => {
      const result = await run(() => setFulfilmentAction(method));
      setCart(result.cart);
      router.refresh();
    },
    [router, run],
  );

  const value = React.useMemo<CartContextValue>(
    () => ({
      cart,
      pending,
      add,
      setUnits,
      remove,
      clear,
      applyCoupon: applyCouponValue,
      setInstallation: setInstallationValue,
      setFulfilment: setFulfilmentValue,
    }),
    [
      add,
      applyCouponValue,
      cart,
      clear,
      pending,
      remove,
      setFulfilmentValue,
      setInstallationValue,
      setUnits,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = React.useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside <CartProvider>");
  return context;
}
