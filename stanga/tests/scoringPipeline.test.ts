/**
 * End-to-end test of the scoring pipeline, exercised exactly the way
 * MatchEngine drives it: physical contacts in, one scoring event out,
 * score applied, pitch reset.
 */
import { describe, expect, it } from 'vitest';
import { GameConfig, kindForGoalPart, type GoalPart } from '../src/config/GameConfig';
import {
  advancePhases,
  applyScoreEvent,
  goalEntered,
  resetForKickoff,
  resolveScoringTeam,
  startMatch,
} from '../src/game/MatchRules';
import {
  createMatchState,
  type MatchState,
  type ShotRecord,
  type TeamId,
} from '../src/game/MatchState';
import { ScoringSystem } from '../src/game/ScoringSystem';

const STEP = GameConfig.simulation.fixedDeltaSeconds;

/** Mirrors MatchEngine: contacts are registered, then resolved once per tick. */
class Pipeline {
  readonly state: MatchState = createMatchState();
  readonly scoring = new ScoringSystem();
  time = 0;
  tick = 0;
  shot: ShotRecord | null = null;
  private shotCounter = 0;

  constructor() {
    startMatch(this.state);
    // Run out the kickoff countdown so the ball is live.
    this.run(GameConfig.match.kickoffSeconds + STEP);
    expect(this.state.phase).toBe('playing');
  }

  kick(team: TeamId, shotType: 'flat' | 'lob' = 'flat', power = 0.8): ShotRecord {
    this.shotCounter += 1;
    this.shot = {
      shotId: `shot-${this.shotCounter}`,
      playerId: `${team}-1`,
      teamId: team,
      originatingTick: this.tick,
      shotType,
      power,
    };
    this.state.ball.lastTouchBy = `${team}-1`;
    this.state.ball.lastTouchTeam = team;
    return this.shot;
  }

  hitFrame(goal: TeamId, part: GoalPart, shooter: TeamId, speed = 14): void {
    this.scoring.registerContact({
      shot: this.shot,
      kind: kindForGoalPart(part),
      team: resolveScoringTeam(goal, shooter, false),
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
      // An own goal is a shot that ends in the striker's own net.
      ownGoal: this.shot?.teamId === goal,
      colliderId: `${goal}:goalLine`,
      ballId: 'ball',
      speed,
      time: this.time,
      tick: this.tick,
    });
  }

