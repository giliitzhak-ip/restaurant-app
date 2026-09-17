/**
 * Database types for GET SERVICE.
 *
 * Hand-maintained to mirror `supabase/migrations`. Regenerate with:
 *   npx supabase gen types typescript --project-id <ref> > types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type UserRole = 'customer' | 'provider' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'blocked';
export type ProviderStatus = 'pending' | 'verified' | 'rejected' | 'suspended';
export type JobStatus =
  | 'requested'
  | 'searching'
  | 'offers_received'
  | 'provider_selected'
  | 'provider_on_the_way'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';
export type JobUrgency = 'now' | 'today' | 'tomorrow' | 'scheduled';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';
export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'refunded'
  | 'failed'
  | 'cancelled';
export type TransactionType = 'authorization' | 'capture' | 'refund' | 'payout' | 'platform_fee';
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected';
export type DisputeReason =
  | 'price'
  | 'not_performed'
  | 'damage'
  | 'no_show'
  | 'payment_issue'
  | 'other';
export type DocumentType =
  | 'identity'
  | 'professional_license'
  | 'certificate'
  | 'insurance'
  | 'business_registration'
  | 'other';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';
export type NotificationChannel = 'in_app' | 'push' | 'sms' | 'email' | 'whatsapp';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';
export type MessageType = 'text' | 'image' | 'system';
export type ActorType = 'customer' | 'provider' | 'admin' | 'system';
export type MediaKind = 'image' | 'video';
export type ReviewCriterion = 'professionalism' | 'price' | 'punctuality' | 'service';

type Timestamps = { created_at: string; updated_at: string };

/**
 * One foreign key, in the shape postgrest-js uses to type embedded selects
 * (`select('*, category:categories(*)')`).
 */
type Rel<
  FkName extends string,
  Column extends string,
  RefTable extends string,
  RefColumn extends string = 'id',
  OneToOne extends boolean = false,
> = {
  foreignKeyName: FkName;
  columns: [Column];
  isOneToOne: OneToOne;
  referencedRelation: RefTable;
  referencedColumns: [RefColumn];
};

/** Shapes a table entry from its Row type; Insert/Update are derived. */
type TableOf<
  Row,
  RequiredInsert extends keyof Row = never,
  Relationships extends readonly unknown[] = [],
> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, RequiredInsert>;
  Update: Partial<Row>;
  Relationships: Relationships;
};

export type UserRow = Timestamps & {
  id: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  status: AccountStatus;
  status_reason: string | null;
  last_seen_at: string | null;
};

export type ProfileRow = Timestamps & {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  locale: string;
  phone: string | null;
};

export type CustomerProfileRow = Timestamps & {
  id: string;
  user_id: string;
  default_address: string | null;
  default_lat: number | null;
  default_lng: number | null;
  notes: string | null;
  jobs_created: number;
};

export type CategoryRow = Timestamps & {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  icon: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};

export type ServiceRow = Timestamps & {
  id: string;
  category_id: string;
  slug: string;
  name: string;
  name_en: string | null;
  description: string | null;
  base_price: number | null;
  sort_order: number;
  active: boolean;
};

export type ProviderProfileRow = Timestamps & {
  id: string;
  user_id: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  bio: string | null;
  years_experience: number;
  base_price: number | null;
  status: ProviderStatus;
  status_reason: string | null;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  cancelled_jobs: number;
  avg_response_seconds: number | null;
  onboarding_step: number;
  onboarding_completed: boolean;
  terms_accepted_at: string | null;
  verified_at: string | null;
};

export type ProviderCategoryRow = {
  id: string;
  provider_id: string;
  category_id: string;
  created_at: string;
};

export type ProviderServiceRow = {
  id: string;
  provider_id: string;
  service_id: string;
  price_from: number | null;
  created_at: string;
};

export type ServiceAreaRow = Timestamps & {
  id: string;
  provider_id: string;
  label: string;
  center_lat: number;
  center_lng: number;
  radius_km: number;
};

export type ProviderAvailabilityRow = {
  provider_id: string;
  is_available: boolean;
  available_until: string | null;
  weekly_schedule: Json;
  updated_at: string;
};

