/**
 * AIController — a finite state machine that plays street football.
 *
 * It reads the same MatchState the renderer reads and emits the same
 * PlayerCommand a human produces. Nothing here touches the engine, and no
 * external AI service is involved: it is plain, deterministic logic plus a
 * seeded RNG that keeps every possession slightly different.
 */
import { GameConfig, type Difficulty, type DifficultyProfile } from '../config/GameConfig';
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

export type AIState =
  'Kickoff' | 'ChaseBall' | 'ControlBall' | 'Attack' | 'Defend' | 'Aim' | 'Shoot' | 'Recover';

interface ShotPlan {
  /** Lateral offset on the goal line the AI aims at, in metres. */
  aimOffsetX: number;
  /** Target charge, 0..1. */
  power: number;
  lofted: boolean;
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
  private plan: ShotPlan;
  private readonly command: PlayerCommand;
  private profile: DifficultyProfile;
  /** Per-possession personality: small, persistent biases so it never feels scripted. */
  private wanderPhase: number;
  private wanderStrength: number;

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
    this.plan = this.makePlan();
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
    this.plan = this.makePlan();
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
    this.wanderPhase += dt * 0.9;

    if (state.phase === 'celebration' || state.phase === 'finished' || state.phase === 'idle') {
      this.transition('Recover');
      return this.command;
    }

    if (this.reactionTimer <= 0) {
      this.reactionTimer = this.profile.reactionTime;
      this.transition(this.decide(state, me, opponent));
    }

