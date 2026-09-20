/**
 * MatchRules — pure match flow: the clock, phase transitions, kickoff resets
 * and the goal-line test. No engine dependency, fully unit testable.
 */
import { GameConfig } from '../config/GameConfig';
import { setVec } from '../core/math';
import type { Vec3 } from '../core/math';
import { kickoffFacing, kickoffPosition, rosterFor } from './MatchRoster';
import {
  type MatchOutcome,
  type ViolationRecord,
  type MatchState,
  type ScoreEventRecord,
  type TeamId,
  goalOwnerAtZ,
  matchOutcome,
  opponentOf,
} from './MatchState';

/** What happened during one rules update, so callers can react (audio, UI, physics reset). */
export interface RulesUpdateResult {
  /** The match just moved from 'playing' to 'finished'. */
  matchEnded: boolean;
  /** The celebration ended and the pitch must be reset for a kickoff. */
  needsKickoffReset: boolean;
  /** The ball became live (kickoff countdown finished). */
  ballBecameLive: boolean;
}

const EMPTY_RESULT: Readonly<RulesUpdateResult> = Object.freeze({
  matchEnded: false,
  needsKickoffReset: false,
  ballBecameLive: false,
});

export function startMatch(state: MatchState): void {
  state.phase = 'kickoff';
  state.phaseTimer = GameConfig.match.kickoffSeconds;
  state.timeRemaining = GameConfig.match.durationSeconds;
  state.score.home = 0;
  state.score.away = 0;
  state.lastEvent = null;
  state.tick = 0;
  state.elapsed = 0;
  state.kickoffTeam = 'home';
}

/**
 * Advances clock and phases by one fixed step.
 * The match clock only runs while the ball is live.
 */
export function advancePhases(state: MatchState, dt: number): RulesUpdateResult {
  switch (state.phase) {
    case 'kickoff': {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        state.phaseTimer = 0;
        state.phase = 'playing';
        return { ...EMPTY_RESULT, ballBecameLive: true };
      }
      return { ...EMPTY_RESULT };
    }
    case 'playing': {
      state.timeRemaining = Math.max(0, state.timeRemaining - dt);
      if (state.timeRemaining <= 0) {
        state.phase = 'finished';
        state.phaseTimer = 0;
        return { ...EMPTY_RESULT, matchEnded: true };
      }
      return { ...EMPTY_RESULT };
    }
    case 'celebration': {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        state.phaseTimer = 0;
        if (state.timeRemaining <= 0) {
          state.phase = 'finished';
          return { ...EMPTY_RESULT, matchEnded: true };
        }
        state.phase = 'kickoff';
        state.phaseTimer = GameConfig.match.kickoffSeconds;
        return { ...EMPTY_RESULT, needsKickoffReset: true };
      }
      return { ...EMPTY_RESULT };
    }
    case 'violation': {
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        state.phaseTimer = 0;
        state.phase = 'playing';
        return { ...EMPTY_RESULT, ballBecameLive: true };
      }
      return { ...EMPTY_RESULT };
    }
    case 'idle':
    case 'finished':
      return { ...EMPTY_RESULT };
  }
}

/**
 * Applies a double-touch call: the ball goes to the other team at a sane spot,
 * and play freezes just long enough to read the banner.
 *
 * The restart is placed where the offence happened, pulled back inside the
 * pitch and away from either goal, so a violation next to the line is never a
 * free shot. The taker is the opponent nearest the ball — and ties break by
 * slot index, so every client works out the same player without being told.
 */
export function applyTouchViolation(
  state: MatchState,
  offendingPlayerId: string,
  offendingTeam: TeamId,
): ViolationRecord {
  const restartTeam = opponentOf(offendingTeam);
  const opponents = state.players.filter((player) => player.team === restartTeam);
  const ball = state.ball.position;

  let taker = opponents[0];
  let best = Number.POSITIVE_INFINITY;
  for (const player of opponents) {
    const distance = Math.hypot(player.position.x - ball.x, player.position.z - ball.z);
    // Strictly-less keeps the lowest slot index when two are equally close.
    if (distance < best - 1e-6) {
      best = distance;
      taker = player;
    }
  }

  const spot = restartSpot(ball);
  setVec(state.ball.position, spot.x, GameConfig.ball.radius, spot.z);
  setVec(state.ball.velocity, 0, 0, 0);
  state.ball.lastTouchBy = null;
  state.ball.lastTouchTeam = null;

  state.phase = 'violation';
  state.phaseTimer = GameConfig.match.violationFreezeSeconds;

  const record: ViolationRecord = {
    kind: 'doubleTouch',
    playerId: offendingPlayerId,
    offendingTeam,
    restartPlayerId: taker?.id ?? offendingPlayerId,
    restartTeam,
    tick: state.tick,
  };
  state.lastViolation = record;
  return record;
}

