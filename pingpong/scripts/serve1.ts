import { serveOutcome, solveToTarget } from '../src/shared/shot';
const bp = { x: -0.12, y: 1.03, z: 1.49 };
for (const top of [-90, 0]) for (const d of [0.45, 0.6, 0.75, 0.9, 1.05]) for (const h of [4.5, 3.8, 3.2, 2.7]) {
  const c = solveToTarget(bp, -0.1, d, h, top, 0, false);
  const o = serveOutcome(bp, c.v, c.w, 0);
  console.log(top, d, h, 'solveOk', c.ok, c.err.toFixed(3), 'v', c.v.y.toFixed(2), JSON.stringify({ legal: o.legal, net: o.net, cl: o.clearance.toFixed(3), z: o.z.toFixed(2) }));
}