export type ProviderLocationRow = {
  provider_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  heading: number | null;
  updated_at: string;
};

export type ProviderDocumentRow = Timestamps & {
  id: string;
  provider_id: string;
  doc_type: DocumentType;
  storage_path: string;
  file_name: string | null;
  status: DocumentStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  expires_at: string | null;
};

export type ProviderGalleryRow = {
  id: string;
  provider_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export type JobRow = Timestamps & {
  id: string;
  reference: string;
  customer_id: string;
  category_id: string;
  service_id: string | null;
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
  search_radius_km: number;
  broadcast_at: string | null;
  assigned_provider_id: string | null;
  accepted_offer_id: string | null;
  final_price: number | null;
  platform_fee: number | null;
  provider_payout: number | null;
  cancelled_by: ActorType | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
};

export type JobImageRow = {
  id: string;
  job_id: string;
  storage_path: string;
  kind: MediaKind;
  sort_order: number;
  created_at: string;
};

export type JobOfferRow = Timestamps & {
  id: string;
  job_id: string;
  provider_id: string;
  price: number;
  eta_minutes: number;
  note: string | null;
  status: OfferStatus;
  valid_until: string;
  distance_km: number | null;
  match_score: number | null;
  responded_in_seconds: number | null;
};

export type JobAssignmentRow = {
  id: string;
  job_id: string;
  provider_id: string;
  match_score: number;
  distance_km: number | null;
  score_breakdown: Json;
  notified_at: string | null;
  viewed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  created_at: string;
};

export type JobStatusHistoryRow = {
  id: string;
  job_id: string;
  from_status: JobStatus | null;
  to_status: JobStatus;
  actor_id: string | null;
  actor_type: ActorType;
  note: string | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  job_id: string;
  sender_id: string;
  body: string | null;
  message_type: MessageType;
  storage_path: string | null;
  read_at: string | null;
  created_at: string;
};

export type FavoriteRow = {
  id: string;
  customer_id: string;
  provider_id: string;
  created_at: string;
};

export type PaymentRow = Timestamps & {
  id: string;
  job_id: string;
  customer_id: string;
  provider_id: string;
  amount: number;
  platform_fee: number;
  provider_payout: number;
  currency: string;
  status: PaymentStatus;
  provider_name: string;
  external_id: string | null;
  fee_rule_snapshot: Json;
  authorized_at: string | null;
  captured_at: string | null;
  refunded_at: string | null;
  failure_reason: string | null;
};

export type PaymentTransactionRow = {
  id: string;
  payment_id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  external_id: string | null;
  raw_response: Json;
  created_at: string;
};

export type PlatformFeeRow = {
  id: string;
  payment_id: string;
  job_id: string;
  amount: number;
  rate: number;
  rule_label: string | null;
  created_at: string;
};

export type ReviewRow = Timestamps & {
  id: string;
  job_id: string;
  customer_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  hidden_by: string | null;
  flagged: boolean;
};

export type ReviewCategoryRow = {
  id: string;
  review_id: string;
  criterion: ReviewCriterion;
  score: number;
  created_at: string;
};

export type DisputeRow = Timestamps & {
  id: string;
  job_id: string;
  opened_by: string;
  opened_by_type: ActorType;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  event: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  job_id: string | null;
  payload: Json;
  error: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
};

export type SettingRow = Timestamps & {
  key: string;
  value: Json;
  description: string | null;
  updated_by: string | null;
};

export type AdminActionRow = {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Json;
  created_at: string;
};

/** Row shape returned by the `find_nearby_providers` SQL function. */
export type NearbyProviderRow = {
  provider_id: string;
  user_id: string;
  business_name: string;
  owner_name: string;
  avatar_url: string | null;
  bio: string | null;
  years_experience: number;
  base_price: number | null;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  cancelled_jobs: number;
  avg_response_seconds: number | null;
  is_available: boolean;
  location_age_seconds: number | null;
  distance_km: number;
  serves_area: boolean;
  matches_service: boolean;
};

export interface Database {
  public: {
    Tables: {
      users: TableOf<UserRow, 'id'>;
      profiles: TableOf<
        ProfileRow,
        'user_id',
        [Rel<'profiles_user_id_fkey', 'user_id', 'users', 'id', true>]
      >;
      customer_profiles: TableOf<
        CustomerProfileRow,
        'user_id',
        [Rel<'customer_profiles_user_id_fkey', 'user_id', 'users', 'id', true>]
      >;
      categories: TableOf<CategoryRow, 'slug' | 'name'>;
      services: TableOf<
        ServiceRow,
        'category_id' | 'slug' | 'name',
        [Rel<'services_category_id_fkey', 'category_id', 'categories'>]
      >;
      provider_profiles: TableOf<
        ProviderProfileRow,
        'user_id' | 'business_name' | 'owner_name' | 'phone',
        [Rel<'provider_profiles_user_id_fkey', 'user_id', 'users', 'id', true>]
      >;
      provider_categories: TableOf<
        ProviderCategoryRow,
        'provider_id' | 'category_id',
        [
          Rel<'provider_categories_provider_id_fkey', 'provider_id', 'provider_profiles'>,
          Rel<'provider_categories_category_id_fkey', 'category_id', 'categories'>,
        ]
      >;
      provider_services: TableOf<
        ProviderServiceRow,
        'provider_id' | 'service_id',
        [
          Rel<'provider_services_provider_id_fkey', 'provider_id', 'provider_profiles'>,
          Rel<'provider_services_service_id_fkey', 'service_id', 'services'>,
        ]
      >;
      service_areas: TableOf<
        ServiceAreaRow,
        'provider_id' | 'label' | 'center_lat' | 'center_lng',
        [Rel<'service_areas_provider_id_fkey', 'provider_id', 'provider_profiles'>]
      >;
      provider_availability: TableOf<
        ProviderAvailabilityRow,
        'provider_id',
        [Rel<'provider_availability_provider_id_fkey', 'provider_id', 'provider_profiles', 'id', true>]
      >;
      provider_locations: TableOf<
        ProviderLocationRow,
        'provider_id' | 'lat' | 'lng',
        [Rel<'provider_locations_provider_id_fkey', 'provider_id', 'provider_profiles', 'id', true>]
      >;
      provider_documents: TableOf<
        ProviderDocumentRow,
        'provider_id' | 'doc_type' | 'storage_path',
        [Rel<'provider_documents_provider_id_fkey', 'provider_id', 'provider_profiles'>]
      >;
      provider_gallery: TableOf<
        ProviderGalleryRow,
        'provider_id' | 'storage_path',
        [Rel<'provider_gallery_provider_id_fkey', 'provider_id', 'provider_profiles'>]
      >;
      jobs: TableOf<
        JobRow,
        'customer_id' | 'category_id' | 'title' | 'description' | 'address' | 'lat' | 'lng',
        [
          Rel<'jobs_customer_id_fkey', 'customer_id', 'users'>,
          Rel<'jobs_category_id_fkey', 'category_id', 'categories'>,
          Rel<'jobs_service_id_fkey', 'service_id', 'services'>,
          Rel<'jobs_assigned_provider_id_fkey', 'assigned_provider_id', 'provider_profiles'>,
          Rel<'jobs_accepted_offer_fk', 'accepted_offer_id', 'job_offers'>,
        ]
      >;
      job_images: TableOf<
        JobImageRow,
        'job_id' | 'storage_path',
        [Rel<'job_images_job_id_fkey', 'job_id', 'jobs'>]
      >;
      job_offers: TableOf<
        JobOfferRow,
        'job_id' | 'provider_id' | 'price' | 'eta_minutes',
        [
          Rel<'job_offers_job_id_fkey', 'job_id', 'jobs'>,
          Rel<'job_offers_provider_id_fkey', 'provider_id', 'provider_profiles'>,
        ]
      >;
      job_assignments: TableOf<
        JobAssignmentRow,
        'job_id' | 'provider_id',
        [
          Rel<'job_assignments_job_id_fkey', 'job_id', 'jobs'>,
          Rel<'job_assignments_provider_id_fkey', 'provider_id', 'provider_profiles'>,
        ]
      >;
      job_status_history: TableOf<
        JobStatusHistoryRow,
        'job_id' | 'to_status',
        [Rel<'job_status_history_job_id_fkey', 'job_id', 'jobs'>]
      >;
      messages: TableOf<
        MessageRow,
        'job_id' | 'sender_id',
        [
          Rel<'messages_job_id_fkey', 'job_id', 'jobs'>,
          Rel<'messages_sender_id_fkey', 'sender_id', 'users'>,
        ]
      >;
      favorites: TableOf<
        FavoriteRow,
        'customer_id' | 'provider_id',
        [
          Rel<'favorites_customer_id_fkey', 'customer_id', 'users'>,
          Rel<'favorites_provider_id_fkey', 'provider_id', 'provider_profiles'>,
        ]
      >;
      payments: TableOf<
        PaymentRow,
        'job_id' | 'customer_id' | 'provider_id' | 'amount',
        [
          Rel<'payments_job_id_fkey', 'job_id', 'jobs', 'id', true>,
          Rel<'payments_customer_id_fkey', 'customer_id', 'users'>,
          Rel<'payments_provider_id_fkey', 'provider_id', 'provider_profiles'>,
        ]
      >;
      payment_transactions: TableOf<
        PaymentTransactionRow,
        'payment_id' | 'type' | 'amount',
        [Rel<'payment_transactions_payment_id_fkey', 'payment_id', 'payments'>]
      >;
      platform_fees: TableOf<
        PlatformFeeRow,
        'payment_id' | 'job_id' | 'amount' | 'rate',
        [
          Rel<'platform_fees_payment_id_fkey', 'payment_id', 'payments'>,
          Rel<'platform_fees_job_id_fkey', 'job_id', 'jobs'>,
        ]
      >;
      reviews: TableOf<
        ReviewRow,
        'job_id' | 'customer_id' | 'provider_id' | 'rating',
        [
          Rel<'reviews_job_id_fkey', 'job_id', 'jobs', 'id', true>,
          Rel<'reviews_customer_id_fkey', 'customer_id', 'users'>,
          Rel<'reviews_provider_id_fkey', 'provider_id', 'provider_profiles'>,
        ]
      >;
      review_categories: TableOf<
        ReviewCategoryRow,
        'review_id' | 'criterion' | 'score',
        [Rel<'review_categories_review_id_fkey', 'review_id', 'reviews'>]
      >;
      disputes: TableOf<
        DisputeRow,
        'job_id' | 'opened_by' | 'opened_by_type' | 'reason' | 'description',
        [
          Rel<'disputes_job_id_fkey', 'job_id', 'jobs'>,
          Rel<'disputes_opened_by_fkey', 'opened_by', 'users'>,
        ]
      >;
      notifications: TableOf<
        NotificationRow,
        'user_id' | 'event' | 'title' | 'body',
        [
          Rel<'notifications_user_id_fkey', 'user_id', 'users'>,
          Rel<'notifications_job_id_fkey', 'job_id', 'jobs'>,
        ]
      >;
      settings: TableOf<SettingRow, 'key' | 'value'>;
      admin_actions: TableOf<
        AdminActionRow,
        'admin_id' | 'action' | 'entity_type',
        [Rel<'admin_actions_admin_id_fkey', 'admin_id', 'users'>]
      >;
    };
    Views: Record<string, never>;
    Functions: {
      find_nearby_providers: {
        Args: {
          category_id: string;
          latitude: number;
          longitude: number;
          radius_km?: number;
          service_id?: string | null;
          max_results?: number;
        };
        Returns: NearbyProviderRow[];
      };
    };
    Enums: {
      user_role: UserRole;
      account_status: AccountStatus;
      provider_status: ProviderStatus;
      job_status: JobStatus;
      job_urgency: JobUrgency;
      offer_status: OfferStatus;
      payment_status: PaymentStatus;
      transaction_type: TransactionType;
      dispute_status: DisputeStatus;
      dispute_reason: DisputeReason;
      document_type: DocumentType;
      document_status: DocumentStatus;
      notification_channel: NotificationChannel;
      notification_status: NotificationStatus;
      message_type: MessageType;
      actor_type: ActorType;
      media_kind: MediaKind;
    };
    CompositeTypes: Record<string, never>;
  };
}
