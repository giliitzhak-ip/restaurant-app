/**
 * The plain-HTTP side of the server: the health check and invite-code lookup.
 *
 * Matchmaking (`POST /matchmake/...`) is *not* handled here — Colyseus installs
 * its own listener for it and forwards everything else to the listeners that
 * were already registered. This handler must therefore be attached to the HTTP
 * server **before** the Colyseus `Server` is constructed; attach it afterwards
 * and both handlers answer every matchmaking request, which reserves two seats
 * for one player.
 *
 * Written against `node:http` directly so the image carries no web framework,
 * and so the health check cannot be broken by one.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { matchMaker } from '@colyseus/core';
import { PROTOCOL_VERSION, normalizeInviteCode } from '../net/protocol';
import { InviteRegistry } from './InviteRegistry';

export interface HttpRouteOptions {
  /** Exact origins allowed to call the API. Empty means "same origin only". */
  allowedOrigins: readonly string[];
  /** Invite lookups allowed per client address per minute. */
  inviteLookupsPerMinute: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function clientAddress(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

export function createRequestHandler(options: HttpRouteOptions) {
  // The presence instance only exists once the server has started, so the
  // registry is built on first use rather than at wiring time.
  let invites: InviteRegistry | null = null;
  const inviteRegistry = (): InviteRegistry => {
    invites ??= new InviteRegistry(matchMaker.presence);
    return invites;
  };
  // Process-local on purpose: this only throttles one process's own callers and
  // holds nothing another process would need, so it does not stand in the way
  // of running several of them.
  const buckets = new Map<string, Bucket>();

  const allowOrigin = (request: IncomingMessage): string | null => {
    const origin = request.headers.origin;
    if (typeof origin !== 'string') return null;
    return options.allowedOrigins.includes(origin) ? origin : null;
  };

  const withCors = (request: IncomingMessage, response: ServerResponse): boolean => {
    const origin = allowOrigin(request);
    if (origin !== null) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Max-Age', '600');
      return true;
    }
    // No Origin header at all is a same-origin or non-browser caller.
    return request.headers.origin === undefined;
  };

  const rateLimited = (request: IncomingMessage): boolean => {
    const key = clientAddress(request);
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return false;
    }
    bucket.count += 1;
    return bucket.count > options.inviteLookupsPerMinute;
  };

  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const allowed = withCors(request, response);

    if (request.method === 'OPTIONS') {
      response.writeHead(allowed ? 204 : 403).end();
      return;
    }
    if (!allowed) {
      sendJson(response, 403, { error: 'origin not allowed' });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {
        status: 'ok',
        protocolVersion: PROTOCOL_VERSION,
        rooms: matchMaker.stats.local.roomCount,
        clients: matchMaker.stats.local.ccu,
      });
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/invite/')) {
      if (rateLimited(request)) {
        sendJson(response, 429, { error: 'rateLimited' });
        return;
      }
      const code = normalizeInviteCode(url.pathname.slice('/invite/'.length));
      if (code === null) {
        sendJson(response, 400, { error: 'invalidCode' });
        return;
      }
      const roomId = await inviteRegistry().resolve(code);
      if (roomId === null) {
        sendJson(response, 404, { error: 'roomNotFound' });
        return;
      }
      sendJson(response, 200, { roomId });
      return;
    }

    sendJson(response, 404, { error: 'not found' });
  };
}
