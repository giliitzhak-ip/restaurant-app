import { describe, expect, it } from 'vitest';
import { GameConfig } from '../src/config/GameConfig';
import {
  advancePhases,
  applyScoreEvent,
  ballOutOfBounds,
  formatClock,
  goalEntered,
  outcomeOf,
  resetForKickoff,
  resolveScoringTeam,
  startMatch,
} from '../src/game/MatchRules';
import { createMatchState, type MatchState, type ScoreEventRecord } from '../src/game/MatchState';

const STEP = GameConfig.simulation.fixedDeltaSeconds;

function newRunningMatch(): MatchState {
  const state = createMatchState();
  startMatch(state);
  // Run out the kickoff countdown so the ball is live.
  runFor(state, GameConfig.match.kickoffSeconds + STEP);
  return state;
}

function runFor(state: MatchState, seconds: number) {
  const results = [];
  const steps = Math.ceil(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    results.push(advancePhases(state, STEP));
  }
  return results;
}

function scoreEvent(overrides: Partial<ScoreEventRecord> = {}): ScoreEventRecord {
  return {
    shotId: 's',
    kind: 'goal',
    team: 'home',
    playerId: 'home-1',
    points: 1,
    tick: 1,
    ownGoal: false,
    shotType: 'ground',
    power: 0.8,
    ...overrides,
  };
}

describe('match flow', () => {
  it('starts in kickoff and becomes live after the countdown', () => {
    const state = createMatchState();
    startMatch(state);
    expect(state.phase).toBe('kickoff');
    const results = runFor(state, GameConfig.match.kickoffSeconds + STEP);
    expect(state.phase).toBe('playing');
    expect(results.some((result) => result.ballBecameLive)).toBe(true);
  });

  it('does not run the clock outside the playing phase', () => {
    const state = createMatchState();
    startMatch(state);
    runFor(state, GameConfig.match.kickoffSeconds - STEP * 2);
    expect(state.timeRemaining).toBe(GameConfig.match.durationSeconds);
  });

  it('ends the match when the clock runs out', () => {
    const state = newRunningMatch();
    const results = runFor(state, GameConfig.match.durationSeconds + STEP);
    expect(state.phase).toBe('finished');
    expect(state.timeRemaining).toBe(0);
    expect(results.filter((result) => result.matchEnded)).toHaveLength(1);
  });

  it('freezes, then resets for a kickoff after a scoring event', () => {
    const state = newRunningMatch();
    state.ball.position = { x: 3, y: 1, z: 15 };
    state.ball.velocity = { x: 5, y: 0, z: 9 };
    state.players[0]!.position = { x: 4, y: 0, z: 10 };

    applyScoreEvent(state, scoreEvent({ kind: 'crossbar', points: 3, team: 'home' }));
    expect(state.phase).toBe('celebration');
    expect(state.score.home).toBe(3);
    expect(state.kickoffTeam).toBe('away');

    const before = state.timeRemaining;
    runFor(state, GameConfig.match.celebrationSeconds / 2);
    expect(state.timeRemaining).toBe(before);
    expect(state.phase).toBe('celebration');

    const results = runFor(state, GameConfig.match.celebrationSeconds);
    expect(results.some((result) => result.needsKickoffReset)).toBe(true);
    expect(state.phase).toBe('kickoff');

    resetForKickoff(state);
    expect(state.ball.position).toEqual({ x: 0, y: GameConfig.ball.radius, z: 0 });
    expect(state.ball.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.players[0]!.position.x).toBe(0);
    expect(state.players[0]!.position.z).toBeLessThan(0);
    expect(state.players[1]!.position.z).toBeGreaterThan(0);
  });

  it('finishes the match if time ran out during a celebration', () => {
    const state = newRunningMatch();
    state.timeRemaining = 0;
    applyScoreEvent(state, scoreEvent());
    const results = runFor(state, GameConfig.match.celebrationSeconds + STEP);
    expect(state.phase).toBe('finished');
    expect(results.some((result) => result.matchEnded)).toBe(true);
  });

  it('reports win, loss and draw', () => {
    const state = createMatchState();
    expect(outcomeOf(state)).toBe('draw');
    state.score.home = 5;
    expect(outcomeOf(state)).toBe('homeWin');
    state.score.away = 9;
    expect(outcomeOf(state)).toBe('awayWin');
    state.score.home = 9;
    expect(outcomeOf(state)).toBe('draw');
  });

  it('accumulates points from different event kinds', () => {
    const state = newRunningMatch();
    applyScoreEvent(state, scoreEvent({ kind: 'goal', points: 1 }));
    applyScoreEvent(state, scoreEvent({ kind: 'junction', points: 5 }));
    applyScoreEvent(state, scoreEvent({ kind: 'post', points: 2, team: 'away' }));
    expect(state.score.home).toBe(6);
    expect(state.score.away).toBe(2);
    expect(outcomeOf(state)).toBe('homeWin');
  });
});

describe('goal line detection', () => {
  const half = GameConfig.field.length / 2;

  it('detects a ball crossing the away goal line', () => {
    expect(goalEntered({ x: 0, y: 0.4, z: half + 0.5 })).toBe('away');
  });

  it('detects a ball crossing the home goal line', () => {
    expect(goalEntered({ x: -1, y: 0.4, z: -half - 0.5 })).toBe('home');
  });

  it('ignores a ball wide of the posts', () => {
    const outside = GameConfig.goal.width / 2 + 0.5;
    expect(goalEntered({ x: outside, y: 0.4, z: half + 0.5 })).toBeNull();
  });

  it('ignores a ball over the crossbar', () => {
    expect(goalEntered({ x: 0, y: GameConfig.goal.height + 0.4, z: half + 0.5 })).toBeNull();
  });

  it('ignores a ball still in play', () => {
    expect(goalEntered({ x: 0, y: 0.4, z: half - 1 })).toBeNull();
  });
});

describe('scoring team resolution', () => {
  it('credits the shooter for hitting the opponent frame', () => {
    expect(resolveScoringTeam('away', 'home', false)).toBe('home');
  });

  it('gives nothing for hitting your own frame', () => {
    expect(resolveScoringTeam('home', 'home', false)).toBeNull();
  });

  it('credits the opponent when the ball enters your own goal', () => {
    expect(resolveScoringTeam('home', 'home', true)).toBe('away');
    expect(resolveScoringTeam('away', 'home', true)).toBe('home');
  });
});

describe('helpers', () => {
  it('formats the clock', () => {
    expect(formatClock(180)).toBe('3:00');
    expect(formatClock(61)).toBe('1:01');
    expect(formatClock(9.2)).toBe('0:10');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('detects an out-of-bounds ball', () => {
    expect(ballOutOfBounds({ x: 0, y: 0.1, z: 0 })).toBe(false);
    expect(ballOutOfBounds({ x: GameConfig.field.width, y: 0.1, z: 0 })).toBe(true);
    expect(ballOutOfBounds({ x: 0, y: -10, z: 0 })).toBe(true);
  });
});
