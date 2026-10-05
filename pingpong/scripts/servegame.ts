import { serveOutcome } from '../src/shared/shot';
import { AiController, aiProfile } from '../src/shared/ai';
import { GameSim } from '../src/shared/game';
import { Rng } from '../src/shared/rng';
const sim = new GameSim({ profiles: [aiProfile('hard'), aiProfile('hard')], seed: 3 });
const ais = [new AiController(0, 'hard', new Rng(4)), new AiController(1, 'hard', new Rng(5))];
let n = 0; let lastServe = '';
for (let i = 0; i < 240 * 600 && n < 30; i++) {
  for (const s of [0, 1] as const) sim.setInput(s, ais[s].update({ phase: sim.phase, servingSide: sim.servingSide(), hitCount: sim.hitCount, lastHitter: sim.rally.lastHitter, intercept: sim.interceptFor(s), ballX: sim.ball.p.x }, 1 / 240));
  const wasServe = sim.phase === 'serve';
  const s = sim.servingSide(); const pv = { ...sim.paddles[s].v }; const pp = { ...sim.paddles[s].p }; const bp = { ...sim.ball.p };
  sim.step();
  if (wasServe && sim.phase === "rally") { const o = serveOutcome(sim.ball.p, sim.ball.v, sim.ball.w, s); console.log("serve predicted", JSON.stringify(o), "input", JSON.stringify(sim.inputs[s])); }
  if (wasServe && sim.phase === "rally") lastServe = `side${s} pad v=(${pv.x.toFixed(2)},${pv.y.toFixed(2)},${pv.z.toFixed(2)}) p=(${pp.x.toFixed(2)},${pp.y.toFixed(2)},${pp.z.toFixed(2)}) ball=(${bp.x.toFixed(2)},${bp.y.toFixed(2)},${bp.z.toFixed(2)}) v=${JSON.stringify(sim.ball.v)}`;
  for (const e of sim.drainEvents()) { if (e.k === 'let' || (e.k === 'point' && e.reason.startsWith('serve'))) { console.log(e.k, (e as any).reason ?? '', lastServe); } if (e.k === 'point' || e.k === 'let') n++; }
}
