import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/shared/protocol';
import { LIMITS } from '../src/server/rooms';
import { type GameServer, startGameServer } from '../src/server/server';
import { BotPlayer, TestClient, sleep } from './helpers';

let server: GameServer;
let url: string;

beforeAll(async () => {
  server = await startGameServer({ port: 0, host: '127.0.0.1' });
  url = `ws://127.0.0.1:${server.port}/ws`;
});
afterAll(async () => {
  await server.close();
});

async function pair(bestOf: 1 | 3 = 1, assist: 'arcade' | 'advanced' = 'arcade') {
  const a = new TestClient(url);
  const b = new TestClient(url);
  await a.open();
  await b.open();
  a.create('Alice', bestOf, assist);
  const ja = await a.waitFor('joined');
  b.join(ja.code);
  const jb = await b.waitFor('joined');
  return { a, b, code: ja.code, ja, jb };
}

async function startGame(a: TestClient, b: TestClient) {
  await a.waitFor('room', (m) => m.players.every((p) => p !== null));
  a.send({ t: 'ready', ready: true });
  b.send({ t: 'ready', ready: true });
  await a.waitFor('start');
  await b.waitFor('start');
}

describe('rooms', () => {
  it('creates a room with a 6-char code and token, and a friend joins with the code', async () => {
    const { a, b, ja, jb, code } = await pair();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(ja.side).toBe(0);
    expect(jb.side).toBe(1);
    expect(ja.token).not.toBe(jb.token);
    const room = await a.waitFor('room', (m) => m.players[1] !== null);
    expect(room.players.map((p) => p?.name)).toEqual(['Alice', 'Bob']);
    expect(room.phase).toBe('lobby');
    a.close();
    b.close();
  });

  it('rejects a third player (room full) and unknown codes (not found)', async () => {
    const { a, b, code } = await pair();
    const c = new TestClient(url);
    await c.open();
    c.join(code, 'Carol');
    expect((await c.waitFor('error')).code).toBe('ROOM_FULL');
    c.join('ZZZZZZ', 'Carol');
    expect((await c.waitFor('error')).code).toBe('ROOM_NOT_FOUND');
    [a, b, c].forEach((x) => x.close());
  });

  it('validates messages and protocol version', async () => {
    const c = new TestClient(url);
    await c.open();
    c.sendRaw('not json');
    expect((await c.waitFor('error')).code).toBe('BAD_MESSAGE');
    c.send({ t: 'create', v: PROTOCOL_VERSION, name: '', paddle: 'red', settings: { bestOf: 1, assist: 'arcade' } });
    expect((await c.waitFor('error')).code).toBe('BAD_MESSAGE');
    c.send({ t: 'create', v: PROTOCOL_VERSION, name: 'x', paddle: 'rainbow', settings: { bestOf: 1, assist: 'arcade' } });
    expect((await c.waitFor('error')).code).toBe('BAD_MESSAGE');
    c.send({ t: 'input', seq: 1, i: { x: 'a', y: 1, tilt: 0, spin: 0, power: false, act: 0 } });
    expect((await c.waitFor('error')).code).toBe('BAD_MESSAGE');
    c.send({ t: 'create', v: 999, name: 'x', paddle: 'red', settings: { bestOf: 1, assist: 'arcade' } });
    expect((await c.waitFor('error')).code).toBe('VERSION_MISMATCH');
    c.send({ t: 'join', v: PROTOCOL_VERSION, code: 'abc', name: 'x', paddle: 'red' });
    expect((await c.waitFor('error')).code).toBe('BAD_MESSAGE');
    c.close();
  });

  it('rate-limits floods and closes abusive sockets', async () => {
    const c = new TestClient(url);
    await c.open();
    for (let i = 0; i < 600; i++) c.sendRaw(JSON.stringify({ t: 'ping', id: i }));
    expect((await c.waitFor('error', (m) => m.code === 'RATE_LIMITED')).code).toBe('RATE_LIMITED');
    await sleep(200);
    expect(c.closed).toBe(true);
  });

  it('starts when both are ready, streams authoritative state and acks inputs', async () => {
    const { a, b } = await pair();
    await startGame(a, b);
    const s1 = await a.waitFor('state');
    expect(s1.s.phase).toBe('countdown');
    for (let i = 1; i <= 5; i++) a.send({ t: 'input', seq: i, i: { x: 0.3, y: 1.0, tilt: 0, spin: 0, power: false, act: 0 } });
    const acked = await a.waitFor('state', (m) => (m.s.ack?.[0] ?? 0) >= 5);
    expect(acked.s.ack![0]).toBe(5);
    // Old/replayed sequence numbers are ignored.
    a.send({ t: 'input', seq: 3, i: { x: -1, y: 1.0, tilt: 0, spin: 0, power: false, act: 0 } });
    await sleep(150);
    const st = await a.waitFor('state');
    expect(st.s.pads[0][0]).toBeGreaterThan(0.2);
    // Clients cannot send scores: unknown message types are rejected.
    a.send({ t: 'score', points: [11, 0] });
    expect((await a.waitFor('error')).code).toBe('BAD_MESSAGE');
    a.close();
    b.close();
  });

  it('keeps both clients in sync with the server score during real play', async () => {
    const { a, b, code } = await pair(1, 'advanced');
    await startGame(a, b);
    const ba = new BotPlayer(a, 0, 'medium', 11);
    const bb = new BotPlayer(b, 1, 'medium', 12);
    ba.start();
    bb.start();
    const room = server.rooms.rooms.get(code)!;
    const deadline = Date.now() + 50_000;
    while (Date.now() < deadline && room.sim!.match.points[0] + room.sim!.match.points[1] < 3) await sleep(200);
    ba.stop();
    bb.stop();
    await sleep(300);
    const srv = room.sim!.match.points;
    expect(srv[0] + srv[1]).toBeGreaterThanOrEqual(3);
    expect(ba.latest!.points).toEqual(srv);
    expect(bb.latest!.points).toEqual(srv);
    expect(ba.hits[0] + ba.hits[1]).toBeGreaterThan(3);
    a.close();
    b.close();
  }, 70_000);

  it('pauses on disconnect, resumes with the token, and replays the interrupted point', async () => {
    const { a, b, code, jb } = await pair();
    await startGame(a, b);
    await a.waitFor('state', (m) => m.s.phase === 'serve', 6000);
    b.close();
    const paused = await a.waitFor('paused');
    expect(paused.reason).toBe('opponentDisconnected');
    const room = server.rooms.rooms.get(code)!;
    expect(room.sim!.paused).toBe(true);
    const before = [...room.sim!.match.points];
    // Reconnect from a "new device/tab" with the stored token.
    const b2 = new TestClient(url);
    await b2.open();
    b2.send({ t: 'resume', v: PROTOCOL_VERSION, code, token: jb.token });
    const rejoined = await b2.waitFor('joined');
    expect(rejoined.side).toBe(1);
    await a.waitFor('resumed');
    expect(room.sim!.paused).toBe(false);
    expect(room.sim!.match.points).toEqual(before);
    await b2.waitFor('state');
    // A wrong token is refused.
    const c = new TestClient(url);
    await c.open();
    c.send({ t: 'resume', v: PROTOCOL_VERSION, code, token: 'x'.repeat(24) });
    expect((await c.waitFor('error')).code).toBe('SESSION_EXPIRED');
    [a, b2, c].forEach((x) => x.close());
  });

  it('ends the game if the opponent does not come back in time', async () => {
    const grace = LIMITS.reconnectGraceMs;
    LIMITS.reconnectGraceMs = 300;
    try {
      const { a, b } = await pair();
      await startGame(a, b);
      b.close();
      await a.waitFor('paused');
      await sleep(400);
      server.rooms.sweep();
      expect((await a.waitFor('closed')).reason).toBe('timeout');
      const room = await a.waitFor('room', (m) => m.phase === 'lobby');
      expect(room.players[1]).toBeNull();
      a.close();
    } finally {
      LIMITS.reconnectGraceMs = grace;
    }
  });

  it('leaving notifies the opponent; empty rooms are deleted', async () => {
    const { a, b, code } = await pair();
    await startGame(a, b);
    b.send({ t: 'leave' });
    expect((await a.waitFor('closed')).reason).toBe('opponentLeft');
    await a.waitFor('room', (m) => m.phase === 'lobby' && m.players[1] === null);
    a.send({ t: 'leave' });
    await sleep(100);
    server.rooms.sweep();
    expect(server.rooms.rooms.has(code)).toBe(false);
    a.close();
    b.close();
  });

  it('supports a rematch after the match ends', async () => {
    const { a, b, code } = await pair(1, 'advanced');
    await startGame(a, b);
    const room = server.rooms.rooms.get(code)!;
    // Fast-forward the authoritative match to 10-0, then let real play decide it.
    room.sim!.match.points = [10, 0];
    const ba = new BotPlayer(a, 0, 'hard', 3);
    const bb = new BotPlayer(b, 1, 'easy', 4);
    ba.start();
    bb.start();
    await a.waitFor('room', (m) => m.phase === 'finished', 45_000);
    ba.stop();
    bb.stop();
    expect(room.sim!.match.winner).not.toBeNull();
    a.send({ t: 'rematch' });
    await b.waitFor('room', (m) => m.rematch[0]);
    a.msgs = [];
    b.send({ t: 'rematch' });
    await a.waitFor('start');
    const st = await a.waitFor('state', (m) => m.s.phase === 'countdown');
    expect(st.s.points).toEqual([0, 0]);
    expect(st.s.winner).toBeNull();
    a.close();
    b.close();
  }, 60_000);
});

describe('origin allow-list', () => {
  it('rejects WebSocket upgrades from other origins', async () => {
    const s = await startGameServer({ port: 0, host: '127.0.0.1', allowedOrigins: ['https://good.example'] });
    const u = `ws://127.0.0.1:${s.port}/ws`;
    const bad = new TestClient(u, null, { Origin: 'https://evil.example' });
    await expect(bad.open()).rejects.toBeTruthy();
    const good = new TestClient(u, null, { Origin: 'https://good.example' });
    await good.open();
    good.close();
    await s.close();
  });
});
