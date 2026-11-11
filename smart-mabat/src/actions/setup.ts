"use server";

import { randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/crypto";
import { missingConfig } from "@/lib/env";

export interface SetupValues {
  error?: string;
  values?: Record<string, string>;
}

/**
 * One-time helper for first setup from a phone: generates random secrets and hashes the admin password.
 * Stores NOTHING. Disabled automatically once the server is fully configured.
 */
export async function generateSetupValues(_prev: SetupValues | undefined, form: FormData): Promise<SetupValues> {
  if (missingConfig().length === 0) return { error: "המערכת כבר מוגדרת – העמוד הזה כבוי." };
  const password = String(form.get("password") ?? "");
  if (password.length < 12) return { error: "בחרו סיסמה של 12 תווים לפחות" };
  return {
    values: {
      ADMIN_PASSWORD_HASH: hashPassword(password),
      SESSION_SECRET: randomBytes(32).toString("base64url"),
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      CRON_SECRET: randomBytes(24).toString("base64url"),
    },
  };
}
