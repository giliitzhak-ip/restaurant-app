"use server";

import { z } from "zod";
import { getRepository } from "@/server/repositories";
import { rateLimit } from "@/server/security/rate-limit";

const schema = z.object({ email: z.string().trim().email().max(254) });

/**
 * Newsletter signup.
 *
 * Always answers `ok` for a well-formed address, whether or not it was already
 * on the list — the response must not turn the footer form into a "is this
 * person a customer?" oracle.
 */
export async function subscribeNewsletterAction(
  email: string,
): Promise<{ ok: boolean }> {
  const parsed = schema.safeParse({ email });
  if (!parsed.success) return { ok: false };

  const limited = await rateLimit("newsletter");
  if (!limited.ok) return { ok: true };

  await getRepository().addNewsletterSignup(parsed.data.email.toLowerCase());
  return { ok: true };
}
