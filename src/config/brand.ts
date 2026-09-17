/**
 * Brand configuration — every business detail the storefront renders lives
 * here so the client can be rebranded without touching a single component.
 *
 * Values marked PLACEHOLDER are safe stand-ins for launch-time content.
 */
export const brand = {
  /** PLACEHOLDER — replace with the real brand name. */
  name: "טרה נובה",
  nameLatin: "TERRA NOVA",
  tagline: "משטחים לבית המעוצב",
  /** PLACEHOLDER — drop a real SVG at public/brand/logo.svg to override. */
  logo: {
    wordmark: "/brand/logo.svg",
    monogram: "/brand/monogram.svg",
  },
  contact: {
    /** PLACEHOLDER */
    phone: "03-0000000",
    phoneHref: "tel:+9723000000",
    whatsapp: "+972500000000",
    email: "hello@example.com",
    address: "רחוב האומן 12, תל אביב",
    hours: "א׳–ה׳ 09:00–18:00 · ו׳ 09:00–13:00",
  },
  social: {
    instagram: "https://instagram.com/",
    facebook: "https://facebook.com/",
    pinterest: "https://pinterest.com/",
  },
  legal: {
    companyName: "טרה נובה משטחים בע״מ",
    /** PLACEHOLDER */
    companyId: "00-0000000",
  },
} as const;

export const commerce = {
  currency: "ILS",
  currencySymbol: "₪",
  /** VAT is displayed as included; change once the accountant confirms. */
  vatRate: 0.18,
  vatIncludedInPrices: true,
  freeShippingThreshold: 4500,
  shippingFlatRate: 290,
  pickupEnabled: true,
  /** Sample ordering — flat fee per sample, refunded on purchase. */
  samplePrice: 29,
  /** Installation service, priced per m². Set to null to hide the add-on. */
  installationPricePerSqm: 65,
  /** Default waste allowance pre-selected in the calculator. */
  defaultWastePercent: 10,
  wasteOptions: [5, 10, 15] as const,
} as const;

export const designerConfig = {
  /** Uploaded room photos are deleted after this many days for guests. */
  guestImageRetentionDays: 7,
  /** Retention for photos attached to a saved design of a signed-in user. */
  accountImageRetentionDays: 365,
  maxUploadBytes: 12 * 1024 * 1024,
  maxRenderEdge: 1600,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
} as const;

export type Brand = typeof brand;
