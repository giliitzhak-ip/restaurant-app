export type FulfilmentMethod = "SHIPPING" | "PICKUP";

/**
 * Purchase lifecycle.
 *
 * `CART` is not a row state — no Order exists until checkout starts — but it
 * names the entry point of the machine in src/server/commerce/order-flow.ts.
 *   PAYMENT_PENDING  redirected to the gateway, waiting for its webhook
 *   PENDING          recorded, payment collected offline by a salesperson
 *   PAID             money confirmed by the provider, never by a redirect
 */
export type OrderStatus =
  | "PAYMENT_PENDING"
  | "PENDING"
  | "PAID"
  | "PAYMENT_FAILED"
  | "PROCESSING"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED";

export type PaymentEventKind =
  | "INTENT_CREATED"
  | "REDIRECTED"
  | "WEBHOOK_RECEIVED"
  | "AUTHORISED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

export interface PaymentEvent {
  id: string;
  orderId: string;
  provider: string;
  kind: PaymentEventKind;
  status: string;
  amount: number;
  currency: string;
  reference: string | null;
  eventId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export type QuoteStatus = "NEW" | "IN_PROGRESS" | "SENT" | "WON" | "LOST";

export interface CartItem {
  id: string;
  productId: string;
  productSlug: string;
  name: string;
  subtitle: string;
  imageUrl: string;
  /** Number of purchasable units (packages or items). */
  units: number;
  unitPrice: number;
  pricingUnit: "PACKAGE" | "ITEM";
  packageCoverageSqm: number | null;
  /** m² the customer actually asked for, before package rounding. */
  requestedSqm: number | null;
  /** m² delivered by `units` packages. */
  coveredSqm: number | null;
  lineTotal: number;
  /** A physical sample piece rather than sellable coverage. */
  sample: boolean;
  /** Set when the line was created from a saved room design. */
  designId: string | null;
  designLabel: string | null;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  installation: number;
  total: number;
  totalSqm: number;
  itemCount: number;
  freeShippingRemaining: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  couponCode: string | null;
  installation: boolean;
  installationSqm: number;
  fulfilment: FulfilmentMethod;
  totals: CartTotals;
  updatedAt: string;
}

export interface Address {
  id: string;
  userId: string | null;
  fullName: string;
  phone: string;
  street: string;
  city: string;
  zip: string | null;
  floor: string | null;
  isDefault: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  productSlug: string;
  name: string;
  imageUrl: string;
  units: number;
  unitPrice: number;
  coveredSqm: number | null;
  lineTotal: number;
  designId: string | null;
}

export interface Order {
  id: string;
  number: string;
  /**
   * Bearer secret for the confirmation URL. Present only on the order that was
   * just created or fetched by token — list endpoints omit it so it cannot
   * ride along into a client component.
   */
  publicToken?: string;
  userId: string | null;
  status: OrderStatus;
  customerName: string;
  phone: string;
  email: string;
  fulfilment: FulfilmentMethod;
  street: string | null;
  city: string | null;
  zip: string | null;
  floor: string | null;
  notes: string | null;
  installation: boolean;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  installationTotal: number;
  total: number;
  couponCode: string | null;
  /** Snapshot taken at purchase time, so a rate change cannot rewrite history. */
  vatRate: number;
  currency: string;
  paymentProvider: string;
  paymentReference: string | null;
  stockCommitted: boolean;
  /** Server-only: deduplicates a resubmitted checkout. */
  idempotencyKey?: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface Quote {
  id: string;
  number: string;
  userId: string | null;
  status: QuoteStatus;
  customerName: string;
  phone: string;
  email: string | null;
  city: string;
  areaSqm: number | null;
  productId: string | null;
  productName: string | null;
  designId: string | null;
  imageUrl: string | null;
  wantsInstallation: boolean;
  notes: string | null;
  createdAt: string;
}

export interface Favorite {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: "CUSTOMER" | "ADMIN";
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: "CUSTOMER" | "ADMIN";
}
