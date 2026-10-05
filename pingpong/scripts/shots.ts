import { computeShot, computeServe, landingOf, serveOutcome } from '../src/shared/shot';
import { PROFILES, newPaddle } from '../src/shared/paddle';
const none = { ...PROFILES.advanced, shot: 0, serve: 0 };
const f = (n: number) => n.toFixed(2);
for (const y of [0.85, 1.0, 1.2]) for (const spin of [-1, 0, 1]) for (const tilt of [-0.5, 0, 0.5]) for (const power of [false, true]) {
  const ball = { p: { x: 0, y, z: -1.65 }, v: { x: 0, y: -1.2, z: -2.4 }, w: { x: 0, y: 0, z: 0 } };
  const pad = newPaddle(1); pad.p = { x: 0, y, z: -1.67 }; pad.tilt = tilt; pad.v = { x: 0, y: 0, z: 0 };
  const s = computeShot(ball, 1, pad, { x: 0, y, tilt, spin, power, act: 0 }, none, null);
  const l = landingOf(ball.p, s.v, s.w);
  console.log(`y=${y} spin=${spin} tilt=${tilt} pow=${power} v=(${f(s.v.x)},${f(s.v.y)},${f(s.v.z)}) land z=${f(l.z)} onTable=${l.onTable} net=${l.hitNet} clear=${f(l.netClear)}`);
}
for (const tilt of [-1, 0, 1]) for (const spin of [-1, 0, 1]) for (const power of [false, true]) {
  const pad = newPaddle(0); pad.tilt = tilt;
  const bp = { x: 0, y: 1.06, z: 1.49 };
  for (const prof of [none, PROFILES.arcade, PROFILES.advanced]) {
    const s = computeServe(bp, 0, pad, { x: 0, y: 1, tilt, spin, power, act: 0 }, prof, null);
    const o = serveOutcome(bp, s.v, s.w, 0);
    process.stdout.write(`serve t${tilt} s${spin} p${+power} assist${prof.serve}: legal=${o.legal} z2=${f(o.z)} net=${o.net} | `);
  }
  console.log();
}
