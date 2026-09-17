import { getCurrentUser } from '@/lib/auth';
import { withUser } from '@/lib/db';
import { getRealtimeTransport, type RealtimeEvent } from '@/domains/notifications/realtime';
import { logOperation, newRequestId } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Server-Sent Events stream for the signed-in user (spec §24).
 *
 * Authorization is applied to DELIVERY, not just to the query: an event is
 * forwarded only if this user is one of its subjects. And because events
 * carry identifiers only, the client must still refetch through RLS to see
 * anything — so even a filtering bug here cannot leak row contents.
 *
 * SSE rather than WebSockets: the data flow is one-way (server tells the
 * client "refetch X"), EventSource reconnects on its own, and it needs no
 * extra infrastructure.
 */
export async function GET(request: Request) {
  const requestId = newRequestId();
  const user = await getCurrentUser();

  if (!user) {
    return new Response('event: unauthorized\ndata: {}\n\n', {
      status: 401,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  // Which provider profile, if any, belongs to this user.
  const providerId = user.role === 'provider' ? user.id : null;

  // Jobs this user is currently party to, so location events can be filtered.
  const jobIds = new Set(
    (
      await withUser(user.id, (db) =>
        db.many<{ id: string }>(
          `select j.id from jobs j
            where j.status not in ('COMPLETED','PAID','REVIEWED',
                                   'CANCELLED_BY_CUSTOMER','CANCELLED_BY_PROVIDER',
                                   'CANCELLED_BY_SYSTEM')`,
        ),
      )
    ).map((r) => r.id),
  );

  const transport = getRealtimeTransport();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // Tells the client to do its initial authoritative fetch.
      send('ready', { userId: user.id, role: user.role, at: Date.now() });

      const relevant = (event: RealtimeEvent): boolean => {
        const p = event.payload;
        switch (event.channel) {
          case 'gs_job_change':
            if (p.customer_id === user.id || p.provider_id === user.id) {
              if (typeof p.job_id === 'string') jobIds.add(p.job_id);
              return true;
            }
            return typeof p.job_id === 'string' && jobIds.has(p.job_id);
          case 'gs_offer_change':
            return p.provider_id === providerId || p.customer_id === user.id
              || (typeof p.job_id === 'string' && jobIds.has(p.job_id));
          case 'gs_provider_location':
            // Only the customer of the in-flight job, or the provider.
            return p.customer_id === user.id || p.provider_id === providerId;
          case 'gs_notification':
            return p.user_id === user.id;
          default:
            return false;
        }
      };

      const unsubscribe = transport.subscribe((event) => {
        if (!relevant(event)) return;
        // Identifiers only — deliberately not the row.
        send(event.channel, event.payload);
      });

      // Keep-alive comment: proxies drop idle connections, and a silent drop
      // would look like "nothing is happening" to the customer.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          closed = true;
        }
      }, 25_000);
      heartbeat.unref?.();

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
        logOperation({ requestId, userId: user.id, operation: 'events.stream.close', result: 'ok' });
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  logOperation({ requestId, userId: user.id, operation: 'events.stream.open', result: 'ok' });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx and similar from buffering the stream into uselessness.
      'X-Accel-Buffering': 'no',
    },
  });
}
