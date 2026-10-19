import { NextResponse } from 'next/server';
import { checkHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

/** Liveness/readiness probe. Reports only booleans — no versions, hosts or secrets. */
export async function GET() {
  const health = await checkHealth();
  const ok = health.database && health.redis;
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', ...health },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
