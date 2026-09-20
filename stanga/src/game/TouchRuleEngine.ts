/**
 * The STANGA touch rule.
 *
 * One meaningful touch per turn. Once the ball has hit the ground after your
 * touch, it is not yours again until somebody else plays it or the match
 * restarts. The one exception is juggling: while the ball stays in the air you
 * may keep touching it, and a wall, a post or the bar does not break the chain
 * — only the playing surface does.
 *
 * This is deliberately pure TypeScript with no engine types: the server runs
 * it as the source of truth, the offline game runs the same instance, and the
 * online client runs a copy that predicts but never decides.
 */
import type { TeamId } from './MatchState';

export type TouchOutcome =
  /** A legal first touch: the turn now belongs to this player. */
  | 'firstTouch'
  /** A legal touch inside an aerial chain. */
  | 'juggle'
  /** Illegal: the same player again after the ball hit the ground. */
  | 'violation'
  /** Not meaningful enough to count as a touch at all. */
  | 'ignored';

/** Everything the rule needs to know about one contact. */
export interface TouchCandidate {
  playerId: string;
  team: TeamId;
  tick: number;
  /** A kick, a pass, a juggle or a won tackle — an action the player asked for. */
  deliberate: boolean;
  /** |ball velocity − player velocity| at the moment of contact, m/s. */
  relativeSpeed: number;
}

/** Serializable, so it can be mirrored to clients and asserted in tests. */
export interface TouchRuleState {
  lastMeaningfulTouchPlayerId: string | null;
  lastMeaningfulTouchTeamId: TeamId | null;
  /** Increments on every legal first touch, so a shot can be tied to a turn. */
  touchSequenceId: number;
  firstTouchTick: number;
  ballHasTouchedGroundSinceFirstTouch: boolean;
  aerialChainActive: boolean;
  aerialTouchCount: number;
  lastGroundContactTick: number;
  /** Ticks left before this player can offend again, so one bump is one call. */
  violationCooldown: number;
}

export interface TouchRuleConfig {
  /** Below this relative speed a contact is noise, not a touch. */
  readonly minRelativeSpeed: number;
  /** Ticks of silence after a violation, so one scramble is one whistle. */
  readonly violationCooldownTicks: number;
}

export const DEFAULT_TOUCH_RULE_CONFIG: TouchRuleConfig = {
  // Slow enough that a deliberate poke always counts, fast enough that a
  // capsule brushing a rolling ball does not.
  minRelativeSpeed: 1.1,
  violationCooldownTicks: 30,
};

/**
 * Whether a player may legally play the ball right now.
 *
 * A free function on the serialized state, so the AI, the HUD and the online
 * client all answer the question the same way the rule does — without needing
 * the engine.
 */
export function canPlayerTouch(state: TouchRuleState, playerId: string): boolean {
  if (state.lastMeaningfulTouchPlayerId !== playerId) return true;
  return !state.ballHasTouchedGroundSinceFirstTouch;
}

export function createTouchRuleState(): TouchRuleState {
  return {
    lastMeaningfulTouchPlayerId: null,
    lastMeaningfulTouchTeamId: null,
    touchSequenceId: 0,
    firstTouchTick: -1,
    ballHasTouchedGroundSinceFirstTouch: true,
    aerialChainActive: false,
    aerialTouchCount: 0,
    lastGroundContactTick: -1,
    violationCooldown: 0,
  };
}

export class TouchRuleEngine {
  /**
   * The rule writes straight into the match state rather than keeping its own
   * copy, so it is serialized, mirrored to clients and readable by the AI for
   * free — and there is only ever one answer to "whose turn is it".
   */
  constructor(
    private readonly config: TouchRuleConfig = DEFAULT_TOUCH_RULE_CONFIG,
    readonly state: TouchRuleState = createTouchRuleState(),
  ) {}

  /** Clears the turn. Used for kick-off, a reset, a score and a violation. */
  reset(tick: number): void {
    const state = this.state;
    state.lastMeaningfulTouchPlayerId = null;
    state.lastMeaningfulTouchTeamId = null;
    state.firstTouchTick = -1;
    state.ballHasTouchedGroundSinceFirstTouch = true;
    state.aerialChainActive = false;
    state.aerialTouchCount = 0;
    state.lastGroundContactTick = tick;
    state.violationCooldown = 0;
  }

  /** One simulation tick of bookkeeping. */
  advance(): void {
    if (this.state.violationCooldown > 0) this.state.violationCooldown -= 1;
  }

  /**
   * The ball met the playing surface. This is what ends a juggle: a wall, a
   * post or the crossbar must *not* be reported here.
   */
  registerGroundContact(tick: number): void {
    const state = this.state;
    state.lastGroundContactTick = tick;
    if (state.lastMeaningfulTouchPlayerId === null) return;
    state.ballHasTouchedGroundSinceFirstTouch = true;
    state.aerialChainActive = false;
  }

  /** True when this player may legally play the ball right now. */
  canTouch(playerId: string): boolean {
    return canPlayerTouch(this.state, playerId);
  }

  /** How many touches the current aerial chain has run to. */
  get aerialCount(): number {
    return this.state.aerialChainActive ? this.state.aerialTouchCount : 0;
  }

  /**
   * Offers a contact to the rule. Returns what it was: the caller applies the
   * physical effect only for a legal touch, and calls a violation a violation.
   */
  register(candidate: TouchCandidate): TouchOutcome {
    if (!this.isMeaningful(candidate)) return 'ignored';

    const state = this.state;
    const samePlayer = state.lastMeaningfulTouchPlayerId === candidate.playerId;

    if (samePlayer && !state.ballHasTouchedGroundSinceFirstTouch) {
      state.aerialChainActive = true;
      state.aerialTouchCount += 1;
      return 'juggle';
    }

    if (samePlayer) {
      // A second bite after the ball came down. One whistle per scramble.
      if (state.violationCooldown > 0) return 'ignored';
      state.violationCooldown = this.config.violationCooldownTicks;
      return 'violation';
    }

    state.lastMeaningfulTouchPlayerId = candidate.playerId;
    state.lastMeaningfulTouchTeamId = candidate.team;
    state.touchSequenceId += 1;
    state.firstTouchTick = candidate.tick;
    state.ballHasTouchedGroundSinceFirstTouch = false;
    state.aerialChainActive = true;
    state.aerialTouchCount = 1;
    return 'firstTouch';
  }

  /**
   * A deliberate action always counts; an accidental one has to be firm enough
   * to be worth a whistle. Both halves matter: too low a bar and standing near
   * a rolling ball gives away possession, too high and a player can farm
   * gentle nudges that the rule never sees.
   */
  private isMeaningful(candidate: TouchCandidate): boolean {
    if (candidate.deliberate) return true;
    return candidate.relativeSpeed >= this.config.minRelativeSpeed;
  }
}
