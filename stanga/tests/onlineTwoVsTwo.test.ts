/**
 * The 2×2 room, end to end.
 *
 * Same shape as the 1×1 file: a real Colyseus server on a real socket and four
 * real `colyseus.js` clients. It is here to prove the things that only exist
 * once there are four seats — balanced seating, team switching as a request,
 * a fifth player refused, quick chat, and a bot taking a seat over — rather
 * than to re-test what 1×1 already covers.
 */
import { createServer, type Server as HttpServer } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client, type Room } from 'colyseus.js';
import {
  ClientMessage,
  PROTOCOL_VERSION,
  QUICK_CHAT,
  ROOM_TWO_VS_TWO,
  RejectReason,
  ServerMessage,
  type NetChat,
  type NetEvent,
  type WelcomePayload,
} from '../src/net/protocol';
import type { MatchRoomState } from '../src/net/schema';
import { OnlineTwoVsTwoRoom } from '../src/server/OnlineTwoVsTwoRoom';
import { createRequestHandler } from '../src/server/httpRoutes';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  chats: NetChat[];
}

const joinOptions = (name: string, extra: Record<string, unknown> = {}) => ({
  protocolVersion: PROTOCOL_VERSION,
  intent: 'quick',
  displayName: name,
  ...extra,
});

async function connect(join: (client: Client) => Promise<Room<MatchRoomState>>): Promise<Joined> {
  const room = await join(new Client(endpoint));
  openRooms.push(room);
  const events: NetEvent[] = [];
  const chats: NetChat[] = [];
  const welcome = await new Promise<WelcomePayload>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no welcome')), 10_000);
    room.onMessage(ServerMessage.Welcome, (payload: WelcomePayload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  room.onMessage(ServerMessage.Event, (event: NetEvent) => events.push(event));
  room.onMessage(ServerMessage.Chat, (chat: NetChat) => chats.push(chat));
  room.onMessage(ServerMessage.Pong, () => {});
  return { room, welcome, events, chats };
}

/** Four quick-match clients, one after another, into the same room. */
async function quickFour(): Promise<Joined[]> {
  const names = ['גיל', 'דני', 'נועה', 'רון'];
  const joined: Joined[] = [];
  for (const name of names) {
    joined.push(
      await connect((client) =>
        client.joinOrCreate<MatchRoomState>(ROOM_TWO_VS_TWO, joinOptions(name)),
      ),
    );
  }
  const first = joined[0];
  if (!first) throw new Error('nobody joined');
  await until(() => first.room.state.stage === 'teamSelection');
  return joined;
}

async function kickOff(players: Joined[]): Promise<void> {
  for (const player of players) player.room.send(ClientMessage.Ready, {});
  const first = players[0];
  if (!first) throw new Error('nobody to kick off');
  await until(() => first.room.state.stage === 'playing', 20_000);
  await until(() => first.room.state.phase === 'playing', 20_000);
}

beforeAll(async () => {
  httpServer = createServer();
  httpServer.keepAliveTimeout = 0;
  httpServer.on('request', (request, response) => {
    void createRequestHandler({ allowedOrigins: [], inviteLookupsPerMinute: 100 })(
      request,
      response,
    ).catch(() => response.end());
  });
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define(ROOM_TWO_VS_TWO, OnlineTwoVsTwoRoom);
  await gameServer.listen(0);
  const address = httpServer.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  endpoint = `http://127.0.0.1:${port}`;
}, 60_000);

async function closeRooms(): Promise<void> {
  for (const room of openRooms.splice(0)) {
    try {
      await Promise.race([room.leave(true), sleep(500)]);
    } catch {
      // Already gone.
    }
  }
  await sleep(200);
}

afterEach(closeRooms);

afterAll(async () => {
  await closeRooms();
  await gameServer.gracefullyShutdown(false);
});

describe('online 2×2 room', () => {
  it('fills one room with four players, two per side, and refuses a fifth', async () => {
    const players = await quickFour();

    const roomId = players[0]?.room.roomId;
    expect(players.every((player) => player.room.roomId === roomId)).toBe(true);

    const seats = players.map((player) => player.welcome.playerId).sort();
    expect(seats).toEqual(['away-1', 'away-2', 'home-1', 'home-2']);
    expect(players.filter((player) => player.welcome.team === 'home')).toHaveLength(2);
    expect(players.filter((player) => player.welcome.team === 'away')).toHaveLength(2);
    expect(players.every((player) => player.welcome.mode === 'twoVsTwo')).toBe(true);

    const state = players[0]?.room.state;
    expect(state?.playersPerTeam).toBe(2);
    expect(state?.players.size).toBe(4);

    // Seating alternates as people arrive, so a room is never three on one.
    await expect(
      new Client(endpoint).joinById(roomId ?? '', joinOptions('חמישי', { intent: 'join' })),
    ).rejects.toThrow();
  }, 90_000);

  it('treats a team switch as a request the server may refuse', async () => {
    const players = await quickFour();
    const [first] = players;
    if (!first) throw new Error('nobody joined');

    // The team the player is already up against is full, so nothing moves.
    const other = first.welcome.team === 'home' ? 'away' : 'home';
    const seatBefore = first.welcome.playerId;
    first.room.send(ClientMessage.TeamSwitch, { team: other });
    await sleep(400);
    expect(first.room.state.players.get(seatBefore)?.name).toBeTruthy();
    expect(first.room.state.players.get(seatBefore)?.connected).toBe(true);

    // A rubbish payload is dropped rather than throwing the seat away.
    first.room.send(ClientMessage.TeamSwitch, { team: 'referee' });
    await sleep(300);
    expect(first.room.state.players.get(seatBefore)?.connected).toBe(true);

    // With a free seat on the other side the same request is granted.
    const last = players[3];
    if (!last) throw new Error('missing fourth player');
    await last.room.leave(true);
    await until(() => first.room.state.players.get(last.welcome.playerId)?.connected === false);

    first.room.send(ClientMessage.TeamSwitch, { team: last.welcome.team });
    await until(() => first.room.state.players.get(last.welcome.playerId)?.connected === true);
    expect(first.room.state.players.get(seatBefore)?.connected).toBe(false);
  }, 90_000);

  it('runs a four-player match and moves the player who sent the input', async () => {
    const players = await quickFour();
    await kickOff(players);

    const [me] = players;
    if (!me) throw new Error('nobody joined');
    const before = me.room.state.players.get(me.welcome.playerId)?.z ?? 0;
    const forward = me.welcome.team === 'home' ? 1 : -1;
    for (let n = 1; n <= 40; n += 1) {
      me.room.send(ClientMessage.Input, { n, mx: 0, my: forward, ax: 0, ay: forward, f: 0 });
      await sleep(16);
    }
    await sleep(300);

    const after = me.room.state.players.get(me.welcome.playerId)?.z ?? 0;
    expect(Math.abs(after - before)).toBeGreaterThan(0.5);
    // Everybody sees the same pitch, and all four seats are being simulated.
    for (const player of players) {
      expect(player.room.state.tick).toBeGreaterThan(0);
      expect(player.room.state.players.size).toBe(4);
      expect(player.room.state.players.get(me.welcome.playerId)?.z).toBeCloseTo(after, 0);
    }
  }, 120_000);

  it('broadcasts quick chat by id and ignores anything that is not one', async () => {
    const players = await quickFour();
    const [speaker, listener] = players;
    if (!speaker || !listener) throw new Error('nobody joined');

    speaker.room.send(ClientMessage.QuickChat, { id: 'pass' });
    await until(() => listener.chats.length > 0, 5_000);

    const chat = listener.chats[0];
    expect(chat?.id).toBe('pass');
    expect(chat?.playerId).toBe(speaker.welcome.playerId);
    expect(chat?.team).toBe(speaker.welcome.team);
    // The phrase itself never travels: the id is looked up on each client.
    expect(Object.keys(QUICK_CHAT)).toContain(chat?.id);

    const seen = listener.chats.length;
    speaker.room.send(ClientMessage.QuickChat, { id: 'נ  ל א  ח ו ק י' });
    speaker.room.send(ClientMessage.QuickChat, { text: 'שלום' });
    await sleep(500);
    expect(listener.chats.length).toBe(seen);
  }, 90_000);

  it('hands a seat to a bot when somebody leaves for good, and plays on', async () => {
    const players = await quickFour();
    await kickOff(players);

    const leaver = players[3];
    const watcher = players[0];
    if (!leaver || !watcher) throw new Error('nobody joined');

    await leaver.room.leave(true);
    // A consented leave gives the seat up at once; the bot then fills it so
    // three people are not left waiting for a fourth who is not coming back.
    await until(
      () => watcher.room.state.players.get(leaver.welcome.playerId)?.botControlled === true,
      30_000,
    );
    await until(() => watcher.room.state.stage === 'playing', 20_000);

    const tick = watcher.room.state.tick;
    await sleep(600);
    expect(watcher.room.state.tick).toBeGreaterThan(tick);
    expect(watcher.room.state.players.size).toBe(4);
  }, 120_000);

  it('queues a party of two together and lets strangers fill the other seats', async () => {
    const host = await connect((client) =>
      client.create<MatchRoomState>(ROOM_TWO_VS_TWO, joinOptions('מארח', { intent: 'create' })),
    );
    await until(() => host.room.state.inviteCode.length > 0);
    const code = host.room.state.inviteCode;

    const friend = await connect((client) =>
      client.joinById<MatchRoomState>(
        host.room.roomId,
        joinOptions('חבר', { intent: 'join', inviteCode: code }),
      ),
    );

    // The pair put themselves on the same side; that is what makes it a party.
    if (friend.welcome.team !== host.welcome.team) {
      friend.room.send(ClientMessage.TeamSwitch, { team: host.welcome.team });
    }
    await until(
      () =>
        [...host.room.state.players.values()].filter(
          (player) => player.connected && player.team === host.welcome.team,
        ).length === 2,
      10_000,
    );

    // A stranger cannot find the room while it is private.
    const early = await connect((client) =>
      client.joinOrCreate<MatchRoomState>(ROOM_TWO_VS_TWO, joinOptions('זר')),
    );
    expect(early.room.roomId).not.toBe(host.room.roomId);
    await early.room.leave(true);

    // The host asks for opponents; only then does the room join the queue.
    host.room.send(ClientMessage.OpenRoom, {});
    await until(() => host.room.state.isPrivate === false, 10_000);
    expect(host.room.state.inviteCode).toBe('');
    // The code stops resolving, so it is not a back door into a public room.
    expect((await fetch(`${endpoint}/invite/${code}`)).status).toBe(404);

    const opponent = await connect((client) =>
      client.joinOrCreate<MatchRoomState>(ROOM_TWO_VS_TWO, joinOptions('יריב')),
    );
    expect(opponent.room.roomId).toBe(host.room.roomId);
    // Nobody was moved: the pair are still two on the host's side, and the
    // stranger was seated opposite them.
    const onHostTeam = [...host.room.state.players.values()].filter(
      (player) => player.connected && player.team === host.welcome.team,
    );
    expect(onHostTeam).toHaveLength(2);
    expect(onHostTeam.map((player) => player.name).sort()).toEqual(['מארח', 'חבר'].sort());
    expect(opponent.welcome.team).not.toBe(host.welcome.team);
    void friend;
  }, 120_000);

  it('refuses to open a room that is not the host asking, or already full', async () => {
    const players = await quickFour();
    const [host, other] = players;
    if (!host || !other) throw new Error('nobody joined');

    // A full quick-match room is public already and has nothing to open.
    host.room.send(ClientMessage.OpenRoom, {});
    await sleep(400);
    expect(host.room.state.stage).toBe('teamSelection');

    // And once the match is under way, nothing opens at all.
    await kickOff(players);
    other.room.send(ClientMessage.OpenRoom, {});
    await sleep(400);
    expect(host.room.state.stage).toBe('playing');
    expect(host.room.state.players.size).toBe(4);
  }, 120_000);

  it('rejects a client on a different protocol version', async () => {
    await expect(
      new Client(endpoint).joinOrCreate(
        ROOM_TWO_VS_TWO,
        joinOptions('ישן', { protocolVersion: PROTOCOL_VERSION + 1 }),
      ),
    ).rejects.toThrow(RejectReason.ProtocolMismatch);
  }, 30_000);
});
