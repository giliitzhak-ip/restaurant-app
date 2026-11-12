import "server-only";
import { db, must } from "./db";
import { env } from "./env";
import type { InstagramConnection, Settings } from "./types";

export async function getSettings(): Promise<Settings> {
  return must(await db().from("app_settings").select("*").eq("id", 1).single(), "load settings") as Settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  must(
    await db().from("app_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1),
    "update settings",
  );
}

export async function getConnection(): Promise<InstagramConnection> {
  return must(
    await db().from("instagram_connection").select("*").eq("id", 1).single(),
    "load instagram connection",
  ) as InstagramConnection;
}

export interface PublishMode {
  live: boolean;
  reasons: string[]; // why we're in test mode (empty when live)
}

/**
 * Real publishing requires ALL of:
 *  1. env PUBLISH_LIVE_ENABLED === "true"   (set by you in Vercel)
 *  2. settings.live_publishing === true      (switch in the dashboard)
 *  3. a verified Instagram connection with the publish permission
 */
export function publishMode(settings: Settings, conn: InstagramConnection): PublishMode {
  const reasons: string[] = [];
  if (!env.liveEnabledByEnv()) reasons.push("PUBLISH_LIVE_ENABLED אינו true בשרת");
  if (!settings.live_publishing) reasons.push("מתג 'פרסום אמיתי' כבוי בהגדרות");
  if (!conn.access_token_enc || !conn.ig_user_id) reasons.push("אינסטגרם לא מחובר");
  else if (!conn.permissions_ok) reasons.push("הרשאות Meta לא אומתו");
  return { live: reasons.length === 0, reasons };
}
