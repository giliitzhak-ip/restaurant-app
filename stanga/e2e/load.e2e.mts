/**
 * How many matches one server process actually carries.
 *
 * Not a benchmark for a press release — a check that the tick holds at 60 per
 * second and that the numbers on the wire are the size they look. Run it
 * against a server started the usual way:
 *
 *   npm run server
 *   npx tsx e2e/load.e2e.mts            # default: 8 matches
 *   ROOMS=20 SECONDS=30 npx tsx e2e/load.e2e.mts
 *
 * Results measured on the development machine are recorded in
 * docs/deployment.md; re-measure on the hardware you actually deploy to.
 */
import { Client, type Room } from 'colyseus.js';
import {
  ClientMessage,
  InputFlag,
  PROTOCOL_VERSION,
  ROOM_ONE_VS_ONE,
  ServerMessage,
  type NetPong,
  type WelcomePayload,
} from '../src/net/protocol';
import type { MatchRoomState } from '../src/net/schema';

const ENDPOINT = process.env.STANGA_SERVER ?? 'http://127.0.0.1:2567';
const ROOMS = Number(process.env.ROOMS ?? 8);
const SECONDS = Number(process.env.SECONDS ?? 20);
const INPUT_HZ = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Player {
  room: Room<MatchRoomState>;
  welcome: WelcomePayload;
  patches: number;
  bytes: number;
  roundTrips: number[];
}

/** Counts what actually arrives on the socket, not what we think we sent. */
function meterSocket(player: Player): void {
  const transport = (
    player.room as unknown as {
      connection?: { transport?: { ws?: { addEventListener?: unknown } } };
    }
  ).connection?.transport;
  const socket = transport?.ws as
    | { addEventListener(type: string, handler: (event: { data: unknown }) => void): void }
    | undefined;
  if (!socket?.addEventListener) return;
  socket.addEventListener('message', (event) => {
    const data = event.data;
    if (data instanceof ArrayBuffer) player.bytes += data.byteLength;
  });
}

async function joinPlayer(name: string, roomId?: string): Promise<Player> {
  const client = new Client(ENDPOINT);
  const options = {
    protocolVersion: PROTOCOL_VERSION,
    intent: roomId === undefined ? 'create' : 'join',
    displayName: name,
  };
  const room =
    roomId === undefined
      ? await client.create<MatchRoomState>(ROOM_ONE_VS_ONE, options)
      : await client.joinById<MatchRoomState>(roomId, options);

  const player: Player = { room, welcome: null as never, patches: 0, bytes: 0, roundTrips: [] };
  player.welcome = await new Promise<WelcomePayload>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no welcome')), 10_000);
    room.onMessage(ServerMessage.Welcome, (payload: WelcomePayload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  room.onMessage(ServerMessage.Event, () => {});
  room.onMessage(ServerMessage.Pong, (pong: NetPong) => {
    player.roundTrips.push(Date.now() - pong.t);
  });
  room.onStateChange(() => {
    player.patches += 1;
  });
  meterSocket(player);
  return player;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

console.log(`${ROOMS} matches, ${SECONDS}s, ${INPUT_HZ} inputs/s per client`);

const players: Player[] = [];
for (let i = 0; i < ROOMS; i += 1) {
  const host = await joinPlayer(`h${i}`);
  const guest = await joinPlayer(`g${i}`, host.room.roomId);
  players.push(host, guest);
}
console.log(`connected ${players.length} clients`);

for (const player of players) player.room.send(ClientMessage.Ready, {});

const deadline = Date.now() + 25_000;
while (Date.now() < deadline) {
  if (players.every((player) => player.room.state.phase === 'playing')) break;
  await sleep(100);
}
if (!players.every((player) => player.room.state.phase === 'playing')) {
  console.error('not every match reached play; the server is already behind');
  process.exit(1);
}

// Reset the counters now that every match is actually simulating.
for (const player of players) {
  player.patches = 0;
  player.bytes = 0;
  player.roundTrips.length = 0;
}
const startTicks = players.map((player) => player.room.state.tick);
const startedAt = Date.now();

let sequence = 0;
const sending = setInterval(() => {
  sequence += 1;
  const angle = sequence * 0.05;
  for (const player of players) {
    player.room.send(ClientMessage.Input, {
      n: sequence,
      mx: Math.sin(angle),
      my: Math.cos(angle),
      ax: Math.sin(angle),
      ay: Math.cos(angle),
      f: InputFlag.Sprint,
    });
  }
}, 1000 / INPUT_HZ);

const pinging = setInterval(() => {
  for (const player of players) player.room.send(ClientMessage.Ping, { t: Date.now() });
}, 1000);

await sleep(SECONDS * 1000);
clearInterval(sending);
clearInterval(pinging);
await sleep(200);

const elapsed = (Date.now() - startedAt) / 1000;
const ticksPerSecond = players.map(
  (player, index) => (player.room.state.tick - (startTicks[index] ?? 0)) / elapsed,
);
const patchesPerSecond = players.map((player) => player.patches / elapsed);
const bytesPerSecond = players.map((player) => player.bytes / elapsed);
const allRoundTrips = players.flatMap((player) => player.roundTrips);
const measuredBytes = bytesPerSecond.some((value) => value > 0);

const average = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);

console.log('');
console.log(`matches                 ${ROOMS}`);
console.log(`clients                 ${players.length}`);
console.log(
  `simulation ticks/s      min ${Math.min(...ticksPerSecond).toFixed(1)}   avg ${average(ticksPerSecond).toFixed(1)}   (target 60)`,
);
console.log(`state patches/s/client  avg ${average(patchesPerSecond).toFixed(1)}   (target 20)`);
if (measuredBytes) {
  console.log(
    `bytes/s/client          avg ${average(bytesPerSecond).toFixed(0)}   ≈ ${(average(bytesPerSecond) / average(patchesPerSecond)).toFixed(0)} bytes per patch`,
  );
} else {
  console.log('bytes/s/client          not measurable through this client build');
}
console.log(
  `round trip ms           p50 ${percentile(allRoundTrips, 0.5)}   p95 ${percentile(allRoundTrips, 0.95)}   max ${Math.max(0, ...allRoundTrips)}`,
);

const healthy = Math.min(...ticksPerSecond) > 55;
console.log('');
console.log(healthy ? 'the server held the tick rate' : 'THE SERVER FELL BEHIND');

for (const player of players) await player.room.leave(true);
process.exit(healthy ? 0 : 1);
