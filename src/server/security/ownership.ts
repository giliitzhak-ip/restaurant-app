import { getGuestToken, getSessionUser } from "@/server/auth/session";
import { getRepository } from "@/server/repositories";
import { timingSafeEqualString } from "@/server/security/tokens";
import type { RoomDesignRecord } from "@/types/design";
import type { SessionUser } from "@/types/commerce";

/**
 * Ownership of a saved room design.
 *
 * A design belongs either to an account or to a guest cookie, and there is no
 * third case: a row with neither owner is unreachable by design (the retention
 * job collects it). Every read, write, rename, delete, duplicate, cart add and
 * quote attachment goes through this function, so the rule is stated once and
 * cannot drift between call sites.
 *
 * The guest token is compared in constant time — it is a bearer secret in a
 * cookie, and `===` on it leaks its prefix.
 */

export type OwnershipFailure = "NOT_FOUND" | "FORBIDDEN";

export type OwnershipResult =
  | { ok: true; design: RoomDesignRecord; user: SessionUser | null; guestToken: string | null }
  | { ok: false; error: OwnershipFailure };

export interface OwnershipOptions {
  /** Lets the admin panel read a customer's design without impersonating them. */
  allowAdmin?: boolean;
}

export async function requireDesignOwnership(
  designId: string | null | undefined,
  options: OwnershipOptions = {},
): Promise<OwnershipResult> {
  if (!designId || typeof designId !== "string") return { ok: false, error: "NOT_FOUND" };

  const design = await getRepository().getDesign(designId);
  if (!design) return { ok: false, error: "NOT_FOUND" };

  const user = await getSessionUser();
  const guestToken = await getGuestToken();

  if (options.allowAdmin && user?.role === "ADMIN") {
    return { ok: true, design, user, guestToken };
  }

  if (design.userId) {
    if (user && design.userId === user.id) return { ok: true, design, user, guestToken };
    return { ok: false, error: "FORBIDDEN" };
  }

  if (design.guestToken) {
    if (timingSafeEqualString(design.guestToken, guestToken)) {
      return { ok: true, design, user, guestToken };
    }
    return { ok: false, error: "FORBIDDEN" };
  }

  // Ownerless row: nobody may touch it.
  return { ok: false, error: "FORBIDDEN" };
}

/** True when the caller may attach this design to a quote or an order. */
export async function ownsDesign(designId: string | null | undefined): Promise<boolean> {
  const result = await requireDesignOwnership(designId);
  return result.ok;
}

/**
 * Strips server-only fields before a design crosses into a client component.
 *
 * `guestToken` is the value of an httpOnly cookie. Serialising it into props
 * would hand it to page JavaScript — and therefore to any XSS — which is
 * exactly the exposure httpOnly exists to prevent.
 */
export function stripDesignSecrets(design: RoomDesignRecord): RoomDesignRecord {
  return { ...design, guestToken: null };
}
