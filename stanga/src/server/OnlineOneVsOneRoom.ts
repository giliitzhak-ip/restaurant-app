/**
 * Online 1×1.
 *
 * The whole mode is a `MatchConfig` on top of `BaseOnlineMatchRoom`: two seats,
 * one per team. Stage 4's 2×2 is meant to be the same shape with four seats and
 * a different room name, not a second server.
 */
import { BaseOnlineMatchRoom } from './BaseOnlineMatchRoom';
import { ONE_VS_ONE_CONFIG, type MatchConfig } from './MatchConfig';

export class OnlineOneVsOneRoom extends BaseOnlineMatchRoom {
  readonly matchConfig: MatchConfig = ONE_VS_ONE_CONFIG;
}
