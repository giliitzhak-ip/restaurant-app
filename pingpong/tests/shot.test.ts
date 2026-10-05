import { describe, expect, it } from 'vitest';
import { TABLE } from '../src/shared/constants';
import { type AssistProfile, PROFILES, newPaddle } from '../src/shared/paddle';
import { Rng } from '../src/shared/rng';
import { computeServe, computeShot, inTargetZone, landingOf, serveOutcome, solveToTarget } from '../src/shared/shot';
import { v3 } from '../src/shared/vec';

const incoming = (y = 1.0) => ({ p: v3(0, y, -1.65), v: v3(0, -1.2, -2.6), w: v3() });
const input = (o: Partial<{ tilt: number; spin: number; power: boolean }> = {}) => ({ x: 0, y: 1, tilt: 0, spin: 0, power: false, act: 0, ...o });

function shot(side: 0 | 1, o: Parameters<typeof input>[0], profile: AssistProfile = PROFILES.advanced, y = 1.0) {
  const pad = newPaddle(side);
  pad.p = v3(0, y, side === 1 ? -1.67 : 1.67);
  pad.tilt = o?.tilt ?? 0;
  const b = side === 1 ? incoming(y) : { p: v3(0, y, 1.65), v: v3(0, -1.2, 2.6), w: v3() };
  const s = computeShot(b, side, pad, input(o), profile, null);
  return { s, land: landingOf(b.p, s.v, s.w) };
}

describe('stroke model', () => {
  it('solver lands where asked under drag + Magnus', () => {
    for (const top of [-150, 0, 200]) {
      const r = solveToTarget(v3(0.2, 1.0, -1.6), -0.3, 0.9, 7, top, 0, true);
      const l = landingOf(v3(0.2, 1.0, -1.6), r.v, r.w);
      expect(r.ok).toBe(true);
      expect(Math.hypot(l.x + 0.3, l.z - 0.9)).toBeLessThan(0.06);
      expect(l.hitNet).toBe(false);
    }
  });

  it('a neutral stroke lands on the opponent half for both sides', () => {
    for (const side of [0, 1] as const) {
      const { land } = shot(side, {});
      expect(land.onTable).toBe(true);
      expect(inTargetZone(side, land.x, land.z)).toBe(true);
    }
  });

  it('opening the paddle face sends the ball higher and longer; closing it lower', () => {
    const open = shot(1, { tilt: 0.6 });
    const flat = shot(1, { tilt: 0 });
    const closed = shot(1, { tilt: -0.6 });
    expect(open.s.v.y).toBeGreaterThan(flat.s.v.y);
    expect(flat.s.v.y).toBeGreaterThan(closed.s.v.y);
    expect(open.land.z).toBeGreaterThan(flat.land.z);
  });

  it('without assist an extreme face angle misses; arcade assist rescues it', () => {
    const wild = shot(1, { tilt: 1, power: true }, { ...PROFILES.advanced, shot: 0 });
    expect(inTargetZone(1, wild.land.x, wild.land.z) && wild.land.onTable).toBe(false);
    const helped = shot(1, { tilt: 0.45 }, PROFILES.arcade);
    expect(helped.land.onTable && inTargetZone(1, helped.land.x, helped.land.z)).toBe(true);
  });

  it('topspin and backspin produce the right spin and power adds pace', () => {
    const top = shot(1, { spin: 1 });
    const back = shot(1, { spin: -1 });
    const pow = shot(1, { power: true });
    const flat = shot(1, {});
    // For a ball travelling +z, topspin is positive spin about +x.
    expect(top.s.w.x).toBeGreaterThan(50);
    expect(back.s.w.x).toBeLessThan(-50);
    expect(Math.hypot(pow.s.v.x, pow.s.v.y, pow.s.v.z)).toBeGreaterThan(Math.hypot(flat.s.v.x, flat.s.v.y, flat.s.v.z) + 1.5);
  });

  it('lateral swing angles the ball', () => {
    const pad = newPaddle(1);
    pad.p = v3(0, 1, -1.67);
    pad.v = v3(3, 0, 0);
    const s = computeShot(incoming(), 1, pad, input(), PROFILES.advanced, null);
    expect(s.v.x).toBeGreaterThan(0.3);
  });

  it('assisted serves are legal from anywhere along the end line', () => {
    const rng = new Rng(9);
    for (let i = 0; i < 40; i++) {
      const pad = newPaddle(0);
      pad.p.x = rng.range(-0.6, 0.6);
      pad.tilt = rng.range(-1, 1);
      const bp = v3(pad.p.x + 0.03, TABLE.height + 0.34 + rng.range(-0.035, 0.035), pad.p.z - 0.13);
      const s = computeServe(bp, 0, pad, input({ tilt: pad.tilt, spin: [-1, 0, 1][i % 3], power: i % 4 === 0 }), PROFILES.arcade, rng);
      expect(serveOutcome(bp, s.v, s.w, 0).legal).toBe(true);
    }
  });
});
