import "server-only";

/** Server-side configuration. Nothing here is ever sent to the browser. */
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}
function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export const env = {
  supabaseUrl: () => req("SUPABASE_URL"),
  supabaseServiceKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),
  sessionSecret: () => req("SESSION_SECRET"),
  tokenEncryptionKey: () => req("TOKEN_ENCRYPTION_KEY"),
  adminEmail: () => req("ADMIN_EMAIL"),
  adminPasswordHash: () => req("ADMIN_PASSWORD_HASH"),
  cronSecret: () => req("CRON_SECRET"),

  anthropicKey: () => opt("ANTHROPIC_API_KEY"),
  aiModel: () => opt("AI_MODEL") ?? "claude-opus-5-5",
  openaiKey: () => opt("OPENAI_API_KEY"),
  imageModel: () => opt("IMAGE_MODEL") ?? "gpt-image-1",

  graphVersion: () => opt("META_GRAPH_VERSION") ?? "v23.0",
  metaAppId: () => opt("META_APP_ID"),
  metaAppSecret: () => opt("META_APP_SECRET"),

  /** Hard kill-switch for real publishing. Anything other than the exact string "true" = test mode. */
  liveEnabledByEnv: () => process.env.PUBLISH_LIVE_ENABLED === "true",
};

export function missingConfig(): string[] {
  return [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SESSION_SECRET",
    "TOKEN_ENCRYPTION_KEY",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD_HASH",
    "CRON_SECRET",
  ].filter((n) => !process.env[n]);
}
