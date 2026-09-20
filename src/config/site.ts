import { brand } from "./brand";

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://example.com";

/**
 * Canonical route map. Components never hand-write a URL — they call a
 * builder from here, which keeps future locale prefixes a one-file change.
 */
export const routes = {
  home: "/",
  catalog: "/catalog",
  category: (slug: string) => `/${slug}`,
  collection: (slug: string) => `/collections/${slug}`,
  product: (slug: string) => `/product/${slug}`,
  designer: "/designer",
  designerWithProduct: (slug: string, surface?: "floor" | "wall") =>
    `/designer?product=${encodeURIComponent(slug)}${surface ? `&surface=${surface}` : ""}`,
  cart: "/cart",
  checkout: "/checkout",
  order: (number: string) => `/order/${number}`,
  quote: "/quote",
  quoteForProduct: (slug: string) => `/quote?product=${encodeURIComponent(slug)}`,
  inspiration: "/inspiration",
  faq: "/faq",
  about: "/about",
  contact: "/contact",
  privacy: "/privacy",
  terms: "/terms",
  shipping: "/shipping-returns",
  login: "/login",
  register: "/register",
  account: {
    root: "/account",
    designs: "/account/designs",
    design: (id: string) => `/account/designs/${id}`,
    orders: "/account/orders",
    favorites: "/account/favorites",
    quotes: "/account/quotes",
    profile: "/account/profile",
  },
  admin: {
    root: "/admin",
    products: "/admin/products",
    newProduct: "/admin/products/new",
    product: (id: string) => `/admin/products/${id}`,
    categories: "/admin/categories",
    collections: "/admin/collections",
    orders: "/admin/orders",
    quotes: "/admin/quotes",
    designs: "/admin/designs",
    customers: "/admin/customers",
    coupons: "/admin/coupons",
    reviews: "/admin/reviews",
    inventory: "/admin/inventory",
    /** The room designer's object library and lighting presets. */
    objects: "/admin/objects",
  },
} as const;

export type NavItem = {
  label: string;
  href: string;
  description?: string;
  children?: NavItem[];
};

/**
 * Primary navigation. Category children are hydrated from the database in
 * the header, this is the static skeleton / fallback.
 */
export const primaryNav: NavItem[] = [
  {
    label: "פרקטים",
    href: routes.category("parquet"),
    description: "עץ, SPC ולמינציה",
  },
  {
    label: "חיפויי קירות",
    href: routes.category("wall-cladding"),
    description: "פאנלים, אבן ובטון",
  },
  {
    label: "פאנלים דקורטיביים",
    href: routes.category("decorative-panels"),
    description: "תלת־מימד ואקוסטיים",
  },
  { label: "קולקציות", href: "/collections" },
  { label: "השראה", href: routes.inspiration },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "קטגוריות",
    items: [
      { label: "פרקטים", href: routes.category("parquet") },
      { label: "חיפויי קירות", href: routes.category("wall-cladding") },
      { label: "פאנלים דקורטיביים", href: routes.category("decorative-panels") },
      { label: "חיפויי עץ", href: routes.category("wood-cladding") },
      { label: "דמוי אבן ובטון", href: routes.category("stone-concrete-look") },
      { label: "אביזרים משלימים", href: routes.category("accessories") },
    ],
  },
  {
    title: "השירות שלנו",
    items: [
      { label: "מעצב החדר שלי", href: routes.designer },
      { label: "הזמנת דוגמאות", href: routes.catalog + "?sample=1" },
      { label: "קבלת הצעת מחיר", href: routes.quote },
      { label: "שירות התקנה", href: routes.faq + "#installation" },
      { label: "משלוחים והחזרות", href: routes.shipping },
    ],
  },
  {
    title: "המותג",
    items: [
      { label: "אודות", href: routes.about },
      { label: "פרויקטים", href: routes.inspiration },
      { label: "צור קשר", href: routes.contact },
      { label: "שאלות נפוצות", href: routes.faq },
    ],
  },
  {
    title: "מידע",
    items: [
      { label: "מדיניות פרטיות", href: routes.privacy },
      { label: "תקנון", href: routes.terms },
      { label: brand.contact.phone, href: brand.contact.phoneHref },
    ],
  },
];
