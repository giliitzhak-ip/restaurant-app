"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  Heart,
  Menu,
  Phone,
  Search,
  ShoppingBag,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { brand } from "@/config/brand";
import { primaryNav, routes } from "@/config/site";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { blurDataUrl } from "@/lib/media";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BrandMark } from "@/components/layout/brand-mark";
import { useCart } from "@/features/cart/cart-provider";
import { useFavorites } from "@/features/catalog/favorites-provider";
import { useSessionUser } from "@/components/providers";
import type { Category, Collection } from "@/types/catalog";

export function SiteHeader({
  categories,
  collections,
}: {
  categories: Category[];
  collections: Collection[];
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const { cart } = useCart();
  const { favorites } = useFavorites();
  const user = useSessionUser();
  const pathname = usePathname();

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const itemCount = cart.totals.itemCount;

  return (
    <>
      <div className="hidden bg-ink text-canvas md:block">
        <div className="container-page flex h-9 items-center justify-between text-xs">
          <p className="tracking-[0.06em]">
            משלוח חינם בקנייה מעל <span className="num">4,500 ₪</span> · אספקה 2–5 ימי
            עסקים
          </p>
          <a
            href={brand.contact.phoneHref}
            className="link-quiet inline-flex items-center gap-1.5"
          >
            <Phone className="size-3.5" />
            <span className="num">{brand.contact.phone}</span>
          </a>
        </div>
      </div>

      <header
        className={cn(
          "sticky top-0 z-40 border-b transition-colors duration-300",
          scrolled
            ? "border-line bg-canvas/92 backdrop-blur-md"
            : "border-transparent bg-canvas",
        )}
      >
        <div className="container-page flex h-16 items-center gap-3 md:h-20 md:gap-6">
          <IconButton
            label={t.common.menu}
            onClick={() => setMenuOpen(true)}
            className="-ms-2 lg:hidden"
          >
            <Menu />
          </IconButton>

          <BrandMark className="shrink-0 text-ink" />

          <nav
            aria-label="ניווט ראשי"
            className="hidden flex-1 items-center justify-center gap-7 lg:flex"
          >
            {primaryNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "link-quiet py-1 text-sm transition-colors",
                    active ? "text-ink" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ms-auto flex items-center gap-0.5 lg:ms-0">
            <IconButton label={t.common.search} onClick={() => setSearchOpen(true)}>
              <Search />
            </IconButton>

            <Button
              asChild
              variant="ghost"
              size="icon"
              className="relative hidden sm:inline-flex"
            >
              <Link
                href={user ? routes.account.favorites : routes.catalog}
                aria-label={t.nav.favorites}
              >
                <Heart />
              {favorites.size > 0 ? (
                <span className="num absolute end-1 top-1 flex size-4 items-center justify-center rounded-full bg-brass text-[0.625rem] text-white">
                  {favorites.size}
                </span>
                ) : null}
              </Link>
            </Button>

            <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex">
              <Link
                href={user ? routes.account.root : routes.login}
                aria-label={user ? t.nav.account : t.nav.login}
              >
                <User />
              </Link>
            </Button>

            <Button asChild variant="ghost" size="icon" className="relative">
              <Link
                href={routes.cart}
                aria-label={`${t.nav.cart}${itemCount ? ` — ${itemCount}` : ""}`}
              >
                <ShoppingBag />
              {itemCount > 0 ? (
                <span
                  data-testid="cart-count"
                  className="num absolute end-1 top-1 flex size-4 items-center justify-center rounded-full bg-ink text-[0.625rem] text-canvas"
                >
                  {itemCount}
                </span>
                ) : null}
              </Link>
            </Button>

            <Button
              asChild
              size="sm"
              variant="primary"
              className="ms-1.5 hidden md:inline-flex"
              onClick={() => track("start_room_designer", { entry: "nav" })}
            >
              <Link href={routes.designer}>
                <Sparkles />
                {t.nav.designerCta}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ---------------- mobile navigation ---------------- */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="start" className="p-0" hideClose>
          <SheetHeader className="flex items-center justify-between pe-5">
            <SheetTitle asChild>
              <span>
                <BrandMark href={null} size="sm" className="text-ink" />
              </span>
            </SheetTitle>
            <IconButton
              size="iconSm"
              label={t.common.close}
              className="text-muted"
              onClick={() => setMenuOpen(false)}
            >
              <X />
            </IconButton>
          </SheetHeader>
          {/* Any navigation inside the sheet closes it — no effect needed. */}
          <SheetBody className="px-0 py-0" onClick={() => setMenuOpen(false)}>
            <Link
              href={routes.designer}
              onClick={() => track("start_room_designer", { entry: "nav" })}
              className="flex items-center gap-3 border-b border-line bg-brass-wash px-5 py-4"
            >
              <Sparkles className="size-5 text-brass" />
              <span>
                <span className="block text-sm font-medium text-ink">
                  {t.designer.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {t.home.tryItSubtitle}
                </span>
              </span>
            </Link>

            <nav aria-label="ניווט" className="px-5 py-4">
              <p className="eyebrow mb-3">{t.catalog.groupCategory}</p>
              <ul className="space-y-1">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={routes.category(category.slug)}
                      className="flex items-center gap-3 rounded-sm py-2 text-[0.9375rem] text-ink"
                    >
                      <span className="relative size-11 shrink-0 overflow-hidden rounded-xs bg-surface-2">
                        <Image
                          src={category.tileImage}
                          alt=""
                          fill
                          sizes="44px"
                          className="object-cover"
                          placeholder="blur"
                          blurDataURL={blurDataUrl}
                        />
                      </span>
                      <span>
                        <span className="block">{category.name}</span>
                        <span className="block text-xs text-muted">
                          {category.shortDescription}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <p className="eyebrow mb-3 mt-6">{t.nav.collections}</p>
              <ul className="flex flex-wrap gap-2">
                {collections.slice(0, 6).map((collection) => (
                  <li key={collection.slug}>
                    <Link
                      href={routes.collection(collection.slug)}
                      className="inline-flex rounded-xs border border-line px-3 py-1.5 text-xs text-ink-soft"
                    >
                      {collection.name}
                    </Link>
                  </li>
                ))}
              </ul>

              <ul className="mt-6 space-y-1 border-t border-line pt-4 text-sm">
                <li>
                  <Link href={routes.catalog} className="block py-2">
                    {t.nav.catalog}
                  </Link>
                </li>
                <li>
                  <Link href={routes.inspiration} className="block py-2">
                    {t.nav.inspiration}
                  </Link>
                </li>
                <li>
                  <Link href={routes.quote} className="block py-2">
                    {t.product.requestQuote}
                  </Link>
                </li>
                <li>
                  <Link
                    href={user ? routes.account.root : routes.login}
                    className="block py-2"
                  >
                    {user ? t.nav.account : t.nav.login}
                  </Link>
                </li>
                {user?.role === "ADMIN" ? (
                  <li>
                    <Link href={routes.admin.root} className="block py-2 text-brass">
                      {t.nav.admin}
                    </Link>
                  </li>
                ) : null}
              </ul>
            </nav>
          </SheetBody>
          <SheetFooter>
            <a
              href={brand.contact.phoneHref}
              className="flex items-center gap-2 text-sm text-ink"
            >
              <Phone className="size-4 text-muted" />
              <span className="num">{brand.contact.phone}</span>
            </a>
            <p className="mt-1 text-xs text-muted">{brand.contact.hours}</p>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const [query, setQuery] = React.useState("");
  const router = useRouter();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onOpenChange(false);
    router.push(`${routes.catalog}?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="top-24 translate-y-0">
        <DialogTitle className="text-base">{t.common.search}</DialogTitle>
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.common.searchPlaceholder}
            aria-label={t.common.search}
          />
          <Button type="submit">{t.common.search}</Button>
        </form>
        <div className="mt-5">
          <p className="eyebrow mb-2">חיפושים נפוצים</p>
          <div className="flex flex-wrap gap-2">
            {["אלון נטורל", "SPC עמיד במים", "פאנל Slat", "טרוורטין", "בטון"].map(
              (term) => (
                <Button
                  key={term}
                  variant="outline"
                  size="sm"
                  className="rounded-xs px-3 text-xs text-ink-soft"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(`${routes.catalog}?q=${encodeURIComponent(term)}`);
                  }}
                >
                  {term}
                </Button>
              ),
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
