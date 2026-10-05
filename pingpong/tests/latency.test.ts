import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type GameServer, startGameServer } from '../src/server/server';
import { BotPlayer, TestClient, sleep } from './helpers';

let server: GameServer;
let url: string;
beforeAll(async () => {
  server = await startGameServer({ port: 0, host: '127.0.0.1' });
  url = `ws://127.0.0.1:${server.port}/ws`;
});
afterAll(() => server.close());

describe.concurrent('simulated internet latency', () => {
  it.each([
    { delay: 40, jitter: 15 },
    { delay: 90, jitter: 30 },
  ])('plays real points with %o ms one-way latency and keeps the score consistent', async (lat) => {
    const a = new TestClient(url, lat);
    const b = new TestClient(url, { delay: lat.delay * 0.5, jitter: lat.jitter });
    await a.open();
    await b.open();
    a.create('Lag A', 1, 'advanced');
    const ja = await a.waitFor('joined');
    b.join(ja.code, 'Lag B');
    await b.waitFor('joined');
    await a.waitFor('room', (m) => m.players.every(Boolean));
    a.send({ t: 'ready', ready: true });
    b.send({ t: 'ready', ready: true });
    await a.waitFor('start');
    const ba = new BotPlayer(a, 0, 'medium', 21);
    const bb = new BotPlayer(b, 1, 'medium', 22);
    ba.start();
    bb.start();
    const room = server.rooms.rooms.get(ja.code)!;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && room.sim!.match.points[0] + room.sim!.match.points[1] < 4) await sleep(250);
    ba.stop();
    bb.stop();
    await sleep(lat.delay * 3 + 300);
    const srv = room.sim!.match.points;
    expect(srv[0] + srv[1]).toBeGreaterThanOrEqual(4);
    // Both delayed clients converge on exactly the server's score.
    expect(ba.latest!.points).toEqual(srv);
    expect(bb.latest!.points).toEqual(srv);
    // Both players actually hit the ball through the laggy link (returns, not only serves).
    const hits = ba.hits;
    expect(hits[0]).toBeGreaterThan(2);
    expect(hits[1]).toBeGreaterThan(2);
    // Inputs were acknowledged in order despite latency.
    expect(ba.latest!.ack![0]).toBeGreaterThan(100);
    a.close();
    b.close();
  }, 80_000);
});
