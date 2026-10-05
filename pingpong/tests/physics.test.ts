import { describe, expect, it } from 'vitest';
import { BALL, NET, PHYS, SIM, TABLE } from '../src/shared/constants';
import { type BallState, type PhysEvent, acceleration, simulate, sweepPaddle } from '../src/shared/physics';
import { spinVector } from '../src/shared/shot';
import { v3 } from '../src/shared/vec';

const ball = (p: [number, number, number], v: [number, number, number], w: [number, number, number] = [0, 0, 0]): BallState => ({
  p: v3(...p),
  v: v3(...v),
  w: v3(...w),
});

function run(b: BallState, seconds: number, dt = SIM.dt) {
  const events: PhysEvent[] = [];
  const minY = { v: Infinity };
  simulate(
    b,
    seconds,
    (s, _t, evs) => {
      events.push(...evs);
      minY.v = Math.min(minY.v, s.p.y);
      return false;
    },
    dt,
  );
  return { events, minY: minY.v };
}

describe('physics', () => {
  it('gravity, drag and Magnus point the right way', () => {
    const a = acceleration(v3(0, 0, -10), v3());
    expect(a.y).toBeCloseTo(-PHYS.gravity, 5);
    expect(a.z).toBeGreaterThan(0); // drag opposes motion
    const v = v3(0, 0, -8);
    const top = acceleration(v, spinVector(v, 150, 0));
    const back = acceleration(v, spinVector(v, -150, 0));
    expect(top.y).toBeLessThan(-PHYS.gravity - 2); // topspin dives
    expect(back.y).toBeGreaterThan(-PHYS.gravity + 2); // backspin floats
  });

  it('bounces on the table with the configured restitution', () => {
    const b = ball([0, TABLE.height + 0.3, 0.6], [0, 0, 0]);
    let vyBefore = 0;
    let vyAfter = 0;
    simulate(b, 1, (s, _t, evs) => {
      if (evs.some((e) => e.type === 'table') && !vyAfter) vyAfter = s.v.y;
      if (!vyAfter) vyBefore = s.v.y;
      return vyAfter !== 0;
    });
    expect(vyAfter / -vyBefore).toBeGreaterThan(PHYS.tableRestitution - 0.05);
    expect(vyAfter / -vyBefore).toBeLessThan(PHYS.tableRestitution + 0.03);
  });

  it('topspin kicks forward off the table, backspin checks up', () => {
    const fwd = (top: number) => {
      const v = v3(0, -3, -6);
      const b: BallState = { p: v3(0, TABLE.height + 0.05, -0.5), v, w: spinVector(v, top, 0) };
      let vz = 0;
      simulate(b, 0.5, (s, _t, evs) => {
        if (evs.some((e) => e.type === 'table')) {
          vz = s.v.z;
          return true;
        }
        return false;
      });
      return -vz;
    };
    // Topspin reduces the slip at contact so it keeps (even gains) pace; backspin slides and checks.
    expect(fwd(300)).toBeGreaterThan(fwd(0));
    expect(fwd(300)).toBeGreaterThan(fwd(-300) + 0.5);
  });

  it.each([10, 25, 40])('a %i m/s smash cannot tunnel through the table', (speed) => {
    // Steep downward shot aimed at the table: must register a table bounce and never go below it.
    const b = ball([0, TABLE.height + 0.6, 1.0], [0, -speed * 0.7, -speed * 0.7]);
    const { events } = run(b, 0.25);
    expect(events[0]?.type).toBe('table');
    let below = false;
    simulate(b, 0.08, (s) => {
      if (Math.abs(s.p.x) < TABLE.halfW && Math.abs(s.p.z) < TABLE.halfL && s.p.y < TABLE.height) below = true;
      return false;
    });
    expect(below).toBe(false);
  });

  it.each([10, 25, 40])('a %i m/s ball into the net is stopped, even with a huge time step', (speed) => {
    const b = ball([0, NET.top - 0.06, 1.0], [0, 0, -speed]);
    // Use a time step much larger than the net thickness would allow without sweeping.
    const { events } = run(b, 0.3, 1 / 60);
    const net = events.find((e) => e.type === 'net');
    expect(net).toBeDefined();
    expect((net as { cord: boolean }).cord).toBe(false);
    let crossed = false;
    simulate(b, 0.3, (s) => {
      if (s.p.z < -0.05 && s.p.y > TABLE.height) crossed = true;
      return false;
    }, 1 / 60);
    expect(crossed).toBe(false);
  });

  it('a ball skimming the tape is a net-cord and continues', () => {
    const b = ball([0, NET.top + BALL.radius * 0.5, 0.08], [0, 0, -4]);
    const { events } = run(b, 0.3);
    expect(events.find((e) => e.type === 'net')).toMatchObject({ cord: true });
  });

  it('never tunnels through the floor at high speed', () => {
    const b = ball([3, 2, 3], [0, -40, 0]);
    const { minY, events } = run(b, 0.2, 1 / 30);
    expect(events.some((e) => e.type === 'floor')).toBe(true);
    expect(minY).toBeGreaterThanOrEqual(BALL.radius - 1e-6);
  });

  it('swept paddle contact catches a 40 m/s ball that passes between samples', () => {
    const pad = v3(0, 1, 1.67);
    // Over one 1/240 s step a 40 m/s ball moves ~17 cm: it starts in front and ends behind.
    const t = sweepPaddle(v3(0.02, 1, 1.55), v3(0.02, 1, 1.72), pad, pad, 0, 0.1);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0);
    expect(t!).toBeLessThan(1);
    // Out of reach laterally: no contact.
    expect(sweepPaddle(v3(0.4, 1, 1.55), v3(0.4, 1, 1.72), pad, pad, 0, 0.1)).toBeNull();
    // Ball moving away from the face: no contact.
    expect(sweepPaddle(v3(0, 1, 1.66), v3(0, 1, 1.5), pad, pad, 0, 0.1)).toBeNull();
    // Paddle moving fast into a slow ball also counts (relative motion).
    expect(sweepPaddle(v3(0, 1, 1.5), v3(0, 1, 1.49), v3(0, 1, 1.6), v3(0, 1, 1.45), 0, 0.1)).not.toBeNull();
  });

  it('a ball left alone comes to rest without exploding', () => {
    const b = ball([0.3, TABLE.height + 0.4, 0.4], [0.5, 0, 0.3]);
    const end = simulate(b, 12, () => false);
    expect(Number.isFinite(end.p.x) && Number.isFinite(end.p.y)).toBe(true);
    expect(end.p.y).toBeGreaterThanOrEqual(BALL.radius - 1e-6);
  });
});
