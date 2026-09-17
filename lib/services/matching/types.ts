import type { JobUrgency } from '@/types/database';

/** A provider considered for a job, as returned by `find_nearby_providers`. */
export interface MatchCandidate {
  providerId: string;
  userId: string;
  businessName: string;
  ownerName: string;
  avatarUrl: string | null;
  distanceKm: number;
  isAvailable: boolean;
  /** Seconds since the provider's position was last reported; null if never. */
  locationAgeSeconds: number | null;
  ratingAvg: number;
  ratingCount: number;
  completedJobs: number;
  cancelledJobs: number;
  avgResponseSeconds: number | null;
  /** The provider declared a service area covering the job location. */
  servesArea: boolean;
  /** The provider offers the exact service requested, not just the category. */
  matchesService: boolean;
  basePrice: number | null;
  yearsExperience: number;
  isVerified: boolean;
}

export interface MatchJobContext {
  categoryId: string;
  serviceId?: string | null;
  urgency: JobUrgency;
  budgetMin?: number | null;
  budgetMax?: number | null;
  /** Provider ids the customer has favourited. */
  favoriteProviderIds?: string[];
  /** The radius currently being searched, used to normalise the distance score. */
  searchRadiusKm: number;
}

export interface ScoreBreakdown {
  distance: number;
  rating: number;
  availability: number;
  categoryMatch: number;
  responseSpeed: number;
  completedJobs: number;
  /** Additive adjustments applied after the weighted sum. */
  modifiers: {
    favorite: number;
    serviceArea: number;
    priceFit: number;
    reliability: number;
  };
}

export interface ScoredCandidate {
  candidate: MatchCandidate;
  /** 0–100. Internal only — never rendered to a customer. */
  score: number;
  breakdown: ScoreBreakdown;
}