    this.act(state, me, opponent, dt);
    return this.command;
  }

  // ── Decision ────────────────────────────────────────────────────────────────

  private decide(state: MatchState, me: PlayerState, opponent: PlayerState | undefined): AIState {
    if (state.phase === 'kickoff') return 'Kickoff';
    if (this.state === 'Shoot' && this.stateTime < 0.35) return 'Shoot';
    if (this.state === 'Recover' && this.stateTime < 0.5) return 'Recover';

    const ball = state.ball.position;
    const myDistance = horizontalDistance(me.position, ball);
    const opponentDistance = opponent ? horizontalDistance(opponent.position, ball) : Infinity;
    const iAmClosest = myDistance <= opponentDistance;
    const inControl = myDistance <= GameConfig.ball.controlRadius * 1.25;

    if (inControl) {
      const goalZ = attackingGoalZ(this.team);
      const distanceToGoal = Math.hypot(ball.x, goalZ - ball.z);
      const angleOk = Math.abs(ball.x) < GameConfig.field.width * 0.42;
      if (distanceToGoal < this.profile.shootingRange && angleOk) {
        return this.state === 'Aim' && this.chargeTime >= this.plan.chargeSeconds ? 'Shoot' : 'Aim';
      }
      return this.rng.chance(0.75) ? 'Attack' : 'ControlBall';
    }

    if (iAmClosest || opponentDistance > GameConfig.ball.controlRadius * 1.6) {
      return 'ChaseBall';
    }
    return 'Defend';
  }

  private transition(next: AIState): void {
    if (next === this.state) return;
    if (this.state === 'Aim' && next !== 'Shoot') this.chargeTime = 0;
    if (next === 'Aim') {
      this.plan = this.makePlan();
      this.chargeTime = 0;
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

      case 'ChaseBall': {
        // Aim slightly behind the ball so the AI arrives facing the right way.
        const approach = {
          x: ball.x - Math.sign(attackZ) * 0 + this.wander() * 0.6,
          y: 0,
          z: ball.z - Math.sign(attackZ) * 0.55,
        };
        const far = horizontalDistance(me.position, ball) > 4.5;
        this.moveTowards(me, approach, far);
        this.faceTowards(me, ball);
        this.maybeTackle(me, ball, opponent);
        break;
      }

      case 'ControlBall': {
        // Settle on the ball, small lateral drift to shake the defender.
        const target = {
          x: ball.x + this.wander() * 1.4,
          y: 0,
          z: ball.z + Math.sign(attackZ) * 0.4,
        };
        this.moveTowards(me, target, false);
        this.faceTowards(me, { x: 0, y: 0, z: attackZ });
        break;
      }

      case 'Attack': {
        // Carry the ball towards the goal, drifting around the opponent.
        const avoid = opponent ? clamp(me.position.x - opponent.position.x, -1, 1) : 0;
        const target = {
          x: clamp(
            ball.x + avoid * 2.2 + this.wander() * 1.6,
            -GameConfig.field.width * 0.4,
            GameConfig.field.width * 0.4,
          ),
          y: 0,
          z: ball.z + Math.sign(attackZ) * 2.4,
        };
        this.moveTowards(me, target, me.stamina > 40);
        this.faceTowards(me, { x: target.x, y: 0, z: attackZ });
        break;
      }

      case 'Defend': {
        // Stand on the line between the ball and the goal being defended.
        const blend = 0.42 + this.wander() * 0.1;
        const target = {
          x: ball.x * (1 - blend) + this.wander() * 0.8,
          y: 0,
          z: ball.z + (defendZ - ball.z) * blend,
        };
        this.moveTowards(me, target, horizontalDistance(me.position, target) > 3.5);
        this.faceTowards(me, ball);
        this.maybeTackle(me, ball, opponent);
        break;
      }

      case 'Aim': {
        this.chargeTime += dt;
        const target = { x: ball.x, y: 0, z: ball.z + Math.sign(attackZ) * 0.15 };
        this.moveTowards(me, target, false);

        const aimX = clamp(
          this.plan.aimOffsetX,
          -GameConfig.goal.width * 0.45,
          GameConfig.goal.width * 0.45,
        );
        this.faceTowards(me, { x: aimX, y: 0, z: attackZ }, this.profile.aimError);
        this.command.shootHeld = true;
        this.command.shootPressed = this.chargeTime <= dt * 1.5;
        this.command.lobToggle = this.wantsLobToggle(me);
        break;
      }

      case 'Shoot': {
        this.command.shootHeld = false;
        this.command.shootReleased = this.stateTime <= dt * 1.5;
        const aimX = this.plan.aimOffsetX;
        this.faceTowards(me, { x: aimX, y: 0, z: attackZ }, this.profile.aimError);
        if (this.stateTime > 0.3) this.transition('Recover');
        break;
      }

      case 'Recover': {
        const home = { x: this.wander() * 2.5, y: 0, z: defendZ * 0.3 };
        this.moveTowards(me, home, false);
        this.faceTowards(me, ball);
        this.chargeTime = 0;
        break;
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

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

  private maybeTackle(me: PlayerState, ball: Vec3, opponent: PlayerState | undefined): void {
    if (!opponent) return;
    if (me.tackleCooldown > 0) return;
    const opponentHasBall =
      horizontalDistance(opponent.position, ball) <= GameConfig.ball.controlRadius * 1.3;
    if (!opponentHasBall) return;
    if (horizontalDistance(me.position, opponent.position) > GameConfig.tackle.range) return;
    this.command.tacklePressed = this.rng.chance(this.profile.tackleAggression);
  }

  /**
   * Asks for a shot-type change only when the player's current type differs from
   * the plan, since the command carries a toggle request rather than a state.
   */
  private wantsLobToggle(me: PlayerState): boolean {
    return me.lofted !== this.plan.lofted && this.chargeTime <= 0.08;
  }

  /** Slow, smooth noise so movement targets breathe instead of snapping. */
  private wander(): number {
    return Math.sin(this.wanderPhase) * this.wanderStrength;
  }

  private makePlan(): ShotPlan {
    const spread = GameConfig.goal.width * 0.42;
    const power = clamp(0.78 + this.rng.jitter(this.profile.powerJitter), 0.4, 1);
    return {
      aimOffsetX: this.rng.range(-spread, spread),
      power,
      lofted: this.rng.chance(0.22),
      chargeSeconds: GameConfig.kick.chargeSeconds * power,
    };
  }
}
