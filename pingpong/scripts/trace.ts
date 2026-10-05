import { AiController, aiProfile } from '../src/shared/ai';
import { GameSim } from '../src/shared/game';
import { Rng } from '../src/shared/rng';
const sim = new GameSim({ profiles: [aiProfile('hard'), aiProfile('hard')], seed: 5 });
const ais = [new AiController(0, 'hard', new Rng(1)), new AiController(1, 'hard', new Rng(2))];
let points = 0;
const f = (n: number) => n.toFixed(2);
for (let i = 0; i < 240 * 40 && points < 4; i++) {
  for (const s of [0, 1] as const) sim.setInput(s, ais[s].update({ phase: sim.phase, servingSide: sim.servingSide(), hitCount: sim.hitCount, lastHitter: sim.rally.lastHitter, intercept: sim.interceptFor(s), ballX: sim.ball.p.x }, 1 / 240));
  sim.step();
  const b = sim.ball.p;
  if (sim.phase === 'rally' && i % 12 === 0) {
    const s = sim.rally.lastHitter === 0 ? 1 : 0; const p = sim.paddles[s].p; const ic = sim.interceptFor(s);
    console.log(`  t=${f(sim.tick/240)} ball(${f(b.x)},${f(b.y)},${f(b.z)}) v(${f(sim.ball.v.x)},${f(sim.ball.v.y)},${f(sim.ball.v.z)}) recv${s} pad(${f(p.x)},${f(p.y)},${f(p.z)}) ic=${ic ? `(${f(ic.x)},${f(ic.y)},${f(ic.z)},t${f(ic.t)})` : 'null'} in=(${f(sim.inputs[s].x)},${f(sim.inputs[s].y)})`);
  }
  for (const e of sim.drainEvents()) { if (e.k !== 'phase') console.log(JSON.stringify(e), `ball(${f(b.x)},${f(b.y)},${f(b.z)})`); if (e.k === 'point' || e.k==='let') points++; }
}
