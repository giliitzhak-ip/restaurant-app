/**
 * Who gets the credit.
 *
 * Kept apart from the engine because it is pure arithmetic over the touch log
 * and nothing else: the same rule has to hold on the server, on a mirrored
 * client and in a test, and none of them should have to build a physics scene
 * to ask who assisted a goal.
 */
import type { TeamId, TouchLogEntry } from './MatchState';

/**
 * The team-mate who set a goal up, or null.
 *
 * It is the most recent meaningful touch before the scorer's own that was made
 * by somebody else on the same side, inside the window. An opponent's touch in
 * between does not cancel it — a deflection off a defender is still an assist —
 * but a touch from before the window, or from before a restart (the log is
 * cleared at every kickoff), can never become one.
 */
export function findAssist(
  touches: readonly TouchLogEntry[],
  scorerId: string,
  team: TeamId,
  tick: number,
  windowTicks: number,
): string | null {
  for (const touch of touches) {
    if (touch.playerId === scorerId) continue;
    if (touch.team !== team) continue;
    if (tick - touch.tick > windowTicks) return null;
    return touch.playerId;
  }
  return null;
}
