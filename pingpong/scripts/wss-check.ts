// Verifies the server's built-in TLS mode: HTTPS + WSS with a (self-signed) certificate.
// Usage: npx tsx scripts/wss-check.ts <certFile> <keyFile>
import WebSocket from 'ws';
import { startGameServer } from '../src/server/server';
import { PROTOCOL_VERSION, type ServerMsg } from '../src/shared/protocol';

const [cert, key] = process.argv.slice(2);
const s = await startGameServer({ port: 0, host: '127.0.0.1', tls: { cert, key } });
const url = `wss://127.0.0.1:${s.port}/ws`;
const open = () =>
  new Promise<{ ws: WebSocket; next: (t: string) => Promise<ServerMsg> }>((res, rej) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false });
    const q: ServerMsg[] = [];
    const waiters: [string, (m: ServerMsg) => void][] = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      const i = waiters.findIndex(([t]) => t === m.t);
      if (i >= 0) waiters.splice(i, 1)[0][1](m);
      else q.push(m);
    });
    ws.on('open', () =>
      res({
        ws,
        next: (t) => {
          const i = q.findIndex((m) => m.t === t);
          if (i >= 0) return Promise.resolve(q.splice(i, 1)[0]);
          return new Promise((r) => waiters.push([t, r]));
        },
      }),
    );
    ws.on('error', rej);
  });
const a = await open();
const b = await open();
a.ws.send(JSON.stringify({ t: 'create', v: PROTOCOL_VERSION, name: 'TLS-A', paddle: 'red', settings: { bestOf: 1, assist: 'arcade' } }));
const j = (await a.next('joined')) as Extract<ServerMsg, { t: 'joined' }>;
b.ws.send(JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, code: j.code, name: 'TLS-B', paddle: 'blue' }));
await b.next('joined');
a.ws.send(JSON.stringify({ t: 'ready', ready: true }));
b.ws.send(JSON.stringify({ t: 'ready', ready: true }));
await a.next('start');
const st = (await b.next('state')) as Extract<ServerMsg, { t: 'state' }>;
const health = await fetch(`https://127.0.0.1:${s.port}/healthz`).catch(() => null);
console.log(`WSS OK: room ${j.code}, game started, state phase=${st.s.phase}; https healthz fetch (untrusted cert) ->`, health ? health.status : 'rejected as expected by fetch');
a.ws.close();
b.ws.close();
await s.close();
process.exit(0);
