/**
 * Scoring attribution in a two-human match.
 *
 * With both players human, every point must land on the right player AND the
 * right team, own goals must be worth exactly one goal to the opponent, and
 * rattling your own frame must still be worth nothing.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig, kindForGoalPart, type GoalPart } from '../src/config/GameConfig';
import {
  advancePhases,
  applyScoreEvent,
  resetForKickoff,
  resolveScoringTeam,
  startMatch,
} from '../src/game/MatchRules';
import {
  createMatchState,
  type MatchState,
  type ShotRecord,
  type TeamId,
  type ShotType,
} from '../src/game/MatchState';
import { ScoringSystem } from '../src/game/ScoringSystem';

const STEP = GameConfig.simulation.fixedDeltaSeconds;
const SETTLE = GameConfig.scoring.windowSeconds + STEP * 2;

class TwoPlayerMatch {
  readonly state: MatchState = createMatchState();
  readonly scoring = new ScoringSystem();
  readonly awarded: ReturnType<ScoringSystem['update']> = [];
  time = 0;
  tick = 0;
  shot: ShotRecord | null = null;
  private counter = 0;

  constructor() {
    startMatch(this.state);
    // Both players are people in this mode.
    for (const player of this.state.players) player.isHuman = true;
    this.state.players[0]!.name = 'דנה';
    this.state.players[1]!.name = 'יואב';
    this.run(GameConfig.match.kickoffSeconds + STEP);
  }

  playerOf(team: TeamId): string {
    return team === 'home' ? 'home-1' : 'away-1';
  }

  kick(team: TeamId, shotType: ShotType = 'ground', power = 0.8): ShotRecord {
    this.counter += 1;
    this.shot = {
      shotId: `shot-${this.counter}`,
      playerId: this.playerOf(team),
      teamId: team,
      originatingTick: this.tick,
      shotType,
      power,
    };
    this.state.ball.lastTouchBy = this.shot.playerId;
    this.state.ball.lastTouchTeam = team;
    return this.shot;
  }

  hitFrame(goal: TeamId, part: GoalPart, speed = 14): void {
    const shooter = this.shot?.teamId ?? null;
    this.scoring.registerContact({
      shot: this.shot,
      kind: kindForGoalPart(part),
      team: shooter === null ? null : resolveScoringTeam(goal, shooter, false),
      ownGoal: false,
      colliderId: `${goal}:${part}`,
      ballId: 'ball',
      speed,
      time: this.time,
      tick: this.tick,
    });
  }

  crossLine(goal: TeamId, speed = 6): void {
    this.scoring.registerContact({
      shot: this.shot,
      kind: 'goal',
      team: resolveScoringTeam(goal, goal, true),
      ownGoal: this.shot?.teamId === goal,
      colliderId: `${goal}:goalLine`,
      ballId: 'ball',
      speed,
      time: this.time,
      tick: this.tick,
    });
  }

  run(seconds: number): void {
    const steps = Math.ceil(seconds / STEP);
    for (let i = 0; i < steps; i += 1) {
      this.tick += 1;
      this.time += STEP;
      for (const record of this.scoring.update(this.time)) {
        if (this.state.phase !== 'playing') continue;
        this.awarded.push(record);
        applyScoreEvent(this.state, record);
        this.shot = null;
      }
      const result = advancePhases(this.state, STEP);
      if (result.needsKickoffReset) {
        resetForKickoff(this.state);
        this.scoring.reset();
        this.shot = null;
      }
    }
  }

  get last() {
    return this.awarded.at(-1);
  }
}

describe('points land on the right player', () => {
  it('credits the striker of a crossbar hit', () => {
    const match = new TwoPlayerMatch();
    match.kick('home');
    match.hitFrame('away', 'crossbar');
    match.run(SETTLE);

    expect(match.last).toMatchObject({
      kind: 'crossbar',
      points: 3,
      team: 'home',
      playerId: 'home-1',
      ownGoal: false,
    });
    expect(match.state.score.home).toBe(3);
    expect(match.state.score.away).toBe(0);
  });

  it('credits the other player when they score', () => {
    const match = new TwoPlayerMatch();
    match.kick('away');
    match.hitFrame('home', 'leftJunction');
    match.run(SETTLE);

    expect(match.last).toMatchObject({ points: 5, team: 'away', playerId: 'away-1' });
    expect(match.state.score.away).toBe(5);
    expect(match.state.score.home).toBe(0);
  });

  it('carries the shot type and power through to the award', () => {
    const match = new TwoPlayerMatch();
    match.kick('home', 'lofted', 0.42);
    match.crossLine('away');
    match.run(SETTLE);

    expect(match.last?.shotType).toBe('lofted');
    expect(match.last?.power).toBeCloseTo(0.42);
  });

  it('keeps each player on their own running total', () => {
    const match = new TwoPlayerMatch();
    const settleAndKickoff =
      SETTLE + GameConfig.match.celebrationSeconds + GameConfig.match.kickoffSeconds + STEP * 4;

    match.kick('home');
    match.hitFrame('away', 'leftPost');
    match.run(settleAndKickoff);

    match.kick('away');
    match.hitFrame('home', 'crossbar');
    match.run(settleAndKickoff);

    match.kick('home');
    match.crossLine('away');
    match.run(SETTLE);

    expect(match.state.score.home).toBe(3); // post 2 + goal 1
    expect(match.state.score.away).toBe(3); // crossbar 3
    expect(match.awarded.map((event) => event.playerId)).toEqual(['home-1', 'away-1', 'home-1']);
  });
});

describe('own goals and own frames', () => {
  it('gives nothing for hitting your own frame', () => {
    const match = new TwoPlayerMatch();
    match.kick('home');
    match.hitFrame('home', 'crossbar');
    match.run(SETTLE);

    expect(match.state.score.home).toBe(0);
    expect(match.state.score.away).toBe(0);
    expect(match.awarded).toHaveLength(0);
  });

  it('gives the opponent exactly one goal for an own goal', () => {
    const match = new TwoPlayerMatch();
    match.kick('home');
    match.crossLine('home');
    match.run(SETTLE);

    expect(match.last).toMatchObject({ kind: 'goal', points: 1, team: 'away', ownGoal: true });
    expect(match.state.score.away).toBe(1);
    expect(match.state.score.home).toBe(0);
  });

  it('credits an own goal to no player, only to the team', () => {
    const match = new TwoPlayerMatch();
    match.kick('away');
    match.crossLine('away');
    match.run(SETTLE);

    expect(match.last?.ownGoal).toBe(true);
    expect(match.last?.playerId).toBeNull();
    expect(match.last?.team).toBe('home');
  });

  it('never turns an own goal into more than one point, even off your own bar', () => {
    const match = new TwoPlayerMatch();
    match.kick('home');
    // Off your own crossbar (worth nothing) and in: still a single goal.
    match.hitFrame('home', 'crossbar');
    match.run(STEP * 3);
    match.crossLine('home');
    match.run(SETTLE);

    expect(match.state.score.away).toBe(1);
    expect(match.state.score.home).toBe(0);
  });
});

describe('reset after a score puts each player back on their own side', () => {
  it('sends each player to the half they defend', () => {
    const match = new TwoPlayerMatch();
    match.state.players[0]!.position = { x: 6, y: 0, z: 15 };
    match.state.players[1]!.position = { x: -4, y: 0, z: -14 };

    match.kick('home');
    match.hitFrame('away', 'rightPost');
    match.run(SETTLE + GameConfig.match.celebrationSeconds + STEP * 4);

    const home = match.state.players[0]!;
    const away = match.state.players[1]!;
    // Home defends -Z, away defends +Z.
    expect(home.position.z).toBeLessThan(0);
    expect(away.position.z).toBeGreaterThan(0);
    expect(home.position.x).toBe(0);
    expect(away.position.x).toBe(0);
    expect(match.state.ball.position).toEqual({ x: 0, y: GameConfig.ball.radius, z: 0 });
  });

  it('gives the kickoff to the team that conceded', () => {
    const match = new TwoPlayerMatch();
    match.kick('away');
    match.hitFrame('home', 'crossbar');
    match.run(SETTLE);
    expect(match.state.kickoffTeam).toBe('home');
  });

  it('still refuses a second award for the same shot', () => {
    const match = new TwoPlayerMatch();
    match.kick('home');
    match.hitFrame('away', 'leftPost');
    match.hitFrame('away', 'crossbar');
    match.crossLine('away');
    match.run(SETTLE * 3);

    expect(match.awarded).toHaveLength(1);
    expect(match.state.score.home).toBe(3);
  });
});
