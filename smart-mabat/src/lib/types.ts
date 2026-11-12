export type ApprovalMode = "draft" | "manual" | "auto";
export type ImageMode = "ai" | "library" | "none";

export type PostStatus =
  | "draft"
  | "pending_approval"
  | "scheduled"
  | "publishing"
  | "published"
  | "simulated"
  | "failed"
  | "rejected";

export interface Settings {
  id: 1;
  agent_enabled: boolean;
  approval_mode: ApprovalMode;
  live_publishing: boolean;
  posts_per_week: number;
  publish_days: number[];
  publish_times: string[];
  plan_ahead_days: number;
  image_mode: ImageMode;
  image_headline: boolean;
  brand_hashtags: string[];
  cta_text: string;
  phone: string | null;
  website: string | null;
  service_area: string | null;
  logo_media_id: string | null;
  extra_instructions: string | null;
  updated_at: string;
}

export interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  severity: "error" | "warn";
  detail?: string;
}

export interface Post {
  id: string;
  status: PostStatus;
  media_type: "IMAGE" | "REELS";
  category: string | null;
  topic: string | null;
  hook: string | null;
  caption: string;
  hashtags: string[];
  cta: string | null;
  headline: string | null;
  image_prompt: string | null;
  alt_text: string | null;
  media_id: string | null;
  video_url: string | null;
  scheduled_at: string | null;
  checks: CheckResult[];
  checks_passed: boolean;
  fingerprint: string | null;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  locked_at: string | null;
  ig_container_id: string | null;
  ig_media_id: string | null;
  ig_permalink: string | null;
  published_at: string | null;
  ai_model: string | null;
  created_by: "agent" | "admin";
  created_at: string;
  updated_at: string;
}

export interface MediaAsset {
  id: string;
  kind: "upload" | "ai" | "branded" | "logo";
  storage_path: string;
  public_url: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  title: string | null;
  tags: string[];
  source_prompt: string | null;
  parent_id: string | null;
  use_count: number;
  created_at: string;
}

export interface InstagramConnection {
  id: 1;
  api_host: "instagram" | "facebook";
  ig_user_id: string | null;
  username: string | null;
  account_type: string | null;
  access_token_enc: string | null;
  token_expires_at: string | null;
  permissions: string[];
  permissions_ok: boolean;
  quota_usage: number | null;
  quota_total: number | null;
  last_verified_at: string | null;
  last_error: string | null;
  updated_at: string;
}

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: "טיוטה",
  pending_approval: "ממתין לאישור",
  scheduled: "מתוזמן",
  publishing: "בפרסום",
  published: "פורסם",
  simulated: "פורסם בסימולציה",
  failed: "נכשל",
  rejected: "נדחה",
};