/** Keeps a restart inside the pitch and out of either penalty spot. */
function restartSpot(ball: Vec3): { x: number; z: number } {
  const halfLength = GameConfig.field.length / 2;
  const halfWidth = GameConfig.field.width / 2;
  const margin = GameConfig.touch.restartGoalMargin;
  const maxZ = halfLength - margin;
  const maxX = halfWidth - 1.5;
  return {
    x: Math.max(-maxX, Math.min(maxX, ball.x)),
    z: Math.max(-maxZ, Math.min(maxZ, ball.z)),
  };
}

/** Applies a resolved scoring event: updates the score and enters the celebration pause. */
export function applyScoreEvent(state: MatchState, event: ScoreEventRecord): void {
  state.score[event.team] += event.points;
  state.lastEvent = event;
  state.kickoffTeam = opponentOf(event.team);
  state.phase = 'celebration';
  state.phaseTimer = GameConfig.match.celebrationSeconds;
}

/**
 * Resolves which team a frame/goal contact scores for.
 * Hitting your own goal's frame is worth nothing; a shot into your own goal
 * counts for the opponent, which is what `goalOwner` already expresses.
 */
export function resolveScoringTeam(
  goalOwner: TeamId,
  shooterTeam: TeamId,
  isGoalLine: boolean,
): TeamId | null {
  if (isGoalLine) {
    // Whoever's goal it is concedes; the other team scores.
    return opponentOf(goalOwner);
  }
  // Frame hits only count on the goal you are attacking.
  return goalOwner === shooterTeam ? null : shooterTeam;
}

/**
 * Goal-line test. Returns the owner of the goal the ball entered, or null.
 * Uses the ball centre crossing the line plus staying inside the posts and under the bar.
 */
export function goalEntered(ballPosition: Vec3): TeamId | null {
  const halfLength = GameConfig.field.length / 2;
  const halfWidth = GameConfig.goal.width / 2;
  const { radius } = GameConfig.ball;

  if (Math.abs(ballPosition.x) > halfWidth) return null;
  if (ballPosition.y > GameConfig.goal.height) return null;
  if (ballPosition.y < -1) return null;

  const beyondPositive = ballPosition.z > halfLength + radius * 0.5;
  const beyondNegative = ballPosition.z < -halfLength - radius * 0.5;
  if (!beyondPositive && !beyondNegative) return null;

  const insideNet = Math.abs(ballPosition.z) < halfLength + GameConfig.goal.depth + 1;
  if (!insideNet) return null;

  return goalOwnerAtZ(beyondNegative ? -1 : 1);
}

/** Places ball and players at their kickoff spots. Mutates the state in place. */
export function resetForKickoff(state: MatchState): void {
  setVec(state.ball.position, 0, GameConfig.ball.radius, 0);
  setVec(state.ball.velocity, 0, 0, 0);
  state.ball.lastTouchBy = null;
  state.ball.lastTouchTeam = null;

  const roster = rosterFor(state.playersPerTeam);
  for (const player of state.players) {
    const entry = roster.entries.find((candidate) => candidate.playerId === player.id) ?? {
      playerId: player.id,
      team: player.team,
      slotIndex: player.slotIndex,
    };
    const spot = kickoffPosition(entry, roster, player.team === state.kickoffTeam);
    setVec(player.position, spot.x, 0, spot.z);
    setVec(player.velocity, 0, 0, 0);
    player.facing = kickoffFacing(entry);
    player.kickCharge = 0;
    player.charging = false;
    player.kickCooldown = 0;
    player.tackleCooldown = 0;
    player.stunTimer = 0;
    player.stamina = Math.max(player.stamina, GameConfig.player.staminaMax * 0.6);
  }
}

/** True when the ball has left the playable area and must be brought back. */
export function ballOutOfBounds(ballPosition: Vec3): boolean {
  const halfLength = GameConfig.field.length / 2;
  const halfWidth = GameConfig.field.width / 2;
  const margin = 2.5;
  return (
    Math.abs(ballPosition.x) > halfWidth + margin ||
    Math.abs(ballPosition.z) > halfLength + GameConfig.goal.depth + margin ||
    ballPosition.y < -4 ||
    ballPosition.y > 30
  );
}

export function outcomeOf(state: MatchState): MatchOutcome {
  return matchOutcome(state);
}

/** mm:ss for the HUD clock. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
