"use server";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { legalDocuments } from "@/config/legal";
import { isProduction } from "@/config/env";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  serialiseConsent,
  type ConsentChoice,
} from "@/lib/consent";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { rateLimit } from "@/server/security/rate-limit";
import { log } from "@/server/observability/logger";

const schema = z.object({
  functional: z.boolean(),
  analytics: z.boolean(),
  marketing: z.boolean(),
  source: z.enum(["COOKIE_BANNER", "PRIVACY_SETTINGS"]),
});

/**
 * Truncates an address before it is stored.
 *
 * A consent record has to be able to show it came from a real session, and
 * that is all. A /24 (IPv4) or /48 (IPv6) prefix does that without keeping an
 * identifier that can be joined back to a person.
 */
function ipPrefix(raw: string | null): string | null {
  if (!raw) return null;
  const address = raw.split(",")[0]?.trim();
  if (!address) return null;
  if (address.includes(":")) {
    return address.split(":").slice(0, 3).join(":") + "::/48";
  }
  const octets = address.split(".");
  if (octets.length !== 4) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

/** Hashed, never stored raw — it is a fingerprinting surface otherwise. */
function hashUserAgent(raw: string | null): string | null {
  if (!raw) return null;
  return createHash("sha256").update(raw).digest("base64url").slice(0, 22);
}

export type ConsentResult = { ok: boolean };

/**
 * Records a cookie-consent decision.
 *
 * Two places, deliberately:
 *
 *  - the cookie, because that is what gates the client at the next page load
 *    and it has to survive without a database;
 *  - a `ConsentRecord` row, because "prove this visitor agreed, and to which
 *    version" needs an answer that the visitor cannot edit.
 *
 * A database failure does not fail the call. Refusing to honour a rejection
 * because the audit write failed would be the worst possible outcome — the
 * visitor's choice takes effect either way and the failure is logged.
 */
export async function setConsentAction(
  input: z.input<typeof schema>,
): Promise<ConsentResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const limited = await rateLimit("consent");
  if (!limited.ok) return { ok: false };

  const { source, ...categories } = parsed.data;
  const choice: ConsentChoice = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    ...categories,
  };

  const jar = await cookies();
  jar.set(CONSENT_COOKIE, serialiseConsent(choice), {
    httpOnly: false, // the client reads it to gate scripts before hydration
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: CONSENT_MAX_AGE_SECONDS,
  });

  try {
    const headerList = await headers();
    const user = await getSessionUser();
    await getRepository().recordConsent({
      kind: "COOKIES",
      source,
      granted: categories.functional || categories.analytics || categories.marketing,
      documentVersion: `${legalDocuments.cookies.version}/categories-v${CONSENT_VERSION}`,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      categories,
      ipPrefix: ipPrefix(headerList.get("x-forwarded-for")),
      userAgentHash: hashUserAgent(headerList.get("user-agent")),
    });
  } catch (error) {
    log.warn("consent.record_failed", { error: String(error) });
  }

  return { ok: true };
}
