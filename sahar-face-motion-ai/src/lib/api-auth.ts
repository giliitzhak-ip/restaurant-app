import "server-only";
import { getCurrentUser, type SessionUser } from "./session";
import { isSameOrigin, jsonError } from "./http";

/** For API routes: the signed-in user, or a ready-made error response. */
export async function apiUser(req: Request, opts: { mutating?: boolean } = {}): Promise<{ user: SessionUser } | { response: Response }> {
  if (opts.mutating && !isSameOrigin(req)) return { response: jsonError("בקשה לא מורשית", 403) };
  const user = await getCurrentUser();
  if (!user) return { response: jsonError("יש להתחבר מחדש", 401) };
  return { user };
}
