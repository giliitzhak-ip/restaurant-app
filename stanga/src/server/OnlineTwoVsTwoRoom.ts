/**
 * Online 2×2.
 *
 * Four seats, two per side — and that is the whole difference. The room is the
 * same `BaseOnlineMatchRoom` running the same simulation; what changes is a
 * `MatchConfig` with four seats, a roster to match, softer collisions between
 * team-mates and a bot that steps in when somebody drops, because stopping
 * three people to wait for a fourth is not a game.
 */
import { BaseOnlineMatchRoom } from './BaseOnlineMatchRoom';
import { TWO_VS_TWO_CONFIG, type MatchConfig } from '../game/MatchConfig';

export class OnlineTwoVsTwoRoom extends BaseOnlineMatchRoom {
  readonly matchConfig: MatchConfig = TWO_VS_TWO_CONFIG;
}
