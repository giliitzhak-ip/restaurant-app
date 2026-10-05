import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { SIM } from '../shared/constants';
import { MAX_MESSAGE_BYTES, PROTOCOL_VERSION, type ServerMsg, parseClientMsg } from '../shared/protocol';
import { TokenBucket, WindowLimiter } from './rateLimit';
import { type Conn, RoomManager } from './rooms';

export interface ServerOptions {
  port: number;
  host?: string;
  /** Directory with the built client (served statically). Optional. */
  staticDir?: string;
  allowedOrigins?: string[];
  trustProxy?: boolean;
  maxRooms?: number;
  tls?: { cert: string; key: string };
  log?: (...args: unknown[]) => void;
}

export interface GameServer {
  port: number;
  rooms: RoomManager;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

/** Limits per connection / per IP. */
export const NET_LIMITS = {
  msgBurst: 90,
  msgPerSecond: 75,
  /** Dropped messages tolerated before the socket is closed. */
  maxViolations: 150,
  connectionsPerIp: 10,
  roomCreatesPerMinute: 12,
  heartbeatMs: 10_000,
};

export function startGameServer(opts: ServerOptions): Promise<GameServer> {
  const log = opts.log ?? (() => {});
  const rooms = new RoomManager(opts.maxRooms ?? 500);
  const staticDir = opts.staticDir && existsSync(opts.staticDir) ? path.resolve(opts.staticDir) : null;
  const indexHtml = staticDir && existsSync(path.join(staticDir, 'index.html')) ? path.join(staticDir, 'index.html') : null;

  const handler: http.RequestListener = (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.rooms.size, version: PROTOCOL_VERSION }));
      return;
    }
    if (!staticDir || (req.method !== 'GET' && req.method !== 'HEAD')) {
      res.writeHead(staticDir ? 405 : 404, { 'Content-Type': 'text/plain' });
      res.end(staticDir ? 'Method not allowed' : 'Ping Pong 3D game server. Client not built on this host.');
      return;
    }
    let file = path.resolve(staticDir, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(staticDir)) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (!indexHtml) {
        res.writeHead(404);
        res.end();
        return;
      }
      file = indexHtml; // SPA fallback (e.g. /?room=CODE)
    }
    const ext = path.extname(file);
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).pipe(res);
  };

  const server = opts.tls
    ? https.createServer({ cert: readFileSync(opts.tls.cert), key: readFileSync(opts.tls.key) }, handler)
    : http.createServer(handler);

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  const perIp = new Map<string, number>();
  const createLimiter = new WindowLimiter(NET_LIMITS.roomCreatesPerMinute, 60_000);
  const alive = new WeakMap<WebSocket, boolean>();

  const clientIp = (req: http.IncomingMessage): string => {
    const fwd = req.headers['x-forwarded-for'];
    if (opts.trustProxy && typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
    return req.socket.remoteAddress ?? 'unknown';
  };

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const origin = req.headers.origin;
    const ip = clientIp(req);
    const reject = (code: number, text: string) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (url.pathname !== '/ws') return reject(404, 'Not Found');
    if (opts.allowedOrigins?.length && (!origin || !opts.allowedOrigins.includes(origin))) return reject(403, 'Forbidden');
    if ((perIp.get(ip) ?? 0) >= NET_LIMITS.connectionsPerIp) return reject(429, 'Too Many Requests');
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, ip));
  });

  function onConnection(ws: WebSocket, ip: string): void {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const bucket = new TokenBucket(NET_LIMITS.msgBurst, NET_LIMITS.msgPerSecond);
    let violations = 0;
    const conn: Conn = {
      ws,
      ip,
      room: null,
      side: null,
      send(msg: ServerMsg) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
    };
    const fail = (code: Parameters<typeof errorMsg>[0]) => conn.send(errorMsg(code));

    ws.on('message', (data, isBinary) => {
      if (!bucket.take()) {
        if (++violations > NET_LIMITS.maxViolations) {
          fail('RATE_LIMITED');
          ws.close(4008, 'rate limited');
        }
        return;
      }
      if (isBinary) return fail('BAD_MESSAGE');
      const msg = parseClientMsg(data.toString());
      if (!msg) return fail('BAD_MESSAGE');

      switch (msg.t) {
        case 'ping':
          conn.send({ t: 'pong', id: msg.id, st: Date.now() });
          return;
        case 'create': {
          if (msg.v !== PROTOCOL_VERSION) return fail('VERSION_MISMATCH');
          if (conn.room) conn.room.handle(conn, { t: 'leave' });
          if (!createLimiter.allow(ip)) return fail('RATE_LIMITED');
          const r = rooms.create(conn, msg.name, msg.paddle, msg.settings);
          if (typeof r === 'string') return fail(r);
          log(`room ${r.code} created`);
          return;
        }
        case 'join': {
          if (msg.v !== PROTOCOL_VERSION) return fail('VERSION_MISMATCH');
          if (conn.room) conn.room.handle(conn, { t: 'leave' });
          const r = rooms.join(conn, msg.code, msg.name, msg.paddle);
          if (typeof r === 'string') return fail(r);
          return;
        }
        case 'resume': {
          if (msg.v !== PROTOCOL_VERSION) return fail('VERSION_MISMATCH');
          const r = rooms.resume(conn, msg.code, msg.token);
          if (typeof r === 'string') return fail(r);
          return;
        }
        default:
          conn.room?.handle(conn, msg);
      }
    });

    ws.on('close', () => {
      perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1));
      if ((perIp.get(ip) ?? 0) === 0) perIp.delete(ip);
      conn.room?.disconnected(conn);
    });
    ws.on('error', () => {});
  }

  // Fixed-rate simulation loop with an accumulator (setInterval alone drifts).
  const tickMs = 1000 / SIM.tickRate;
  let last = performance.now();
  let acc = 0;
  const loop = setInterval(() => {
    const now = performance.now();
    acc += now - last;
    last = now;
    let n = 0;
    while (acc >= tickMs && n < 12) {
      rooms.tick();
      acc -= tickMs;
      n++;
    }
    if (n === 12) acc = 0; // way behind (e.g. process was suspended): don't spiral
  }, 4);
  const sweeper = setInterval(() => {
    rooms.sweep();
    createLimiter.sweep();
  }, 5000);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, NET_LIMITS.heartbeatMs);

  return new Promise((resolve) => {
    server.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        rooms,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(loop);
            clearInterval(sweeper);
            clearInterval(heartbeat);
            for (const ws of wss.clients) ws.terminate();
            wss.close();
            server.close(() => done());
          }),
      });
    });
  });
}

function errorMsg(code: 'ROOM_FULL' | 'ROOM_NOT_FOUND' | 'BAD_MESSAGE' | 'RATE_LIMITED' | 'SERVER_FULL' | 'VERSION_MISMATCH' | 'SESSION_EXPIRED'): ServerMsg {
  return { t: 'error', code };
}
