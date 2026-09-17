"use server";

import { z } from "zod";
import { getRepository } from "@/server/repositories";

const schema = z.object({ email: z.string().email() });

export async function subscribeNewsletterAction(
  email: string,
): Promise<{ ok: boolean }> {
  const parsed = schema.safeParse({ email });
  if (!parsed.success) return { ok: false };
  await getRepository().addNewsletterSignup(parsed.data.email);
  return { ok: true };
}
