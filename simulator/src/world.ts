import type { MatchCandidate } from '@/lib/services/matching/types';
import { haversineKm, type LatLng } from '@/lib/utils/geo';

/**
 * The simulated world: providers scattered across the Tel Aviv metro area.
 *
 * This file is the only invented part of the simulator. Everything it feeds
 * into — scoring, radius expansion, fees, the job state machine — is the real
 * application code imported from `lib/services`.
 */

export const MAP_CENTER: LatLng = { lat: 32.0853, lng: 34.7818 };

/** Bounding box the schematic map projects, roughly 24 km across. */
export const MAP_BOUNDS = {
  north: 32.195,
  south: 31.975,
  west: 34.68,
  east: 34.93,
};

export interface SimProvider {
  id: string;
  businessName: string;
  ownerName: string;
  categorySlugs: string[];
  serviceSlugs: string[];
  home: LatLng;
  /** Declared service-area radius, in km. */
  areaRadiusKm: number;
  isAvailable: boolean;
  /** Seconds since the provider last reported a position; null if never. */
  locationAgeSeconds: number | null;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  cancelledJobs: number;
  avgResponseSeconds: number | null;
  basePrice: number;
  yearsExperience: number;
  isVerified: boolean;
  /** Probability the provider bothers to quote. Pure simulation flavour. */
  quoteRate: number;
}

