import { AiController, aiProfile, type Difficulty } from '../src/shared/ai';
import { GameSim } from '../src/shared/game';
import { Rng } from '../src/shared/rng';

const d0 = (process.argv[2] ?? 'medium') as Difficulty;
const d1 = (process.argv[3] ?? 'medium') as Difficulty;
const seed = Number(process.argv[4] ?? 7);
const sim = new GameSim({ profiles: [aiProfile(d0), aiProfile(d1)], seed, bestOf: 1 });
const ais = [new AiController(0, d0, new Rng(seed + 1)), new AiController(1, d1, new Rng(seed + 2))];
const reasons: Record<string, number> = {};
let hits = 0, rallies = 0, maxRally = 0, cur = 0;
const t0 = performance.now();
for (let i = 0; i < 240 * 60 * 20 && sim.phase !== 'matchOver'; i++) {
  for (const s of [0, 1] as const) {
    sim.setInput(s, ais[s].update({ phase: sim.phase, servingSide: sim.servingSide(), hitCount: sim.hitCount, lastHitter: sim.rally.lastHitter, intercept: sim.interceptFor(s), ballX: sim.ball.p.x }, 1 / 240));
  }
  sim.step();
  for (const e of sim.drainEvents()) {
    if (e.k === 'hit') { hits++; cur++; }
    if (e.k === 'point') { reasons[e.reason] = (reasons[e.reason] ?? 0) + 1; rallies++; maxRally = Math.max(maxRally, cur); cur = 0; }
    if (e.k === 'let') reasons.let = (reasons.let ?? 0) + 1;
  }
}
console.log({ phase: sim.phase, points: sim.match.points, games: sim.match.games, winner: sim.match.winner, simSeconds: sim.tick / 240, hits, rallies, avgHits: (hits / rallies).toFixed(2), maxRally, reasons, ms: Math.round(performance.now() - t0) });
