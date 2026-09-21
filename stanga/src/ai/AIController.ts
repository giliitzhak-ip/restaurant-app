/**
 * AIController — a finite state machine that plays street football.
 *
 * It reads the same MatchState the renderer reads and emits the same
 * PlayerCommand a human produces. Nothing here touches the engine, and no
 * external AI service is involved: it is plain, deterministic logic plus a
 * seeded RNG that keeps every possession slightly different.
 *
 * The one idea worth knowing before reading it: the opponent does not run at
 * where the ball is. It runs at where the ball is going to be, and how far
 * ahead it can see is what a difficulty setting actually changes.
 */
import {
  GameConfig,
  type Difficulty,
  type DifficultyProfile,
  type ShotStyle,
} from '../config/GameConfig';
import { Rng } from '../core/Rng';
import { clamp, horizontalDistance, yawFromXZ } from '../core/math';
import type { Vec3 } from '../core/math';
import type { ControlContext, PlayerController } from '../input/PlayerController';
import { SequenceCounter } from '../input/PlayerController';
import {
  createPlayerCommand,
  resetPlayerCommand,
  type PlayerCommand,
} from '../input/PlayerCommand';
import {
  attackingGoalZ,
  defendingGoalZ,
  type MatchState,
  type PlayerState,
  type TeamId,
} from '../game/MatchState';
import { canPlayerTouch } from '../game/TouchRuleEngine';
import { predictBall } from '../game/BallFlight';

/**
 * The states of one-touch football.
 *
 * There is no dribbling under the STANGA rule, so there is no "carry the ball"
 * state: the opponent either runs onto the ball with a shot already charging,
 * keeps it up in the air, or gets out of the way and waits its turn again.
 */
export type AIState =
  | 'Kickoff'
  /** Running at a ball that is sitting still or barely moving. */
  | 'Chase'
  /** Running at where a moving ball will be, which is not where it is. */
  | 'Intercept'
  /** Ours and far from goal: carry the move forward. */
  | 'Attack'
  /** Inside shooting range: settle, line up, load. */
  | 'PrepareShot'
  /** Loaded and in range: release. */
  | 'Shoot'
  /** The ball is up and reachable: keep the chain alive. */
  | 'Juggle'
  /** Moving into space to be passed to. */
  | 'Support'
  /** Between the ball and our own goal, close enough to be a nuisance. */
  | 'Defend'
  /** Back to the defensive line after losing it. */
  | 'Recover'
  /** The touch rule says the ball is not ours to play; give it room. */
  | 'HoldOff';

interface ShotPlan {
  /** Lateral offset on the goal line the AI aims at, in metres. */
  aimOffsetX: number;
  /** Height on the goal it is going for: 0 is along the ground, 1 the bar. */
  aimHeight: number;
  /** Target charge, 0..1. */
  power: number;
  style: ShotStyle;
  /** How long the AI keeps charging before releasing. */
  chargeSeconds: number;
}

