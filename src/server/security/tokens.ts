import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Unguessable public identifiers.
 *
 * Used where a URL has to be shareable without a session behind it — an order
 * confirmation link, for instance. 32 bytes of CSPRNG output in base64url is
 * 256 bits of entropy: enumerating it is not a realistic attack, which is the
 * whole point, because the resource number itself is sequential and therefore
 * is not a secret.
 */
export function createPublicToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Constant-time string comparison.
 *
 * `===` on secrets leaks their prefix through timing. Lengths are compared
 * first (that much is unavoidable and harmless), then the bytes are compared
 * without early exit.
 */
export function timingSafeEqualString(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
