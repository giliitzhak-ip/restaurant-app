import { computeServe, serveOutcome } from '../src/shared/shot';
import { PROFILES, newPaddle } from '../src/shared/paddle';
import { aiProfile } from '../src/shared/ai';
import { Rng } from '../src/shared/rng';
const rng = new Rng(3);
for (const [name, prof] of [['ai-hard', aiProfile('hard')], ['arcade', PROFILES.arcade], ['advanced', PROFILES.advanced]] as const) {
  const stats: Record<string, number> = {};
  let ms = 0;
  for (let i = 0; i < 200; i++) {
    const pad = newPaddle(0); pad.p.x = rng.range(-0.6, 0.6); pad.tilt = rng.range(-1, 1); pad.v = { x: rng.range(-1, 1), y: rng.range(-1, 1), z: 0 };
    const bp = { x: pad.p.x + 0.03, y: 1.06 + rng.range(-0.035, 0.035), z: pad.p.z - 0.13 };
    const spin = [-1, 0, 1][i % 3]; const power = rng.chance(0.3);
    const t0 = performance.now();
    const s = computeServe(bp, 0, pad, { x: pad.p.x, y: 1, tilt: pad.tilt, spin, power, act: 0 }, prof, rng);
    ms += performance.now() - t0;
    const o = serveOutcome(bp, s.v, s.w, 0);
    const k = o.legal ? 'legal' : o.net ? 'net' : 'fault';
    stats[k] = (stats[k] ?? 0) + 1;
  }
  console.log(name, stats, 'avg ms', (ms / 200).toFixed(1));
}
