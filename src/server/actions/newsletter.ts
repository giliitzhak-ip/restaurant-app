"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { legalDocuments } from "@/config/legal";
import { MARKETING_CONSENT_TEXT } from "@/lib/consent";
import { getRepository } from "@/server/repositories";
import { rateLimit } from "@/server/security/rate-limit";
import { log } from "@/server/observability/logger";

const schema = z.object({
  email: z.string().trim().email().max(254),
  /**
   * Must be explicitly true. There is no default and no pre-tick: an address
   * arriving without an affirmative opt-in is not a subscription.
   */
  consent: z.literal(true),
  source: z.enum(["FOOTER", "CHECKOUT", "ACCOUNT_SETTINGS"]).default("FOOTER"),
});

function ipPrefix(raw: string | null): string | null {
  if (!raw) return null;
  const address = raw.split(",")[0]?.trim();
  if (!address) return null;
  if (address.includes(":")) return address.split(":").slice(0, 3).join(":") + "::/48";
  const octets = address.split(".");
  return octets.length === 4 ? `${octets[0]}.${octets[1]}.${octets[2]}.0/24` : null;
}

/**
 * Newsletter signup.
 *
 * Always answers `ok` for a well-formed address, whether or not it was already
 * on the list, already suppressed, or rate limited — the response must not
 * turn the footer form into a "is this person a customer?" oracle.
 *
 * What differs behind that uniform answer: a suppressed address is not written
 * anywhere, and no consent row is created for it. An unsubscribe is a standing
 * instruction, not a state that the next form submission clears.
 */
export async function subscribeNewsletterAction(input: {
  email: string;
  consent: boolean;
  source?: "FOOTER" | "CHECKOUT" | "ACCOUNT_SETTINGS";
}): Promise<{ ok: boolean }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const limited = await rateLimit("newsletter");
  if (!limited.ok) return { ok: true };

  const email = parsed.data.email.toLowerCase();
  const repository = getRepository();
  const prefix = ipPrefix((await headers()).get("x-forwarded-for"));

  const result = await repository.addNewsletterSignup({
    email,
    source: parsed.data.source,
    consentText: MARKETING_CONSENT_TEXT,
    documentVersion: legalDocuments.privacy.version,
    ipPrefix: prefix,
  });

  if (result.suppressed) {
    log.info("newsletter.suppressed", { source: parsed.data.source });
    return { ok: true };
  }

  try {
    await repository.recordConsent({
      kind: "MARKETING",
      source: parsed.data.source === "FOOTER" ? "NEWSLETTER_FORM" : "ACCOUNT_SETTINGS",
      granted: true,
      documentVersion: legalDocuments.privacy.version,
      email,
      ipPrefix: prefix,
    });
  } catch (error) {
    log.warn("newsletter.consent_record_failed", { error: String(error) });
  }

  return { ok: true };
}

/**
 * Unsubscribe from a mailed link.
 *
 * One click, no login, no confirmation step that can fail — and it writes a
 * suppression, not just a flag, so a later import cannot resurrect the
 * address. The token is unguessable, which is what stops it being used to
 * unsubscribe someone else.
 */
export async function unsubscribeAction(token: string): Promise<{ ok: boolean }> {
  if (!token || token.length < 16 || token.length > 128) return { ok: false };

  const limited = await rateLimit("unsubscribe");
  if (!limited.ok) return { ok: false };

  const result = await getRepository().unsubscribeByToken(token);
  if (!result.ok || !result.email) return { ok: false };

  try {
    await getRepository().recordConsent({
      kind: "MARKETING",
      source: "UNSUBSCRIBE_LINK",
      granted: false,
      documentVersion: legalDocuments.privacy.version,
      email: result.email,
    });
  } catch (error) {
    log.warn("newsletter.withdrawal_record_failed", { error: String(error) });
  }

  return { ok: true };
}
