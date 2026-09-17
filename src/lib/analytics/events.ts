/**
 * The analytics contract. Adding an event means adding it here first, which
 * keeps the names stable across drivers (and makes them greppable).
 */
export interface AnalyticsEvents {
  view_product: { slug: string; name: string; price: number; category: string };
  view_category: { slug: string; results: number };
  search: { query: string; results: number };
  filter_catalog: { facet: string; value: string };
  start_room_designer: { entry: "home" | "product" | "nav" | "deeplink" };
  upload_room: { source: "camera" | "file" | "demo"; width: number; height: number };
  analyze_room: {
    provider: string;
    durationMs: number;
    surfaces: number;
    warnings: string[];
  };
  select_surface: { surface: "FLOOR" | "WALL"; source: "AUTO" | "MANUAL" };
  apply_product: { slug: string; surface: "FLOOR" | "WALL" };
  save_design: { designId: string; products: number; areaSqm: number };
  calculate_area: { areaSqm: number; packages: number; wastePercent: number; rooms: number };
  add_to_cart: {
    slug: string;
    units: number;
    sqm: number | null;
    value: number;
    fromDesign: boolean;
  };
  remove_from_cart: { slug: string; units: number };
  request_quote: { productSlug: string | null; areaSqm: number | null; withDesign: boolean };
  order_sample: { slug: string };
  begin_checkout: { value: number; items: number };
  purchase: { orderNumber: string; value: number; items: number };
  newsletter_signup: { source: string };
}

export type AnalyticsEventName = keyof AnalyticsEvents;
