import { NextResponse } from "next/server";

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Rejects cross-site state-changing requests (defence in depth on top of SameSite cookies). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older Safari may omit Origin on some requests
  const hosts = [req.headers.get("x-forwarded-host"), req.headers.get("host")];
  // Behind proxies (e.g. GitHub Codespaces port forwarding) Host may be internal; APP_URL is the public address.
  try {
    if (process.env.APP_URL) hosts.push(new URL(process.env.APP_URL).host);
    return hosts.includes(new URL(origin).host);
  } catch {
    return false;
  }
}
