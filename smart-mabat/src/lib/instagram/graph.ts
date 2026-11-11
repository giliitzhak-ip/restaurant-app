import "server-only";
import { env } from "../env";

/**
 * Minimal client for the official Instagram Graph API.
 *
 * Two supported connection types:
 *  - "instagram": Instagram API with Instagram Login  → https://graph.instagram.com
 *      permissions: instagram_business_basic, instagram_business_content_publish
 *      (+ instagram_business_manage_insights for analytics)
 *  - "facebook":  Instagram API with Facebook Login   → https://graph.facebook.com
 *      permissions: instagram_basic, instagram_content_publish, pages_show_list,
 *      pages_read_engagement (+ instagram_manage_insights for analytics)
 */
export type ApiHost = "instagram" | "facebook";

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public subcode?: number,
    public transient?: boolean,
  ) {
    super(message);
  }
  /** Rate limits, server errors and transient errors are worth retrying; auth/validation errors are not. */
  get retryable(): boolean {
    if (this.transient) return true;
    if (this.status >= 500 || this.status === 429) return true;
    return [1, 2, 4, 17, 32, 341, 613, 9007].includes(this.code ?? -1);
  }
}

export const REQUIRED_PERMISSIONS: Record<ApiHost, string[]> = {
  instagram: ["instagram_business_basic", "instagram_business_content_publish"],
  facebook: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
};
export const INSIGHTS_PERMISSION: Record<ApiHost, string> = {
  instagram: "instagram_business_manage_insights",
  facebook: "instagram_manage_insights",
};

export class GraphClient {
  constructor(
    private host: ApiHost,
    private token: string,
  ) {}

  private base() {
    const domain = this.host === "instagram" ? "graph.instagram.com" : "graph.facebook.com";
    return `https://${domain}/${env.graphVersion()}`;
  }

  async call<T>(method: "GET" | "POST", path: string, params: Record<string, string | undefined> = {}): Promise<T> {
    const url = new URL(`${this.base()}/${path.replace(/^\//, "")}`);
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (method === "GET") url.searchParams.set(k, v);
      else body.set(k, v);
    }
    // Token goes in the Authorization header, never in the URL (keeps it out of logs).
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: method === "POST" ? body : undefined,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean };
    } & T;
    if (!res.ok || json.error) {
      const e = json.error ?? {};
      throw new GraphError(e.message ?? `HTTP ${res.status}`, res.status, e.code, e.error_subcode, e.is_transient);
    }
    return json;
  }

  // ── account & permissions ─────────────────────────────────────────────
  async me(): Promise<{ id: string; username?: string; name?: string; account_type?: string; user_id?: string }> {
    const fields = this.host === "instagram" ? "user_id,username,account_type" : "id,name";
    return this.call("GET", "me", { fields });
  }

  /** Facebook Login only: list granted permissions. */
  async fbPermissions(): Promise<{ permission: string; status: string }[]> {
    const r = await this.call<{ data: { permission: string; status: string }[] }>("GET", "me/permissions");
    return r.data;
  }

  /** Facebook Login only: find the IG business account linked to the user's Pages. */
  async fbFindInstagramAccount(): Promise<{ igUserId: string; username: string } | null> {
    const r = await this.call<{
      data: { id: string; name: string; instagram_business_account?: { id: string; username?: string } }[];
    }>("GET", "me/accounts", { fields: "id,name,instagram_business_account{id,username}" });
    const page = r.data.find((p) => p.instagram_business_account);
    return page?.instagram_business_account
      ? { igUserId: page.instagram_business_account.id, username: page.instagram_business_account.username ?? "" }
      : null;
  }

  async publishingLimit(igUserId: string): Promise<{ quota_usage: number; quota_total: number | null }> {
    const r = await this.call<{ data: { quota_usage: number; config?: { quota_total?: number } }[] }>(
      "GET",
      `${igUserId}/content_publishing_limit`,
      { fields: "quota_usage,config" },
    );
    const d = r.data?.[0];
    return { quota_usage: d?.quota_usage ?? 0, quota_total: d?.config?.quota_total ?? null };
  }

  // ── publishing ────────────────────────────────────────────────────────
  async createImageContainer(igUserId: string, imageUrl: string, caption: string, altText?: string | null) {
    return this.call<{ id: string }>("POST", `${igUserId}/media`, {
      image_url: imageUrl,
      caption,
      alt_text: altText ?? undefined,
    });
  }

  /** Reels infrastructure (video must be a public MP4 URL). */
  async createReelContainer(igUserId: string, videoUrl: string, caption: string) {
    return this.call<{ id: string }>("POST", `${igUserId}/media`, {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      share_to_feed: "true",
    });
  }

  async containerStatus(containerId: string): Promise<{ status_code: string; status?: string }> {
    return this.call("GET", containerId, { fields: "status_code,status" });
  }

  async publishContainer(igUserId: string, containerId: string) {
    return this.call<{ id: string }>("POST", `${igUserId}/media_publish`, { creation_id: containerId });
  }

  async mediaInfo(mediaId: string): Promise<{ id: string; permalink?: string; timestamp?: string }> {
    return this.call("GET", mediaId, { fields: "id,permalink,timestamp" });
  }

  async recentMedia(igUserId: string, limit = 10) {
    return this.call<{ data: { id: string; caption?: string; permalink?: string; timestamp?: string }[] }>(
      "GET",
      `${igUserId}/media`,
      { fields: "id,caption,permalink,timestamp", limit: String(limit) },
    );
  }

  // ── insights ──────────────────────────────────────────────────────────
  async mediaInsights(mediaId: string, metrics: string[]) {
    return this.call<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      "GET",
      `${mediaId}/insights`,
      { metric: metrics.join(",") },
    );
  }

  async mediaCounts(mediaId: string): Promise<{ like_count?: number; comments_count?: number }> {
    return this.call("GET", mediaId, { fields: "like_count,comments_count" });
  }

  // ── tokens ────────────────────────────────────────────────────────────
  /** Instagram Login long-lived tokens (60 days) can be refreshed once they are 24h old. */
  async refreshInstagramToken(): Promise<{ access_token: string; expires_in: number }> {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", this.token);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!res.ok || !json.access_token) throw new GraphError(json.error?.message ?? "refresh failed", res.status);
    return { access_token: json.access_token, expires_in: json.expires_in ?? 0 };
  }
}
