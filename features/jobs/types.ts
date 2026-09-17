import type {
  JobStatus,
  JobUrgency,
  OfferStatus,
  PaymentStatus,
} from '@/types/database';

export interface JobDetailPayload {
  job: {
    id: string;
    reference: string;
    title: string;
    description: string;
    status: JobStatus;
    urgency: JobUrgency;
    scheduled_for: string | null;
    address: string;
    address_notes: string | null;
    lat: number;
    lng: number;
    budget_min: number | null;
    budget_max: number | null;
    final_price: number | null;
    platform_fee: number | null;
    provider_payout: number | null;
    created_at: string;
    completed_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    customer_id: string;
    assigned_provider_id: string | null;
    category: { id: string; name: string; slug: string; icon: string } | null;
    service: { id: string; name: string } | null;
    customer: {
      id: string;
      phone: string | null;
      profiles: { full_name: string; avatar_url: string | null } | null;
    } | null;
    assigned_provider: {
      id: string;
      business_name: string;
      owner_name: string;
      avatar_url: string | null;
      phone: string;
      rating_avg: number;
      rating_count: number;
      completed_jobs: number;
    } | null;
    job_images: Array<{ id: string; storage_path: string; kind: 'image' | 'video'; sort_order: number }>;
    job_status_history: Array<{
      id: string;
      from_status: JobStatus | null;
      to_status: JobStatus;
      actor_type: string;
      note: string | null;
      created_at: string;
    }>;
  };
  offers: Array<{
    id: string;
    price: number;
    eta_minutes: number;
    note: string | null;
    status: OfferStatus;
    valid_until: string;
    distance_km: number | null;
    created_at: string;
    provider: {
      id: string;
      business_name: string;
      avatar_url: string | null;
      rating_avg: number;
      rating_count: number;
      completed_jobs: number;
      status: string;
    } | null;
  }>;
  payment: {
    id: string;
    amount: number;
    platform_fee: number;
    provider_payout: number;
    status: PaymentStatus;
    currency: string;
    captured_at: string | null;
  } | null;
  review: {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    is_hidden: boolean;
  } | null;
}
