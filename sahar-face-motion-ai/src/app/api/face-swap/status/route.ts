import { NextResponse } from "next/server";
import { apiUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { selectedFaceSwapProvider } from "@/providers/face-swap";
import { freeMode } from "@/server/billing";
import { providerAccount } from "@/server/face-swap";

/** Free Mode flag and the active provider's remaining credits (when the provider exposes them). */
export async function GET(req: Request) {
  const auth = await apiUser(req);
  if ("response" in auth) return auth.response;
  const provider = selectedFaceSwapProvider();
  if (!provider) return jsonError("ספק לא מוכר", 503);
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  const { account, error } = await providerAccount(provider, fresh);
  return NextResponse.json({
    ok: true,
    freeMode: freeMode(),
    provider: { id: provider.id, name: provider.displayName, paid: provider.paid, hasAccountApi: Boolean(provider.account) },
    account,
    accountError: error,
  });
}
