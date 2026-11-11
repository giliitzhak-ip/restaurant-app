import "server-only";
import { decryptSecret, encryptSecret } from "../crypto";
import { db, must } from "../db";
import { env } from "../env";
import { errMsg, log } from "../logger";
import { getConnection } from "../settings";
import type { InstagramConnection } from "../types";
import { GraphClient, INSIGHTS_PERMISSION, REQUIRED_PERMISSIONS, type ApiHost } from "./graph";

export function clientFor(conn: InstagramConnection): GraphClient {
  if (!conn.access_token_enc) throw new Error("אינסטגרם לא מחובר");
  return new GraphClient(conn.api_host, decryptSecret(conn.access_token_enc, env.tokenEncryptionKey()));
}

export interface VerifyResult {
  ok: boolean;
  username: string | null;
  igUserId: string | null;
  permissions: string[];
  missing: string[];
  insights: boolean;
  quota: { usage: number; total: number | null } | null;
  error?: string;
}

/**
 * Read-only verification: identity, permissions and the publishing quota.
 * Never creates or publishes anything.
 */
export async function verifyToken(host: ApiHost, token: string, igUserIdHint?: string | null): Promise<VerifyResult> {
  const g = new GraphClient(host, token);
  const res: VerifyResult = {
    ok: false,
    username: null,
    igUserId: null,
    permissions: [],
    missing: [],
    insights: false,
    quota: null,
  };
  try {
    if (host === "instagram") {
      const me = await g.me();
      res.igUserId = igUserIdHint || me.user_id || me.id;
      res.username = me.username ?? null;
      if (me.account_type && !["BUSINESS", "MEDIA_CREATOR"].includes(me.account_type)) {
        throw new Error(`סוג החשבון ${me.account_type} – נדרש חשבון Business או Creator`);
      }
      // The Instagram Login API has no /me/permissions endpoint. A successful read of the
      // publishing quota proves the content-publish permission is present.
      const q = await g.publishingLimit(res.igUserId!);
      res.quota = { usage: q.quota_usage, total: q.quota_total };
      res.permissions = [...REQUIRED_PERMISSIONS.instagram];
    } else {
      const perms = await g.fbPermissions();
      res.permissions = perms.filter((p) => p.status === "granted").map((p) => p.permission);
      const found = igUserIdHint ? { igUserId: igUserIdHint, username: "" } : await g.fbFindInstagramAccount();
      if (!found) throw new Error("לא נמצא חשבון Instagram Business המקושר לעמוד פייסבוק");
      res.igUserId = found.igUserId;
      res.username = found.username || null;
      const q = await g.publishingLimit(res.igUserId);
      res.quota = { usage: q.quota_usage, total: q.quota_total };
    }
    res.missing = REQUIRED_PERMISSIONS[host].filter((p) => !res.permissions.includes(p));
    res.insights = host === "facebook" ? res.permissions.includes(INSIGHTS_PERMISSION.facebook) : true;
    res.ok = res.missing.length === 0;
  } catch (e) {
    res.error = errMsg(e);
  }
  return res;
}

export async function saveConnection(host: ApiHost, token: string, igUserIdHint: string | null): Promise<VerifyResult> {
  const v = await verifyToken(host, token, igUserIdHint);
  must(
    await db()
      .from("instagram_connection")
      .update({
        api_host: host,
        access_token_enc: encryptSecret(token, env.tokenEncryptionKey()),
        ig_user_id: v.igUserId,
        username: v.username,
        permissions: v.permissions,
        permissions_ok: v.ok,
        quota_usage: v.quota?.usage ?? null,
        quota_total: v.quota?.total ?? null,
        last_verified_at: new Date().toISOString(),
        last_error: v.error ?? (v.missing.length ? `חסרות הרשאות: ${v.missing.join(", ")}` : null),
        // Instagram-Login long-lived tokens last 60 days; refresh well before.
        token_expires_at: host === "instagram" ? new Date(Date.now() + 55 * 864e5).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1),
    "save connection",
  );
  await log(v.ok ? "info" : "warn", "instagram.connect", v.ok ? `חובר @${v.username}` : `חיבור נכשל: ${v.error ?? v.missing.join(", ")}`);
  return v;
}

export async function reverifyConnection(): Promise<VerifyResult | null> {
  const conn = await getConnection();
  if (!conn.access_token_enc) return null;
  const token = decryptSecret(conn.access_token_enc, env.tokenEncryptionKey());
  const v = await verifyToken(conn.api_host, token, conn.ig_user_id);
  await db()
    .from("instagram_connection")
    .update({
      permissions: v.permissions,
      permissions_ok: v.ok,
      quota_usage: v.quota?.usage ?? null,
      quota_total: v.quota?.total ?? null,
      last_verified_at: new Date().toISOString(),
      last_error: v.error ?? (v.missing.length ? `חסרות הרשאות: ${v.missing.join(", ")}` : null),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  return v;
}

export async function disconnect(): Promise<void> {
  await db()
    .from("instagram_connection")
    .update({
      access_token_enc: null,
      ig_user_id: null,
      username: null,
      permissions: [],
      permissions_ok: false,
      token_expires_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  await log("info", "instagram.disconnect", "החיבור לאינסטגרם נותק");
}

/** Refresh Instagram-Login tokens that expire within 10 days. */
export async function maybeRefreshToken(): Promise<string | null> {
  const conn = await getConnection();
  if (!conn.access_token_enc || conn.api_host !== "instagram" || !conn.token_expires_at) return null;
  if (new Date(conn.token_expires_at).getTime() - Date.now() > 10 * 864e5) return null;
  try {
    const r = await clientFor(conn).refreshInstagramToken();
    await db()
      .from("instagram_connection")
      .update({
        access_token_enc: encryptSecret(r.access_token, env.tokenEncryptionKey()),
        token_expires_at: new Date(Date.now() + Math.max(r.expires_in - 5 * 86400, 86400) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    await log("info", "instagram.token_refresh", "הטוקן חודש");
    return "refreshed";
  } catch (e) {
    await log("error", "instagram.token_refresh", `חידוש טוקן נכשל: ${errMsg(e)}`);
    return "failed";
  }
}
