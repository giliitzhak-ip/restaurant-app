import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";

/** For protected server pages: the signed-in user, or a redirect to login. */
export async function requireUser(nextPath: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}
