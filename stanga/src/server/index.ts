/**
 * The STANGA authoritative server.
 *
 * Configuration is environment only — there are no secrets and no keys in the
 * repository, and nothing here needs any.
 *
 *   PORT                       listening port (default 2567)
 *   HOST                       bind address (default 0.0.0.0)
 *   ALLOWED_ORIGINS            comma-separated exact origins allowed to connect
 *   INVITE_LOOKUPS_PER_MINUTE  per-address cap on invite-code lookups
 *
 * TLS terminates at the load balancer, so the process itself speaks plain HTTP
 * and WS; see docs/deployment.md for the WSS and sticky-session requirements.
 */
import { createServer } from 'node:http';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_ONE_VS_ONE, ROOM_TWO_VS_TWO } from '../net/protocol';
import { OnlineOneVsOneRoom } from './OnlineOneVsOneRoom';
import { OnlineTwoVsTwoRoom } from './OnlineTwoVsTwoRoom';
import { createRequestHandler } from './httpRoutes';

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const port = numberFromEnv('PORT', 2567);
const host = process.env.HOST ?? '0.0.0.0';
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const httpServer = createServer();

// Registered before `new Server(...)`: Colyseus takes over the "request" event,
// answers /matchmake itself and replays everything else to the listeners that
// existed when it attached. Registering afterwards would make both handlers
// answer the same matchmaking call.
const handle = createRequestHandler({
  allowedOrigins,
  inviteLookupsPerMinute: numberFromEnv('INVITE_LOOKUPS_PER_MINUTE', 30),
});
httpServer.on('request', (request, response) => {
  void handle(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});

// Colyseus answers matchmaking with `Access-Control-Allow-Origin: *` unless
// told otherwise; the allow-list applies there too.
const defaultCorsHeaders = matchMaker.controller.getCorsHeaders.bind(matchMaker.controller);
matchMaker.controller.getCorsHeaders = (request) => {
  const headers = defaultCorsHeaders(request);
  const origin = request.headers.origin;
  if (allowedOrigins.length === 0) return headers;
  return {
    ...headers,
    'Access-Control-Allow-Origin':
      typeof origin === 'string' && allowedOrigins.includes(origin) ? origin : 'null',
    Vary: 'Origin',
  };
};

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    // A browser that is not on the allow-list is refused before the socket is
    // upgraded, so a hostile page cannot open a room from someone else's tab.
    verifyClient: (info, done) => {
      const origin = info.origin;
      if (origin === undefined || allowedOrigins.length === 0) {
        done(true);
        return;
      }
      done(allowedOrigins.includes(origin), 403, 'origin not allowed');
    },
  }),
});

gameServer.define(ROOM_ONE_VS_ONE, OnlineOneVsOneRoom);
gameServer.define(ROOM_TWO_VS_TWO, OnlineTwoVsTwoRoom);

void gameServer.listen(port, host).then(() => {
  // No tokens, no invite codes: server logs never carry anything that would let
  // a reader take over a session.
  console.log(`STANGA server listening on ${host}:${port}`);
});