export class AIController implements PlayerController {
  readonly kind = 'ai' as const;
  readonly deviceId: string;
  readonly label: string;
  private readonly sequence = new SequenceCounter();
  private state: AIState = 'Kickoff';
  private stateTime = 0;
  private reactionTimer = 0;
  private chargeTime = 0;
  /**
   * Seconds until this player is willing to start another deliberate action.
   * Without it the opponent asks for a tackle or a strike on every single
   * tick, which reads as a twitching machine rather than an opponent.
   */
  private actionCooldown = 0;
  private plan: ShotPlan;
  private readonly command: PlayerCommand;
  private profile: DifficultyProfile;
  /** Per-possession personality: small, persistent biases so it never feels scripted. */
  private wanderPhase: number;
  private wanderStrength: number;
  /** Reused so a tick of thinking allocates nothing. */
  private readonly aimPoint: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly playerId: string,
    private readonly team: TeamId,
    difficulty: Difficulty,
    private readonly rng: Rng = new Rng(0x51a6a),
  ) {
    this.deviceId = `ai:${playerId}`;
    this.label = 'מחשב';
    this.profile = GameConfig.difficulty[difficulty];
    this.command = createPlayerCommand(playerId);
    this.plan = this.makePlan(GameConfig.difficulty[difficulty].shootingRange);
    this.wanderPhase = this.rng.range(0, Math.PI * 2);
    this.wanderStrength = this.rng.range(0.1, 0.3);
  }

  get currentState(): AIState {
    return this.state;
  }

  isConnected(): boolean {
    return true;
  }

  /** PlayerController entry point. The AI ignores the camera entirely. */
  poll(playerId: string, tickId: number, context: ControlContext): PlayerCommand {
    this.command.playerId = playerId;
    return this.update(context.state, context.dt, tickId);
  }

  setDifficulty(difficulty: Difficulty): void {
    this.profile = GameConfig.difficulty[difficulty];
  }

  reset(): void {
    this.sequence.reset();
    this.state = 'Kickoff';
    this.stateTime = 0;
    this.chargeTime = 0;
    this.reactionTimer = 0;
    this.actionCooldown = 0;
    this.plan = this.makePlan(this.profile.shootingRange);
    this.wanderPhase = this.rng.range(0, Math.PI * 2);
    this.wanderStrength = this.rng.range(0.1, 0.3);
  }

  /** Produces the command for one simulation tick. */
  update(state: MatchState, dt: number, tick: number): PlayerCommand {
    resetPlayerCommand(this.command, tick, this.sequence.next());

    const me = state.players.find((player) => player.id === this.playerId);
    if (!me) return this.command;

    const opponent = state.players.find((player) => player.team !== this.team);
    this.stateTime += dt;
    this.reactionTimer -= dt;
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    this.wanderPhase += dt * 0.9;

    if (state.phase === 'celebration' || state.phase === 'finished' || state.phase === 'idle') {
      this.transition('Recover');
      return this.command;
    }

    if (this.reactionTimer <= 0) {
      this.reactionTimer = this.profile.reactionTime;
      this.transition(this.decide(state, me));
    }

    this.act(state, me, opponent, dt);
    return this.command;
  }

  // ── Decision ────────────────────────────────────────────────────────────────

  private decide(state: MatchState, me: PlayerState): AIState {
    if (state.phase === 'kickoff') return 'Kickoff';
    if (me.stunTimer > 0) return 'Recover';
    if (this.state === 'Shoot' && this.stateTime < 0.3) return 'Shoot';

    const ball = state.ball.position;
    // The STANGA rule: one touch, then it is somebody else's ball. Crowding it
    // anyway would just hand the opponent a restart, so the AI backs off.
    if (!canPlayerTouch(state.touch, me.id)) return 'HoldOff';

    const myDistance = horizontalDistance(me.position, ball);

    // The ball is up: a touch in the air keeps the chain alive and is free.
    if (ball.y > GameConfig.ball.radius * 2.5 && myDistance < GameConfig.kick.range * 1.4) {
      return 'Juggle';
    }

    // Loaded and on top of it: let go. Or about to run into it anyway, in
    // which case striking is better than spending the one touch on a bump.
    const loaded = this.chargeTime >= this.plan.chargeSeconds;
    const aboutToCollide = GameConfig.player.radius + GameConfig.ball.radius + 0.35;
    if (myDistance <= GameConfig.kick.range * 0.92 && (loaded || myDistance <= aboutToCollide)) {
      return 'Shoot';
    }

    /*
     * Who goes for the ball is a question about my own team, not about the
     * opposition.
     *
     * This used to also require being nearer the ball than the opponent, and
     * that is why the computer barely moved: a human standing next to the ball
     * made the condition permanently false, so the AI sat on its defensive
     * line and never contested anything. Measured at the time: 87% of a match
     * in Defend, one touch in sixty seconds, and against a human who stood
     * still, no touch at all.
     *
     * Only players who are *allowed* to touch the ball count. Without that the
     * game deadlocks the other way: whoever touched last cannot play it, and
     * everybody else thinks they are not the nearest.
     */
    const closestMate = Math.min(
      ...state.players
        .filter((player) => player.team === this.team && player.id !== me.id)
        .map((player) =>
          canPlayerTouch(state.touch, player.id)
            ? horizontalDistance(player.position, ball)
            : Number.POSITIVE_INFINITY,
        ),
      Number.POSITIVE_INFINITY,
    );

    // Alone on my side, closestMate is Infinity and this is always true: there
    // is nobody else to do it, so I do it.
    if (myDistance <= closestMate) {
      const goalDistance = horizontalDistance(ball, {
        x: 0,
        y: 0,
        z: attackingGoalZ(this.team),
      });
      // Close enough to hurt: stop chasing and start setting the shot up.
      if (goalDistance <= this.profile.shootingRange && myDistance < GameConfig.kick.range * 3) {
        return 'PrepareShot';
      }
      // A ball with pace on it is caught by going where it is going.
      const ballSpeed = Math.hypot(state.ball.velocity.x, state.ball.velocity.z);
      if (ballSpeed > INTERCEPT_SPEED) return 'Intercept';
      // Ours, but a long way from goal: there is a pitch to cross first.
      if (
        state.ball.lastTouchTeam === this.team &&
        goalDistance > this.profile.shootingRange * 1.6
      ) {
        return 'Attack';
      }
      return 'Chase';
    }

    // A team-mate is closer. Get open if we have it, press if they do.
    return state.ball.lastTouchTeam === this.team ? 'Support' : 'Defend';
  }

  private transition(next: AIState): void {
    if (next === this.state) return;
    // Letting go of the ball lets go of the charge; running onto it starts a
    // fresh plan, because by the time it arrives the picture has changed.
    if (CHARGING_STATES.has(this.state) && next !== 'Shoot') this.chargeTime = 0;
    if (next === 'Chase' || next === 'Intercept' || next === 'Attack' || next === 'PrepareShot') {
      if (!CHARGING_STATES.has(this.state)) {
        this.plan = this.makePlan(this.profile.shootingRange);
        this.chargeTime = 0;
      }
    }
    this.state = next;
    this.stateTime = 0;
  }

  // ── Action ──────────────────────────────────────────────────────────────────

  private act(
    state: MatchState,
    me: PlayerState,
    opponent: PlayerState | undefined,
    dt: number,
  ): void {
    const ball = state.ball.position;
    const attackZ = attackingGoalZ(this.team);
    const defendZ = defendingGoalZ(this.team);

    switch (this.state) {
      case 'Kickoff': {
        const kicksOff = state.kickoffTeam === this.team;
        const target = kicksOff
          ? { x: ball.x, y: 0, z: ball.z - Math.sign(attackZ) * 0.9 }
          : { x: 0, y: 0, z: defendZ * 0.38 };
        this.moveTowards(me, target, false);
        this.faceTowards(me, ball);
        break;
      }

      case 'Chase':
      case 'Attack': {
        // Run onto the ball with the shot already loading, and aim at the goal
        // rather than at the ball: the kick goes where the body faces, and the
        // cone in front of the player is wide enough to do both at once.
        this.chargeTime += dt;
        this.moveTowards(me, ball, horizontalDistance(me.position, ball) > 3.5);
        this.aimAtGoal(me, ball, attackZ);
        this.loadShot();
        break;
      }

      case 'Intercept': {
        /*
         * Run at where the ball is going, not at where it is.
         *
         * How far ahead depends on how long it would take to get there, which
         * depends on where it will be — so one round of that is enough to be
         * useful and cheap. The difficulty caps how far ahead it can see, and
         * that is most of what separates an easy opponent from a hard one.
         */
        const guess = this.interceptPoint(state, me);
        this.chargeTime += dt;
        this.moveTowards(me, guess, horizontalDistance(me.position, guess) > 3);
        this.aimAtGoal(me, ball, attackZ);
        this.loadShot();
        break;
      }

      case 'PrepareShot': {
        /*
         * Line the strike up instead of falling into it.
         *
         * The approach comes in from behind the ball on the line to the goal,
         * so the body is already pointing the right way when the foot arrives
         * — which is what makes the difference between a shot on target and
         * a scuff into the corner.
         */
        const approach = this.approachPoint(me, ball, attackZ);
        this.chargeTime += dt;
        this.moveTowards(me, approach, false);
        this.aimAtGoal(me, ball, attackZ);
        this.loadShot();
        break;
      }

      case 'Shoot': {
        /*
         * Keep asking to release for the whole window, not just on the first
         * tick.
         *
         * A strike is refused unless the ball is in range and inside the cone
         * at the exact moment the control comes up, and a ball that is still
         * rolling into place fails that test by a few hundredths of a second.
         * Firing once and hoping is why the AI used to shepherd the ball
         * around at walking pace without ever hitting it: the charge was spent
         * every time, on nothing. The engine sets a cooldown on the first
         * strike that lands, so the repeats after it are no-ops.
         */
        this.command.shootHeld = false;
        this.command.shootReleased = true;
        this.aimAtGoal(me, ball, attackZ);
        this.command.verticalAim = this.plan.aimHeight;
        this.command.shotStyle = this.plan.style;
        if (this.stateTime > SHOT_WINDOW_SECONDS) this.transition('Recover');
        break;
      }

      case 'Juggle': {
        // Stay under the ball and keep it up: the aerial chain is the only way
        // one player is allowed to advance with it.
        this.moveTowards(me, ball, false);
        this.faceTowards(me, { x: ball.x, y: 0, z: attackZ });
        this.chargeTime += dt * 0.5;
        if (this.actionCooldown <= 0) {
          this.command.jugglePressed = true;
          this.actionCooldown = GameConfig.juggle.cooldownSeconds * 1.6;
        }
        break;
      }

      case 'Support': {
        // Give the team-mate on the ball somewhere to pass to: ahead of the
        // ball, off to one side, out of the opponent's shadow.
        const side = me.slotIndex === 0 ? 1 : -1;
        const target = {
          x: clamp(
            ball.x + side * (3.4 + this.wander()),
            -GameConfig.field.width * 0.42,
            GameConfig.field.width * 0.42,
          ),
          y: 0,
          z: clamp(
            ball.z + Math.sign(attackZ) * (4 + this.wander() * 1.5),
            -GameConfig.field.length * 0.45,
            GameConfig.field.length * 0.45,
          ),
        };
        this.moveTowards(me, target, horizontalDistance(me.position, target) > 4);
        this.faceTowards(me, ball);
        this.chargeTime = 0;
        break;
      }

      case 'HoldOff': {
        /*
         * My touch is spent, so this is the time to be somewhere useful.
         *
         * Backing straight off the ball and stopping is what this used to do,
         * and against an opponent who never came for the ball it meant the
         * computer stood almost still for most of a minute. Instead it takes
         * up a position off to the side and goal-side of the ball: clear of
         * the ball by more than a foot's reach, facing it, and already where
         * it wants to be the moment the turn comes back.
         */
        const side = me.position.x >= ball.x ? 1 : -1;
        const clearance = GameConfig.kick.range + 1.2;
        const away = {
          x: clamp(
            ball.x + side * (clearance + this.wander()),
            -GameConfig.field.width * 0.44,
            GameConfig.field.width * 0.44,
          ),
          y: 0,
          z: clamp(
            ball.z + Math.sign(defendZ - ball.z) * clearance,
            -GameConfig.field.length * 0.46,
            GameConfig.field.length * 0.46,
          ),
        };
        this.moveTowards(me, away, horizontalDistance(me.position, away) > 5);
        this.faceTowards(me, ball);
        break;
      }

      case 'Defend': {
        /*
         * Stand on the line the ball would take to the middle of the goal,
         * and stand on it close enough to be a nuisance.
         *
         * Blocking the angle is what a defender is for: a metre and a half
         * goal-side of the ball, on the line to the centre of the net, covers
         * the shot the attacker most wants. A defender who stands off is a
         * defender the ball walks past, and it never gets inside tackling
         * range to try anything.
         */
        const future = predictBall(state.ball, this.profile.reactionTime * 2);
        const toGoalX = -future.x;
        const toGoalZ = defendZ - future.z;
        const toGoal = Math.hypot(toGoalX, toGoalZ) || 1;
        const standOff = 1.5 + this.wander() * 0.4;
        const target = {
          x: future.x + (toGoalX / toGoal) * standOff,
          y: 0,
          z: future.z + (toGoalZ / toGoal) * standOff,
        };
        this.moveTowards(me, target, horizontalDistance(me.position, target) > 3);
        this.faceTowards(me, ball);
        this.maybeTackle(me, ball, opponent, state);
        break;
      }

      case 'Recover': {
        const home = { x: this.wander() * 2.5, y: 0, z: defendZ * 0.3 };
        this.moveTowards(me, home, horizontalDistance(me.position, home) > 6);
        this.faceTowards(me, ball);
        this.chargeTime = 0;
        break;
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Holds the charge and states the height and shape it wants. */
  private loadShot(): void {
    this.command.shootHeld = true;
    this.command.shootPressed = this.chargeTime <= 0.02;
    // The AI states the height it wants rather than asking for a toggle: the
    // toggle belongs to the input devices, and a value is what the simulation
    // actually reads.
    this.command.verticalAim = this.plan.aimHeight;
    this.command.shotStyle = this.plan.style;
  }

  /** Where to meet a moving ball, given how fast this player can get there. */
  private interceptPoint(state: MatchState, me: PlayerState): Vec3 {
    const horizon = this.profile.predictionSeconds;
    const speed = GameConfig.player.sprintSpeed * this.profile.speedMultiplier;
    // First guess: how long to reach where it is now. Then look that far ahead
    // and answer the same question about the new point. Two rounds is enough.
    let lead = Math.min(horizon, horizontalDistance(me.position, state.ball.position) / speed);
    for (let i = 0; i < 2; i += 1) {
      const guess = predictBall(state.ball, lead);
      lead = Math.min(horizon, horizontalDistance(me.position, guess) / speed);
    }
    return predictBall(state.ball, lead);
  }

  /** A point just behind the ball on the line to the goal, to strike through. */
  private approachPoint(me: PlayerState, ball: Vec3, attackZ: number): Vec3 {
    const dx = this.plan.aimOffsetX - ball.x;
    const dz = attackZ - ball.z;
    const length = Math.hypot(dx, dz) || 1;
    const behind = GameConfig.kick.range * 0.55;
    const target = {
      x: ball.x - (dx / length) * behind,
      y: 0,
      z: ball.z - (dz / length) * behind,
    };
    // If the approach point is behind us anyway, just go at the ball: circling
    // a ball that is about to be taken off you is how possession is lost.
    return horizontalDistance(me.position, target) > horizontalDistance(me.position, ball) + 1.6
      ? ball
      : target;
  }

  private moveTowards(me: PlayerState, target: Vec3, sprint: boolean): void {
    const dx = target.x - me.position.x;
    const dz = target.z - me.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.14) {
      this.command.moveX = 0;
      this.command.moveY = 0;
      return;
    }
    const scale = Math.min(1, distance / 0.7) * this.profile.speedMultiplier;
    this.command.moveX = (dx / distance) * scale;
    this.command.moveY = (dz / distance) * scale;
    this.command.sprintPressed = sprint && me.stamina > GameConfig.player.staminaMax * 0.25;
  }

  private faceTowards(me: PlayerState, target: Vec3, error = 0): void {
    const yaw =
      yawFromXZ(target.x - me.position.x, target.z - me.position.z) +
      (error > 0 ? this.rng.jitter(error) : 0);
    // The contract carries a world-space direction, not an angle.
    this.command.aimX = Math.sin(yaw);
    this.command.aimY = Math.cos(yaw);
  }

  /** Points the body at the spot on the goal this plan has picked out. */
  private aimAtGoal(me: PlayerState, ball: Vec3, attackZ: number): void {
    this.aimPoint.x = clamp(
      this.plan.aimOffsetX,
      -GameConfig.goal.width * 0.48,
      GameConfig.goal.width * 0.48,
    );
    this.aimPoint.y = 0;
    this.aimPoint.z = attackZ;
    this.faceForShot(me, ball, this.aimPoint, this.profile.aimError);
  }

  /**
   * Faces the goal — but never so far from the ball that the kick is refused.
   *
   * A strike only lands when the ball is inside the cone in front of the
   * player. Aiming purely at the goal looks right and misses: a ball off to
   * one side falls outside that cone, the release is swallowed, and the AI
   * runs through the ball without touching it. So the goal direction is
   * clamped to stay within the cone of the ball, which is also what a person
   * does — you have to be facing roughly where the ball is to hit it.
   */
  private faceForShot(me: PlayerState, ball: Vec3, goal: Vec3, error: number): void {
    const toGoal = yawFromXZ(goal.x - me.position.x, goal.z - me.position.z);
    const toBall = yawFromXZ(ball.x - me.position.x, ball.z - me.position.z);
    // A margin inside the cone, because the body is still turning when the
    // foot connects.
    const limit = GameConfig.kick.coneHalfAngle * 0.6;

    let delta = toGoal - toBall;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const yaw = toBall + clamp(delta, -limit, limit) + (error > 0 ? this.rng.jitter(error) : 0);
    this.command.aimX = Math.sin(yaw);
    this.command.aimY = Math.cos(yaw);
  }

  private maybeTackle(
    me: PlayerState,
    ball: Vec3,
    opponent: PlayerState | undefined,
    state: MatchState,
  ): void {
    if (!opponent) return;
    if (me.tackleCooldown > 0 || this.actionCooldown > 0) return;
    // A won tackle is a deliberate touch, so it obeys the same rule.
    if (!canPlayerTouch(state.touch, me.id)) return;
    const opponentHasBall =
      horizontalDistance(opponent.position, ball) <= GameConfig.ball.controlRadius * 1.3;
    if (!opponentHasBall) return;
    if (horizontalDistance(me.position, opponent.position) > GameConfig.tackle.range) return;
    if (!this.rng.chance(this.profile.tackleAggression)) return;
    this.command.tacklePressed = true;
    // One attempt, then a pause. Asking every tick is what made it twitch.
    this.actionCooldown = GameConfig.tackle.cooldownSeconds;
  }

  /** Slow, smooth noise so movement targets breathe instead of snapping. */
  private wander(): number {
    return Math.sin(this.wanderPhase) * this.wanderStrength;
  }

  /**
   * Picks a spot on the goal and a way to hit it.
   *
   * Most shots go at the net. Some go at the frame on purpose, because the
   * frame is worth two, three and five points and an opponent who never tries
   * for it is not playing the same game as the player. How often it tries is
   * a difficulty setting; so is how well it aims.
   */
  private makePlan(shootingRange: number): ShotPlan {
    const { goal } = GameConfig;
    const power = clamp(0.78 + this.rng.jitter(this.profile.powerJitter), 0.4, 1);
    const huntsFrame = this.rng.chance(this.profile.frameHuntChance);

    if (huntsFrame) {
      // The bar, or the corner where the bar meets a post. Both need height,
      // which is exactly what the lofted style is for.
      const corner = this.rng.chance(0.45);
      const side = this.rng.chance(0.5) ? 1 : -1;
      return {
        aimOffsetX: corner ? side * (goal.width / 2) : this.rng.range(-0.6, 0.6),
        aimHeight: this.rng.range(0.1, 0.45),
        power: Math.max(power, 0.82),
        style: 'normal',
        chargeSeconds: GameConfig.kick.chargeSeconds * 0.95,
      };
    }

    const spread = goal.width * 0.42;
    const lofts = this.rng.chance(this.profile.loftChance);
    return {
      aimOffsetX: this.rng.range(-spread, spread),
      aimHeight: lofts ? GameConfig.kick.highAim : this.rng.range(-0.9, -0.3),
      power,
      style: lofts ? 'lofted' : this.rng.chance(0.25) ? 'curled' : 'flat',
      chargeSeconds: GameConfig.kick.chargeSeconds * power * (shootingRange > 0 ? 1 : 1),
    };
  }
}

/** Above this ground speed a ball is worth intercepting rather than chasing. */
const INTERCEPT_SPEED = 3.5;

/** How long the AI keeps asking to release before giving up on the strike. */
const SHOT_WINDOW_SECONDS = 0.34;

/** States in which a charge is being built up and must survive a transition. */
const CHARGING_STATES: ReadonlySet<AIState> = new Set<AIState>([
  'Chase',
  'Intercept',
  'Attack',
  'PrepareShot',
]);
