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
    case 'idle':
    case 'finished':
      return { ...EMPTY_RESULT };
  }
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
