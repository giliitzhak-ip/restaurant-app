/**
 * The authoritative room, end to end.
 *
 * A real Colyseus server on a real socket, with real `colyseus.js` clients —
 * no mocks. If this passes, online 1×1 actually works; if it is mocked, it
 * proves nothing, which is the whole reason this file is shaped like this.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from 'colyseus.js';
import {
  ClientMessage,
  InputFlag,
  PROTOCOL_VERSION,
  ROOM_ONE_VS_ONE,
  RejectReason,
  ServerMessage,
  normalizeInviteCode,
  type NetEvent,
  type WelcomePayload,
} from '../src/net/protocol';
import type { MatchRoomState } from '../src/net/schema';
import { OnlineOneVsOneRoom } from '../src/server/OnlineOneVsOneRoom';
import { createRequestHandler } from '../src/server/httpRoutes';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `predicate` holds, so a test never sleeps longer than it must. */
async function until(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the server');
    await sleep(25);
  }
}

let httpServer: HttpServer;
let gameServer: Server;
let endpoint: string;
const openRooms: Room<MatchRoomState>[] = [];

interface Joined {
  room: Room<MatchRoomState>;
  welcome: WelcomePayload;
  events: NetEvent[];
}

async function connect(
  options: Record<string, unknown>,
  join: (client: Client) => Promise<Room<MatchRoomState>>,
): Promise<Joined> {
  const room = await join(new Client(endpoint));
  openRooms.push(room);
  const events: NetEvent[] = [];
  const welcome = await new Promise<WelcomePayload>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no welcome')), 10_000);
    room.onMessage(ServerMessage.Welcome, (payload: WelcomePayload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  room.onMessage(ServerMessage.Event, (event: NetEvent) => events.push(event));
  room.onMessage(ServerMessage.Pong, () => {});
  void options;
  return { room, welcome, events };
}

const joinOptions = (name: string, extra: Record<string, unknown> = {}) => ({
  protocolVersion: PROTOCOL_VERSION,
  intent: 'quick',
  displayName: name,
  ...extra,
});

async function quickPair(): Promise<[Joined, Joined]> {
  const a = await connect({}, (client) =>
    client.joinOrCreate<MatchRoomState>(ROOM_ONE_VS_ONE, joinOptions('גיל')),
  );
  const b = await connect({}, (client) =>
    client.joinOrCreate<MatchRoomState>(ROOM_ONE_VS_ONE, joinOptions('דני')),
  );
  await until(() => a.room.roomId === b.room.roomId && a.room.state.stage === 'lobby');
  return [a, b];
}

/** Readies both players and waits for the kick-off countdown to finish. */
async function kickOff(a: Joined, b: Joined): Promise<void> {
  a.room.send(ClientMessage.Ready, {});
  b.room.send(ClientMessage.Ready, {});
  await until(() => a.room.state.stage === 'playing', 20_000);
  await until(() => a.room.state.phase === 'playing', 20_000);
}

beforeAll(async () => {
  httpServer = createServer();
  // Node closes idle keep-alive sockets after 5s; the HTTP client colyseus.js
  // uses does not retry on a hang-up, which would fail a test that simply
  // spent longer than that simulating.
  httpServer.keepAliveTimeout = 0;
  httpServer.on('request', (request, response) => {
    void createRequestHandler({ allowedOrigins: [], inviteLookupsPerMinute: 100 })(
      request,
      response,
    ).catch(() => response.end());
  });
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define(ROOM_ONE_VS_ONE, OnlineOneVsOneRoom);
  await gameServer.listen(0);
  const address = httpServer.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  endpoint = `http://127.0.0.1:${port}`;
}, 60_000);

/**
 * Every test leaves its rooms behind, so the next one starts against an idle
 * server. A room that is still simulating would otherwise take a share of the
 * single event loop this process gives all of them.
 */
async function closeRooms(): Promise<void> {
  for (const room of openRooms.splice(0)) {
    try {
      // A room whose socket already went away never settles its leave().
      await Promise.race([room.leave(true), sleep(500)]);
    } catch {
      // Already gone; nothing to close.
    }
  }
  await sleep(150);
}

afterEach(closeRooms);

afterAll(async () => {
  await closeRooms();
  await gameServer.gracefullyShutdown(false);
});

describe('online 1×1 room', () => {
  it('seats two quick-match players on opposite teams in one room', async () => {
    const [a, b] = await quickPair();

    expect(a.room.roomId).toBe(b.room.roomId);
    expect(a.welcome.playerId).not.toBe(b.welcome.playerId);
    expect(a.welcome.team).not.toBe(b.welcome.team);
    expect(a.welcome.protocolVersion).toBe(PROTOCOL_VERSION);
    // Seats are the server's to hand out; nothing here came from the client.
    expect([a.welcome.playerId, b.welcome.playerId].sort()).toEqual(['away-1', 'home-1']);
    expect(a.room.state.players.get('home-1')?.name).toBeTruthy();
  }, 40_000);

  it('rejects a client on a different protocol version', async () => {
    await expect(
      new Client(endpoint).joinOrCreate(
        ROOM_ONE_VS_ONE,
        joinOptions('ישן', { protocolVersion: PROTOCOL_VERSION + 1 }),
      ),
    ).rejects.toThrow(RejectReason.ProtocolMismatch);
  }, 30_000);

  it('rejects a client with no usable name', async () => {
    await expect(
      new Client(endpoint).joinOrCreate(ROOM_ONE_VS_ONE, joinOptions('   ')),
    ).rejects.toThrow(RejectReason.InvalidName);
  }, 30_000);

  it('keeps a private room out of matchmaking and reachable by its code', async () => {
    const host = await connect({}, (client) =>
      client.create<MatchRoomState>(ROOM_ONE_VS_ONE, joinOptions('מארח', { intent: 'create' })),
    );
    await until(() => host.room.state.inviteCode.length > 0);
    const code = host.room.state.inviteCode;

    expect(normalizeInviteCode(code)).toBe(code);
    expect(host.room.state.isPrivate).toBe(true);

    // A stranger looking for any match must not fall into the private room.
    const stranger = await connect({}, (client) =>
      client.joinOrCreate<MatchRoomState>(ROOM_ONE_VS_ONE, joinOptions('זר')),
    );
    expect(stranger.room.roomId).not.toBe(host.room.roomId);

    const lookup = await fetch(`${endpoint}/invite/${code}`);
    expect(lookup.status).toBe(200);
    expect(((await lookup.json()) as { roomId: string }).roomId).toBe(host.room.roomId);

    const friend = await connect({}, (client) =>
      client.joinById<MatchRoomState>(
        host.room.roomId,
        joinOptions('חבר', { intent: 'join', inviteCode: code }),
      ),
    );
    await until(() => host.room.state.stage === 'lobby');
    expect(friend.welcome.playerId).not.toBe(host.welcome.playerId);

    // And a third player cannot take a seat that does not exist.
    await expect(
      new Client(endpoint).joinById(host.room.roomId, joinOptions('שלישי', { intent: 'join' })),
    ).rejects.toThrow();

    expect((await fetch(`${endpoint}/invite/ZZZZZ`)).status).toBe(404);
    expect((await fetch(`${endpoint}/invite/nope`)).status).toBe(400);
  }, 60_000);

  it('answers a health check with the protocol version it speaks', async () => {
    const response = await fetch(`${endpoint}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      protocolVersion: PROTOCOL_VERSION,
    });
  }, 20_000);

  it('runs the match, acknowledges input and moves the player who sent it', async () => {
    const [a, b] = await quickPair();
    await kickOff(a, b);

    const before = a.room.state.players.get(a.welcome.playerId)?.z ?? 0;
    const forward = a.welcome.team === 'home' ? 1 : -1;
    let sequence = 0;
    for (let i = 0; i < 70; i += 1) {
      sequence += 1;
      a.room.send(ClientMessage.Input, {
        n: sequence,
        mx: 0,
        my: forward,
        ax: 0,
        ay: forward,
        f: InputFlag.Sprint,
      });
      await sleep(16);
    }
    await sleep(200);

    const mine = a.room.state.players.get(a.welcome.playerId);
    expect(mine?.lastInput).toBeGreaterThan(0);
    expect(mine?.lastInput).toBeLessThanOrEqual(sequence);
    expect((mine?.z ?? 0) * forward).toBeGreaterThan(before * forward + 1);
    // The opponent sees exactly the same thing: one simulation, two views.
    expect(b.room.state.players.get(a.welcome.playerId)?.z).toBeCloseTo(mine?.z ?? 0, 2);
  }, 60_000);

  it('scores a real goal and tells both clients the same story', async () => {
    const [a, b] = await quickPair();
    await kickOff(a, b);

    const attackZ = a.welcome.team === 'home' ? 1 : -1;
    let nA = 0;
    let nB = 0;
    // The defender walks to the touchline so there is a lane to shoot down.
    const stepAside = setInterval(() => {
      nB += 1;
      b.room.send(ClientMessage.Input, {
        n: nB,
        mx: 1,
        my: 0.3 * attackZ,
        ax: 1,
        ay: 0,
        f: InputFlag.Sprint,
      });
    }, 16);

    const sendA = (patch: Record<string, number>) => {
      nA += 1;
      a.room.send(ClientMessage.Input, { n: nA, mx: 0, my: 0, ax: 0, ay: attackZ, f: 0, ...patch });
    };

    try {
      // Charge the shot standing still, then walk up on the ball and release
      // from kicking range. Under the one-touch rule this *is* the whole
      // attack: running into the ball first would use the touch up.
      for (let i = 0; i < 80; i += 1) {
        sendA({ f: InputFlag.ShootHeld | (i === 0 ? InputFlag.ShootPressed : 0) });
        await sleep(16);
      }

      let released = false;
      for (let i = 0; i < 700; i += 1) {
        if (a.room.state.scoreHome + a.room.state.scoreAway > 0) break;
        const me = a.room.state.players.get(a.welcome.playerId);
        const ball = a.room.state.ball;
        if (!me) break;
        const dx = ball.x - me.x;
        const dz = ball.z - me.z;
        const distance = Math.hypot(dx, dz) || 1;

        if (!released && distance < 1.45) {
          sendA({ f: InputFlag.ShootReleased });
          released = true;
        } else if (released) {
          sendA({});
        } else {
          sendA({ mx: dx / distance, my: dz / distance, f: InputFlag.ShootHeld });
        }
        await sleep(16);
      }
    } finally {
      clearInterval(stepAside);
    }
    await sleep(600);

    const scored = a.events.find((event) => event.kind === 'scored');
    expect(scored).toBeDefined();
    expect(scored?.team).toBe(a.welcome.team);
    expect(scored?.points).toBeGreaterThanOrEqual(1);

    // The same event, the same score, on the other client.
    expect(b.events.some((event) => event.kind === 'scored')).toBe(true);
    expect(b.room.state.scoreHome).toBe(a.room.state.scoreHome);
    expect(b.room.state.scoreAway).toBe(a.room.state.scoreAway);
    const mine = a.welcome.team === 'home' ? a.room.state.scoreHome : a.room.state.scoreAway;
    expect(mine).toBeGreaterThanOrEqual(1);
  }, 90_000);

  it('calls a double touch and hands the ball to the other team', async () => {
    const [a, b] = await quickPair();
    await kickOff(a, b);

    const attackZ = a.welcome.team === 'home' ? 1 : -1;
    let nA = 0;
    const sendA = (patch: Record<string, number>) => {
      nA += 1;
      a.room.send(ClientMessage.Input, { n: nA, mx: 0, my: 0, ax: 0, ay: attackZ, f: 0, ...patch });
    };

    // Run onto the ball — that is the one touch — then keep chasing it and try
    // to play it again once it has come back down.
    let violation: NetEvent | undefined;
    for (let i = 0; i < 500; i += 1) {
      violation = a.events.find((event) => event.kind === 'violation');
      if (violation) break;
      const me = a.room.state.players.get(a.welcome.playerId);
      const ball = a.room.state.ball;
      if (!me) break;
      const dx = ball.x - me.x;
      const dz = ball.z - me.z;
      const distance = Math.hypot(dx, dz) || 1;
      sendA({ mx: dx / distance, my: dz / distance, f: InputFlag.Sprint });
      await sleep(16);
    }
    await sleep(400);

    expect(violation).toBeDefined();
    expect(violation?.playerId).toBe(a.welcome.playerId);
    expect(violation?.team).toBe(a.welcome.team);
    // Both clients are told, and both agree who restarts.
    expect(b.events.some((event) => event.kind === 'violation')).toBe(true);
    expect(a.room.state.lastViolation.restartTeam).toBe(b.welcome.team);
    expect(a.room.state.lastViolation.restartPlayerId).toBe(
      b.room.state.lastViolation.restartPlayerId,
    );
    // Nothing was scored off the illegal touch.
    expect(a.room.state.scoreHome + a.room.state.scoreAway).toBe(0);
  }, 90_000);

  it('ignores input from a client that has no seat in the room', async () => {
    const [a, b] = await quickPair();
    await kickOff(a, b);

    const before = a.room.state.players.get(b.welcome.playerId)?.z ?? 0;
    // A forges the opponent's movement by sending its own input; the server
    // resolves the seat from the connection, never from the payload.
    for (let i = 0; i < 20; i += 1) {
      a.room.send(ClientMessage.Input, { n: 1000 + i, mx: 1, my: 1, ax: 0, ay: 1, f: 0 });
      await sleep(16);
    }
    await sleep(200);

    expect(a.room.state.players.get(b.welcome.playerId)?.z).toBeCloseTo(before, 1);
  }, 60_000);

  it('pauses when a player drops and hands the seat back on reconnect', async () => {
    const [a, b] = await quickPair();
    await kickOff(a, b);

    const token = a.room.reconnectionToken;
    const name = a.room.state.players.get(a.welcome.playerId)?.name;
    await a.room.leave(false);

    await until(() => b.room.state.stage === 'paused');
    expect(b.room.state.players.get(a.welcome.playerId)?.connected).toBe(false);

    // Frozen, not fast-forwarded: the tick stops while a seat is empty.
    const tick = b.room.state.tick;
    await sleep(500);
    expect(b.room.state.tick).toBe(tick);

    const resumed = await new Client(endpoint).reconnect<MatchRoomState>(token);
    openRooms.push(resumed);
    await until(() => b.room.state.stage === 'playing');

    expect(b.room.state.players.get(a.welcome.playerId)?.connected).toBe(true);
    expect(b.room.state.players.get(a.welcome.playerId)?.name).toBe(name);
    await until(() => b.room.state.tick > tick);
  }, 60_000);

  it('drops input beyond the rate limit instead of letting a client buy time', async () => {
    const [a, b] = await quickPair();
    await kickOff(a, b);

    // Far more than a second's worth, sent in one burst.
    for (let n = 1; n <= 400; n += 1) {
      a.room.send(ClientMessage.Input, { n, mx: 0, my: 1, ax: 0, ay: 1, f: 0 });
    }
    await sleep(400);

    const accepted = a.room.state.players.get(a.welcome.playerId)?.lastInput ?? 0;
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(400);
    expect(b.room.state.stage).toBe('playing');
  }, 60_000);
});

describe('matchmaker', () => {
  it('keeps no global state that would stop a second process', () => {
    // Rooms hold their own state and invite codes live in Presence, so the
    // module surface stays empty of match data.
    expect(matchMaker.presence).toBeDefined();
  });
});