  /** Advances simulated time, resolving scoring and phases like the engine does. */
  run(seconds: number): void {
    const steps = Math.ceil(seconds / STEP);
    for (let i = 0; i < steps; i += 1) {
      this.tick += 1;
      this.time += STEP;
      for (const record of this.scoring.update(this.time)) {
        if (this.state.phase !== 'playing') continue;
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
}

const SETTLE = GameConfig.scoring.windowSeconds + STEP * 2;

describe('scoring pipeline', () => {
  it('turns a crossbar contact into 3 points and a celebration', () => {
    const pipeline = new Pipeline();
    pipeline.kick('home');
    pipeline.hitFrame('away', 'crossbar', 'home');
    pipeline.run(SETTLE);

    expect(pipeline.state.score.home).toBe(3);
    expect(pipeline.state.lastEvent?.kind).toBe('crossbar');
    expect(pipeline.state.phase).toBe('celebration');
  });

  it('awards 5 for a junction even when a post is hit in the same shot', () => {
    const pipeline = new Pipeline();
    pipeline.kick('home');
    pipeline.hitFrame('away', 'leftPost', 'home');
    pipeline.run(STEP * 3);
    pipeline.hitFrame('away', 'rightJunction', 'home');
    pipeline.run(SETTLE);

    expect(pipeline.state.score.home).toBe(5);
    expect(pipeline.state.lastEvent?.kind).toBe('junction');
  });

  it('prefers the crossbar over the goal that follows it', () => {
    const pipeline = new Pipeline();
    pipeline.kick('home');
    pipeline.hitFrame('away', 'crossbar', 'home');
    pipeline.run(STEP * 4);
    pipeline.crossLine('away');
    pipeline.run(SETTLE);

    expect(pipeline.state.score.home).toBe(3);
    expect(pipeline.state.score.away).toBe(0);
  });

  it('scores a plain goal for the attacking team', () => {
    const pipeline = new Pipeline();
    pipeline.kick('away');
    pipeline.crossLine('home');
    pipeline.run(SETTLE);

    expect(pipeline.state.score.away).toBe(1);
    expect(pipeline.state.lastEvent?.kind).toBe('goal');
  });

  it('gives nothing for rattling your own frame', () => {
    const pipeline = new Pipeline();
    pipeline.kick('home');
    pipeline.hitFrame('home', 'crossbar', 'home');
    pipeline.run(SETTLE);

    expect(pipeline.state.score.home).toBe(0);
    expect(pipeline.state.score.away).toBe(0);
    expect(pipeline.state.phase).toBe('playing');
  });

  it('resets ball and players after a scoring event, then plays on', () => {
    const pipeline = new Pipeline();
    pipeline.state.ball.position = { x: 4, y: 1.2, z: 16 };
    pipeline.state.players[0]!.position = { x: 5, y: 0, z: 14 };

    pipeline.kick('home');
    pipeline.hitFrame('away', 'leftJunction', 'home');
    pipeline.run(SETTLE);
    expect(pipeline.state.phase).toBe('celebration');

    pipeline.run(GameConfig.match.celebrationSeconds + STEP * 2);
    expect(pipeline.state.phase).toBe('kickoff');
    expect(pipeline.state.ball.position).toEqual({ x: 0, y: GameConfig.ball.radius, z: 0 });
    expect(pipeline.state.players[0]!.position.x).toBe(0);
    expect(pipeline.state.players[0]!.position.z).toBeLessThan(0);
    expect(pipeline.state.kickoffTeam).toBe('away');

    pipeline.run(GameConfig.match.kickoffSeconds + STEP);
    expect(pipeline.state.phase).toBe('playing');
  });

  it('never double-scores a shot that rattles around the frame', () => {
    const pipeline = new Pipeline();
    pipeline.kick('home');
    pipeline.hitFrame('away', 'leftPost', 'home');
    pipeline.hitFrame('away', 'crossbar', 'home');
    pipeline.hitFrame('away', 'rightPost', 'home');
    pipeline.crossLine('away');
    pipeline.run(SETTLE * 3);

    expect(pipeline.state.score.home).toBe(3);
  });

  it('scores two separate shots independently', () => {
    const pipeline = new Pipeline();
    pipeline.kick('home');
    pipeline.hitFrame('away', 'leftPost', 'home');
    pipeline.run(
      SETTLE + GameConfig.match.celebrationSeconds + GameConfig.match.kickoffSeconds + STEP * 4,
    );
    expect(pipeline.state.score.home).toBe(2);
    expect(pipeline.state.phase).toBe('playing');

    pipeline.kick('home');
    pipeline.hitFrame('away', 'crossbar', 'home');
    pipeline.run(SETTLE);
    expect(pipeline.state.score.home).toBe(5);
  });

  it('ignores a slow bump into the post', () => {
    const pipeline = new Pipeline();
    pipeline.kick('home');
    pipeline.hitFrame('away', 'leftPost', 'home', GameConfig.scoring.minContactSpeed - 1);
    pipeline.run(SETTLE);
    expect(pipeline.state.score.home).toBe(0);
  });

  it('ignores frame contacts with no shot behind them', () => {
    const pipeline = new Pipeline();
    pipeline.shot = null;
    pipeline.hitFrame('away', 'crossbar', 'home');
    pipeline.run(SETTLE);
    expect(pipeline.state.score.home).toBe(0);
  });
});

describe('goal geometry matches the configured frame', () => {
  const half = GameConfig.field.length / 2;

  it('maps every frame part to the right scoring kind', () => {
    const mapping: Record<GoalPart, string> = {
      leftPost: 'post',
      rightPost: 'post',
      crossbar: 'crossbar',
      leftJunction: 'junction',
      rightJunction: 'junction',
    };
    for (const [part, kind] of Object.entries(mapping)) {
      expect(kindForGoalPart(part as GoalPart)).toBe(kind);
    }
  });

  it('accepts a ball just inside the posts and under the bar', () => {
    const insideX = GameConfig.goal.width / 2 - 0.1;
    const underBar = GameConfig.goal.height - 0.1;
    expect(goalEntered({ x: insideX, y: underBar, z: half + 0.3 })).toBe('away');
    expect(goalEntered({ x: -insideX, y: 0.2, z: -half - 0.3 })).toBe('home');
  });

  it('rejects a ball just outside the frame', () => {
    const outsideX = GameConfig.goal.width / 2 + 0.1;
    expect(goalEntered({ x: outsideX, y: 0.5, z: half + 0.3 })).toBeNull();
    expect(goalEntered({ x: 0, y: GameConfig.goal.height + 0.1, z: half + 0.3 })).toBeNull();
  });
});
