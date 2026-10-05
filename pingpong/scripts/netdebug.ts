import { startGameServer } from '../src/server/server';
import { BotPlayer, TestClient, sleep } from '../tests/helpers';
const server = await startGameServer({ port: 0, host: '127.0.0.1' });
const url = `ws://127.0.0.1:${server.port}/ws`;
const a = new TestClient(url, { delay: 40, jitter: 15 }), b = new TestClient(url, { delay: 20, jitter: 15 });
await a.open(); await b.open();
a.create('A'); const ja = await a.waitFor('joined'); b.join(ja.code); await b.waitFor('joined');
await a.waitFor('room', (m) => m.players.every(Boolean));
a.send({ t: 'ready', ready: true }); b.send({ t: 'ready', ready: true });
await a.waitFor('start');
const ba = new BotPlayer(a, 0, 'hard', 21), bb = new BotPlayer(b, 1, 'hard', 22);
ba.start(); bb.start();
const room = server.rooms.rooms.get(ja.code)!;
for (let i = 0; i < 20; i++) {
  await sleep(1000);
  const s = room.sim!;
  const ev = ba.events.splice(0).filter(e => e.k !== 'phase').map(e => e.k === 'hit' ? `hit${e.side}` : e.k === 'table' ? `t${e.side}` : e.k === 'point' ? `POINT${e.winner}:${e.reason}` : e.k).join(' ');
  console.log(i, s.phase, s.match.points, 'ball', s.ball.p.x.toFixed(2), s.ball.p.y.toFixed(2), s.ball.p.z.toFixed(2), 'pads', s.paddles.map(p => `${p.p.x.toFixed(2)},${p.p.y.toFixed(2)},${p.p.z.toFixed(2)}`).join(' | '), '|', ev);
}
ba.stop(); bb.stop(); a.close(); b.close(); await server.close();
