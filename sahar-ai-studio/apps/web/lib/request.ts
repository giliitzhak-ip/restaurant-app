import 'server-only';
import { headers } from 'next/headers';

/** Client IP and user agent for auditing and rate limiting. */
export async function getRequestMeta() {
  const h = await headers();
  // Behind a trusted reverse proxy the first X-Forwarded-For entry is the client.
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ipAddress = forwarded || h.get('x-real-ip') || 'unknown';
  return { ipAddress, userAgent: h.get('user-agent') };
}
