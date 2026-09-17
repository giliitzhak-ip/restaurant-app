"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/config/site";
import { getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";

const schema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().max(20).optional(),
});

export async function updateProfileAction(input: {
  fullName: string;
  phone?: string;
}): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false };

  await getRepository().updateUser(user.id, {
    fullName: parsed.data.fullName,
    phone: parsed.data.phone?.trim() ? parsed.data.phone.trim() : null,
  });
  revalidatePath(routes.account.profile);
  return { ok: true };
}
