/**
 * The stand-in for a player who dropped.
 *
 * In 1×1 a disconnect pauses the match and waits — there is no game without
 * the other player. In 2×2 that would stop three people for half a minute, so
 * after a short pause a bot takes the seat and the match carries on.
 *
 * The bot is not a special kind of player. It is the existing `AIController`
 * producing the same `PlayerCommand` as everybody else, going through the same
 * server validation and the same touch rule. It cannot move faster, see
 * further or shoot straighter, because there is nowhere for it to do that.
 */
import { AIController } from '../ai/AIController';
import type { TeamId } from '../game/MatchState';
import type { PlayerController } from '../input/PlayerController';

export interface BotSeat {
  readonly playerId: string;
  readonly team: TeamId;
}

export class BotSubstitutionManager {
  private readonly bots = new Map<string, AIController>();

  /**
   * Creates (or reuses) the bot for a seat. Deliberately a middling
   * difficulty: a substitute should keep the game going, not decide it.
   */
  takeOver(seat: BotSeat): PlayerController {
    const existing = this.bots.get(seat.playerId);
    if (existing) {
      existing.reset();
      return existing;
    }
    const bot = new AIController(`bot:${seat.playerId}`, seat.team, 'normal');
    this.bots.set(seat.playerId, bot);
    return bot;
  }

  handBack(playerId: string): void {
    this.bots.get(playerId)?.reset();
  }

  isBot(playerId: string): boolean {
    return this.bots.has(playerId);
  }

  release(playerId: string): void {
    this.bots.delete(playerId);
  }

  clear(): void {
    this.bots.clear();
  }
}
