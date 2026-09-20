import { describe, expect, it } from 'vitest';
import { ScoringSystem, type ContactInput } from '../src/game/ScoringSystem';
import { GameConfig } from '../src/config/GameConfig';
import type { ShotRecord, TeamId } from '../src/game/MatchState';

function shot(shotId = 'shot-1', playerId = 'home-1', teamId: TeamId = 'home'): ShotRecord {
  return { shotId, playerId, teamId, originatingTick: 50, shotType: 'ground', power: 0.8 };
}

function contact(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    shot: shot(),
    kind: 'goal',
    team: 'home',
    ownGoal: false,
    colliderId: 'away:goalLine',
    ballId: 'ball',
    speed: 12,
    time: 1,
    tick: 60,
    ...overrides,
  };
}

function resolveOne(system: ScoringSystem, atTime: number) {
  const events = system.update(atTime);
  expect(events).toHaveLength(1);
  return events[0]!;
}

const AFTER_WINDOW = 1 + GameConfig.scoring.windowSeconds + 0.01;

describe('ScoringSystem', () => {
  it('awards 1 point for a goal', () => {
    const system = new ScoringSystem();
    expect(system.registerContact(contact({ kind: 'goal' }))).toBe('accepted');
    const event = resolveOne(system, AFTER_WINDOW);
    expect(event.kind).toBe('goal');
    expect(event.points).toBe(1);
    expect(event.team).toBe('home');
  });

  it('awards 2 points for a post', () => {
    const system = new ScoringSystem();
    system.registerContact(contact({ kind: 'post', colliderId: 'away:leftPost' }));
    expect(resolveOne(system, AFTER_WINDOW).points).toBe(2);
  });

  it('awards 3 points for a crossbar', () => {
    const system = new ScoringSystem();
    system.registerContact(contact({ kind: 'crossbar', colliderId: 'away:crossbar' }));
    expect(resolveOne(system, AFTER_WINDOW).points).toBe(3);
  });

  it('awards 5 points for a junction', () => {
    const system = new ScoringSystem();
    system.registerContact(contact({ kind: 'junction', colliderId: 'away:leftJunction' }));
    const event = resolveOne(system, AFTER_WINDOW);
    expect(event.points).toBe(5);
    expect(event.kind).toBe('junction');
  });

  it('never awards the same shotId twice', () => {
    const system = new ScoringSystem();
    system.registerContact(contact({ kind: 'crossbar', colliderId: 'away:crossbar' }));
    expect(resolveOne(system, AFTER_WINDOW).points).toBe(3);
    expect(system.update(AFTER_WINDOW + 1)).toHaveLength(0);

    expect(
      system.registerContact(contact({ kind: 'goal', time: AFTER_WINDOW + 1, colliderId: 'x' })),
    ).toBe('already-awarded');
    expect(system.update(AFTER_WINDOW + 5)).toHaveLength(0);
  });

  it('picks the highest scoring event of one shot regardless of arrival order', () => {
    const system = new ScoringSystem();
    system.registerContact(contact({ kind: 'post', colliderId: 'away:leftPost', time: 1 }));
    system.registerContact(
      contact({ kind: 'junction', colliderId: 'away:leftJunction', time: 1.05 }),
    );
    system.registerContact(contact({ kind: 'crossbar', colliderId: 'away:crossbar', time: 1.1 }));
    system.registerContact(contact({ kind: 'goal', colliderId: 'away:goalLine', time: 1.2 }));

    const event = resolveOne(system, AFTER_WINDOW);
    expect(event.kind).toBe('junction');
    expect(event.points).toBe(5);
  });

  it('keeps the best event when a lower one arrives later', () => {
    const system = new ScoringSystem();
    system.registerContact(contact({ kind: 'crossbar', colliderId: 'away:crossbar', time: 1 }));
    expect(
      system.registerContact(contact({ kind: 'goal', colliderId: 'away:goalLine', time: 1.1 })),
    ).toBe('lower-priority');
    expect(resolveOne(system, AFTER_WINDOW).kind).toBe('crossbar');
  });

  it('rejects contacts that do not belong to a player shot', () => {
    const system = new ScoringSystem();
    expect(system.registerContact(contact({ shot: null }))).toBe('no-shot');
    expect(system.update(AFTER_WINDOW)).toHaveLength(0);
  });

  it('rejects slow, accidental contacts', () => {
    const system = new ScoringSystem();
    const slow = GameConfig.scoring.minContactSpeed - 0.5;
    expect(system.registerContact(contact({ kind: 'post', speed: slow }))).toBe('too-slow');
    expect(system.update(AFTER_WINDOW)).toHaveLength(0);
  });

  it('rejects a frame hit on your own goal', () => {
    const system = new ScoringSystem();
    expect(system.registerContact(contact({ kind: 'post', team: null }))).toBe('no-team');
    expect(system.update(AFTER_WINDOW)).toHaveLength(0);
  });

  it('applies a cooldown per collider and ball', () => {
    const system = new ScoringSystem();
    const first = contact({ kind: 'post', colliderId: 'away:leftPost', time: 1 });
    expect(system.registerContact(first)).toBe('accepted');
    expect(
      system.registerContact(
        contact({
          shot: shot('shot-2'),
          kind: 'junction',
          colliderId: 'away:leftPost',
          time: 1 + GameConfig.scoring.colliderCooldownSeconds / 2,
        }),
      ),
    ).toBe('collider-cooldown');

    expect(
      system.registerContact(
        contact({
          shot: shot('shot-3'),
          kind: 'junction',
          colliderId: 'away:leftPost',
          time: 1 + GameConfig.scoring.colliderCooldownSeconds + 0.01,
        }),
      ),
    ).toBe('accepted');
  });

  it('does not resolve a shot before its window closes', () => {
    const system = new ScoringSystem();
    system.registerContact(contact({ kind: 'post', time: 1 }));
    expect(system.update(1 + GameConfig.scoring.windowSeconds / 2)).toHaveLength(0);
    expect(system.hasPending('shot-1')).toBe(true);
    expect(system.update(AFTER_WINDOW)).toHaveLength(1);
    expect(system.hasAwarded('shot-1')).toBe(true);
  });

  it('resolves several independent shots', () => {
    const system = new ScoringSystem();
    system.registerContact(
      contact({ shot: shot('a'), kind: 'goal', colliderId: 'away:goalLine', time: 1 }),
    );
    system.registerContact(
      contact({
        shot: shot('b'),
        kind: 'junction',
        colliderId: 'home:rightJunction',
        team: 'away',
        time: 1,
      }),
    );
    const events = system.update(AFTER_WINDOW);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.points).sort()).toEqual([1, 5]);
  });

  it('forgets everything on reset', () => {
    const system = new ScoringSystem();
    system.registerContact(contact({ kind: 'post' }));
    system.reset();
    expect(system.hasPending('shot-1')).toBe(false);
    expect(system.update(AFTER_WINDOW)).toHaveLength(0);
    expect(system.registerContact(contact({ kind: 'post', time: 10 }))).toBe('accepted');
  });
});
