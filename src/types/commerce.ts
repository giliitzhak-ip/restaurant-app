export type FulfilmentMethod = "SHIPPING" | "PICKUP";

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED";

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
  paymentProvider: string;
  paymentReference: string | null;
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