export const PROVIDERS: SimProvider[] = [
  {
    id: 'p-avi',
    businessName: 'א.ב. אינסטלציה',
    ownerName: 'אבי מור',
    categorySlugs: ['plumbing', 'sewage'],
    serviceSlugs: ['leak', 'blockage', 'leak-detection', 'faucet-replace'],
    home: { lat: 32.0801, lng: 34.7745 },
    areaRadiusKm: 15,
    isAvailable: true,
    locationAgeSeconds: 90,
    ratingAvg: 4.8,
    ratingCount: 47,
    completedJobs: 63,
    cancelledJobs: 1,
    avgResponseSeconds: 240,
    basePrice: 350,
    yearsExperience: 12,
    isVerified: true,
    quoteRate: 0.95,
  },
  {
    id: 'p-shlomo',
    businessName: 'שלמה שרברבות',
    ownerName: 'שלמה אלבז',
    categorySlugs: ['plumbing'],
    serviceSlugs: ['blockage', 'toilet-repair', 'boiler'],
    home: { lat: 32.1012, lng: 34.8291 },
    areaRadiusKm: 12,
    isAvailable: true,
    locationAgeSeconds: 1500,
    ratingAvg: 4.3,
    ratingCount: 12,
    completedJobs: 18,
    cancelledJobs: 0,
    avgResponseSeconds: 720,
    basePrice: 300,
    yearsExperience: 5,
    isVerified: true,
    quoteRate: 0.8,
  },
  {
    id: 'p-pro',
    businessName: 'פרו אינסטלציה 24/7',
    ownerName: 'דניאל חדד',
    categorySlugs: ['plumbing', 'sewage', 'sealing'],
    serviceSlugs: ['leak', 'leak-detection', 'sewer-opening', 'damp-treatment'],
    home: { lat: 32.0421, lng: 34.7612 },
    areaRadiusKm: 25,
    isAvailable: true,
    locationAgeSeconds: 45,
    ratingAvg: 4.9,
    ratingCount: 91,
    completedJobs: 152,
    cancelledJobs: 2,
    avgResponseSeconds: 180,
    basePrice: 500,
    yearsExperience: 20,
    isVerified: true,
    quoteRate: 0.9,
  },
  {
    id: 'p-nir',
    businessName: 'מאסטר מיזוג',
    ownerName: 'ניר שרעבי',
    categorySlugs: ['hvac', 'electricity'],
    serviceSlugs: ['ac-repair', 'ac-service', 'ac-install', 'ac-gas'],
    home: { lat: 32.0668, lng: 34.8215 },
    areaRadiusKm: 18,
    isAvailable: true,
    locationAgeSeconds: 300,
    ratingAvg: 4.6,
    ratingCount: 38,
    completedJobs: 54,
    cancelledJobs: 3,
    avgResponseSeconds: 420,
    basePrice: 320,
    yearsExperience: 9,
    isVerified: true,
    quoteRate: 0.85,
  },
  {
    id: 'p-barak',
    businessName: 'ברק חשמל',
    ownerName: 'יוסי אזולאי',
    categorySlugs: ['electricity', 'maintenance'],
    serviceSlugs: ['short-circuit', 'new-point', 'lighting', 'panel-upgrade'],
    home: { lat: 32.0845, lng: 34.8761 },
    areaRadiusKm: 20,
    isAvailable: true,
    locationAgeSeconds: 120,
    ratingAvg: 4.7,
    ratingCount: 56,
    completedJobs: 88,
    cancelledJobs: 2,
    avgResponseSeconds: 300,
    basePrice: 380,
    yearsExperience: 15,
    isVerified: true,
    quoteRate: 0.9,
  },
  {
    id: 'p-sparks',
    businessName: 'ספארקס חשמל',
    ownerName: 'עופר טל',
    categorySlugs: ['electricity'],
    serviceSlugs: ['short-circuit', 'appliance-hook'],
    home: { lat: 32.1521, lng: 34.8402 },
    areaRadiusKm: 10,
    isAvailable: false,
    locationAgeSeconds: null,
    ratingAvg: 4.1,
    ratingCount: 9,
    completedJobs: 11,
    cancelledJobs: 2,
    avgResponseSeconds: 1500,
    basePrice: 250,
    yearsExperience: 3,
    isVerified: true,
    quoteRate: 0.6,
  },
  {
    id: 'p-top',
    businessName: 'טופ הדברות',
    ownerName: 'רמי נחום',
    categorySlugs: ['pest-control'],
    serviceSlugs: ['cockroaches', 'ants', 'mice', 'rats', 'bedbugs'],
    home: { lat: 32.0152, lng: 34.7754 },
    areaRadiusKm: 22,
    isAvailable: true,
    locationAgeSeconds: 600,
    ratingAvg: 4.5,
    ratingCount: 29,
    completedJobs: 47,
    cancelledJobs: 1,
    avgResponseSeconds: 480,
    basePrice: 450,
    yearsExperience: 11,
    isVerified: true,
    quoteRate: 0.88,
  },
  {
    id: 'p-clean',
    businessName: 'הבית של מירי ניקיון',
    ownerName: 'מירי כהן',
    categorySlugs: ['cleaning'],
    serviceSlugs: ['apartment', 'post-renovation', 'sofa-carpet'],
    home: { lat: 32.0712, lng: 34.7901 },
    areaRadiusKm: 14,
    isAvailable: true,
    locationAgeSeconds: 200,
    ratingAvg: 4.9,
    ratingCount: 73,
    completedJobs: 119,
    cancelledJobs: 0,
    avgResponseSeconds: 210,
    basePrice: 280,
    yearsExperience: 8,
    isVerified: true,
    quoteRate: 0.92,
  },
  {
    id: 'p-lock',
    businessName: 'מנעולן אקספרס',
    ownerName: 'ג׳קי אוחיון',
    categorySlugs: ['locksmith'],
    serviceSlugs: ['lockout', 'cylinder', 'lock-install'],
    home: { lat: 32.0891, lng: 34.7995 },
    areaRadiusKm: 30,
    isAvailable: true,
    locationAgeSeconds: 60,
    ratingAvg: 4.4,
    ratingCount: 61,
    completedJobs: 140,
    cancelledJobs: 8,
    avgResponseSeconds: 150,
    basePrice: 400,
    yearsExperience: 14,
    isVerified: true,
    quoteRate: 0.95,
  },
  {
    id: 'p-move',
    businessName: 'ידיים הובלות',
    ownerName: 'משה ביטון',
    categorySlugs: ['moving'],
    serviceSlugs: ['apartment-move', 'single-item', 'crane'],
    home: { lat: 32.0334, lng: 34.8011 },
    areaRadiusKm: 40,
    isAvailable: false,
    locationAgeSeconds: null,
    ratingAvg: 4.2,
    ratingCount: 24,
    completedJobs: 39,
    cancelledJobs: 5,
    avgResponseSeconds: 900,
    basePrice: 900,
    yearsExperience: 7,
    isVerified: true,
    quoteRate: 0.7,
  },
  {
    id: 'p-garden',
    businessName: 'קו ישר גינון',
    ownerName: 'אלון בר',
    categorySlugs: ['gardening'],
    serviceSlugs: ['mowing', 'pruning', 'irrigation'],
    home: { lat: 32.1288, lng: 34.8043 },
    areaRadiusKm: 16,
    isAvailable: true,
    locationAgeSeconds: 2400,
    ratingAvg: 4.0,
    ratingCount: 7,
    completedJobs: 9,
    cancelledJobs: 1,
    avgResponseSeconds: 1100,
    basePrice: 260,
    yearsExperience: 4,
    isVerified: true,
    quoteRate: 0.75,
  },
  {
    id: 'p-renov',
    businessName: 'אבן ובנין שיפוצים',
    ownerName: 'סמי חורי',
    categorySlugs: ['renovations', 'painting', 'carpentry'],
    serviceSlugs: ['full-renovation', 'bathroom', 'tiling', 'apartment-paint'],
    home: { lat: 32.0577, lng: 34.8534 },
    areaRadiusKm: 20,
    isAvailable: true,
    locationAgeSeconds: 800,
    ratingAvg: 4.6,
    ratingCount: 31,
    completedJobs: 44,
    cancelledJobs: 2,
    avgResponseSeconds: 650,
    basePrice: 1200,
    yearsExperience: 18,
    isVerified: true,
    quoteRate: 0.65,
  },
  {
    id: 'p-newbie',
    businessName: 'דור אינסטלציה',
    ownerName: 'דור מלכה',
    categorySlugs: ['plumbing'],
    serviceSlugs: ['blockage', 'faucet-replace'],
    home: { lat: 32.0955, lng: 34.7712 },
    areaRadiusKm: 8,
    isAvailable: true,
    locationAgeSeconds: 30,
    // No reviews yet — the engine gives new providers a neutral baseline
    // rather than ranking them below a badly-rated one.
    ratingAvg: 0,
    ratingCount: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    avgResponseSeconds: null,
    basePrice: 220,
    yearsExperience: 2,
    isVerified: true,
    quoteRate: 1,
  },
  {
    id: 'p-flaky',
    businessName: 'מהיר ובזול שירותים',
    ownerName: 'איציק ברנס',
    categorySlugs: ['plumbing', 'electricity', 'hvac'],
    serviceSlugs: ['blockage', 'short-circuit', 'ac-repair'],
    home: { lat: 32.0699, lng: 34.7822 },
    areaRadiusKm: 25,
    isAvailable: true,
    locationAgeSeconds: 150,
    // Cheap and close, but cancels a lot — the reliability modifier should
    // visibly cost him position.
    ratingAvg: 3.1,
    ratingCount: 22,
    completedJobs: 30,
    cancelledJobs: 14,
    avgResponseSeconds: 1700,
    basePrice: 180,
    yearsExperience: 6,
    isVerified: true,
    quoteRate: 1,
  },
  {
    id: 'p-pending',
    businessName: 'חדש בשוק אינסטלציה',
    ownerName: 'תומר יוסף',
    categorySlugs: ['plumbing'],
    serviceSlugs: ['leak'],
    home: { lat: 32.0862, lng: 34.7805 },
    areaRadiusKm: 10,
    isAvailable: true,
    locationAgeSeconds: 20,
    ratingAvg: 0,
    ratingCount: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    avgResponseSeconds: null,
    basePrice: 150,
    yearsExperience: 1,
    // Not verified: discovery must never surface this provider, however close.
    isVerified: false,
    quoteRate: 1,
  },
];

/**
 * Turns a world provider into the `MatchCandidate` the real engine consumes.
 * Distance is measured the same way the SQL function does: from the live
 * position when one is fresh, otherwise from the service-area centre.
 */
export function toCandidate(provider: SimProvider, jobLocation: LatLng, serviceSlug: string | null): MatchCandidate {
  const distanceKm = haversineKm(jobLocation, provider.home);

  return {
    providerId: provider.id,
    userId: `u-${provider.id}`,
    businessName: provider.businessName,
    ownerName: provider.ownerName,
    avatarUrl: null,
    distanceKm,
    isAvailable: provider.isAvailable,
    locationAgeSeconds: provider.locationAgeSeconds,
    ratingAvg: provider.ratingAvg,
    ratingCount: provider.ratingCount,
    completedJobs: provider.completedJobs,
    cancelledJobs: provider.cancelledJobs,
    avgResponseSeconds: provider.avgResponseSeconds,
    servesArea: distanceKm <= provider.areaRadiusKm,
    matchesService: serviceSlug ? provider.serviceSlugs.includes(serviceSlug) : true,
    basePrice: provider.basePrice,
    yearsExperience: provider.yearsExperience,
    isVerified: provider.isVerified,
  };
}

export function providerById(id: string): SimProvider | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}
