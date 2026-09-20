/**
 * MatchEngine — the simulation.
 *
 * One fixed tick is: commands in -> player/ball forces -> physics step ->
 * contacts translated into scoring inputs -> rules -> serializable state out.
 * The renderer and the UI only ever read the resulting MatchState and events.
 */
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig, kindForGoalPart, type GoalPart } from '../config/GameConfig';
import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import { angleDelta, clamp, horizontalDistance, rotateTowards, yawFromXZ } from '../core/math';
import { BallBody } from '../entities/BallBody';
import { PlayerBody } from '../entities/PlayerBody';
import type { PlayerCommand } from '../input/PlayerCommand';
import { yawOf } from '../input/PlayerCommand';
import type { PhysicsWorld, RawCollision } from '../physics/PhysicsWorld';
import {
  advancePhases,
  applyScoreEvent,
  ballOutOfBounds,
  goalEntered,
  outcomeOf,
  resetForKickoff,
  resolveScoringTeam,
  startMatch,
} from './MatchRules';
import {
  attackingGoalZ,
  createMatchState,
  opponentOf,
  type MatchOutcome,
  type MatchState,
  type PlayerState,
  type ScoreEventRecord,
  type ShotRecord,
  type TeamId,
} from './MatchState';
import { ScoringSystem } from './ScoringSystem';

export interface MatchEventMap extends Record<string, unknown> {
  kick: { playerId: string; team: TeamId; power: number; lofted: boolean };
  /** A tackle attempt resolved, successfully or not. */
  tackle: { playerId: string; team: TeamId; success: boolean };
  /** The team in control of the ball changed (null = loose ball). */
  possession: { playerId: string | null; team: TeamId | null };
  touch: { playerId: string; team: TeamId };
  frameHit: { part: GoalPart; goal: TeamId; speed: number };
  wallHit: { speed: number };
  scored: ScoreEventRecord;
  kickoff: { team: TeamId };
  ballLive: { tick: number };
  matchEnd: { outcome: MatchOutcome };
}

interface ActiveShot {
  record: ShotRecord;
  startedAt: number;
}

const BALL_ID = 'ball';

/**
 * Who decides the score and the clock.
 *
 * `authoritative` is the whole game: rules, scoring and phases all run here.
 * `mirrored` is the online client: motion, kicks, tackles and possession still
 * run locally so the game feels immediate, but the score, the goal line, the
 * clock and the phases are taken from the server instead of being decided
 * twice. It is the one place in the simulation that knows about the network,
 * and it is a single switch rather than a check scattered through the tick.
 */
export type RulesAuthority = 'authoritative' | 'mirrored';

export interface MatchEngineOptions {
  seed?: number;
  rules?: RulesAuthority;
}

export class MatchEngine {
  readonly state: MatchState = createMatchState();
  readonly events = new EventBus<MatchEventMap>();
  readonly ball: BallBody;
  readonly players: PlayerBody[] = [];

  private readonly scoring = new ScoringSystem();
  private readonly commands = new Map<string, PlayerCommand>();
  private readonly rng: Rng;
  private activeShot: ActiveShot | null = null;
  private shotCounter = 0;
  private ballSpeedBeforeStep = 0;
  private possessionPlayerId: string | null = null;
  private readonly pendingKicks: { playerId: string; power: number }[] = [];
  private readonly animationTriggers = new Map<string, { kick: boolean; tackle: boolean }>();

  private rulesAuthority: RulesAuthority;

  constructor(
    scene: Scene,
    private readonly world: PhysicsWorld,
    options: MatchEngineOptions = {},
  ) {
    this.rulesAuthority = options.rules ?? 'authoritative';
    this.rng = new Rng(options.seed ?? 0x5741c6);
    this.ball = new BallBody(scene, world);
    for (const player of this.state.players) {
      this.players.push(new PlayerBody(scene, world, player.id, player.team, player.position));
    }
  }

  get rules(): RulesAuthority {
    return this.rulesAuthority;
  }

  /**
   * Switches who decides the score. The session sets this when a match starts,
   * so one engine serves both the offline game and the online client.
   */
  setRules(rules: RulesAuthority): void {
    this.rulesAuthority = rules;
    this.scoring.reset();
    this.activeShot = null;
  }

  get humanPlayerId(): string {
    return this.state.players.find((player) => player.isHuman)?.id ?? 'home-1';
  }

  get aiPlayerId(): string {
    return this.state.players.find((player) => !player.isHuman)?.id ?? 'away-1';
  }

  bodyFor(playerId: string): PlayerBody | undefined {
    return this.players.find((body) => body.id === playerId);
  }

  /** Resets the match and places everyone for the opening kickoff. */
  start(): void {
    startMatch(this.state);
    this.scoring.reset();
    this.activeShot = null;
    this.shotCounter = 0;
    this.commands.clear();
    this.pendingKicks.length = 0;
    this.possessionPlayerId = null;
    this.applyKickoffReset();
    this.events.emit('kickoff', { team: this.state.kickoffTeam });
  }

  /** Queues the command for one player for the next tick. */
  submitCommand(command: PlayerCommand): void {
    this.commands.set(command.playerId, command);
  }

  /** The player currently in control of the ball, if any. */
  get controllingPlayerId(): string | null {
    return this.possessionPlayerId;
  }

  /** Advances the simulation by exactly one fixed tick. */
  step(dt: number, tick: number): void {
    this.state.tick = tick;
    this.state.elapsed += dt;

    const live = this.state.phase === 'playing';

    for (const player of this.state.players) {
      this.applyCommand(player, dt, live);
    }

    if (live) {
      this.resolvePendingKicks(dt);
      this.applyBallControl(dt);
    } else {
      // Outside live play the ball is parked: no drift during the countdown.
      this.ball.setVelocity(0, 0, 0);
    }

    this.ballSpeedBeforeStep = this.ball.speed;
    const collisions = this.world.step(dt);
    this.ball.clampSpeed();

    this.processCollisions(collisions, live);

    if (this.rulesAuthority === 'authoritative') {
      if (live) {
        this.checkGoalLine();
        this.expireShot();
        this.recoverOutOfBounds();
      }

      for (const record of this.scoring.update(this.state.elapsed)) {
        if (this.state.phase !== 'playing') continue;
        applyScoreEvent(this.state, record);
        this.activeShot = null;
        this.events.emit('scored', record);
      }
      this.scoring.prune(this.state.elapsed);

      const result = advancePhases(this.state, dt);
      if (result.needsKickoffReset) {
        this.applyKickoffReset();
        this.events.emit('kickoff', { team: this.state.kickoffTeam });
      }
      if (result.ballBecameLive) {
        this.events.emit('ballLive', { tick });
      }
      if (result.matchEnded) {
        this.events.emit('matchEnd', { outcome: outcomeOf(this.state) });
      }
    }

    this.writeBackState();
  }

  /**
   * Hands the renderer the one-shot animation flags for a player and clears
   * them, so each kick or tackle plays exactly once. Simulation-free: the
   * server never calls it, and calling it can never change the outcome.
   */
  consumeAnimationTriggers(playerId: string): { kick: boolean; tackle: boolean } {
    const triggers = this.animationTriggers.get(playerId);
    if (!triggers) return { kick: false, tackle: false };
    const consumed = { kick: triggers.kick, tackle: triggers.tackle };
    triggers.kick = false;
    triggers.tackle = false;
    return consumed;
  }

  /** Flags a one-shot animation. Cleared once the renderer has consumed it. */
  private trigger(playerId: string, kind: 'kick' | 'tackle'): void {
    const existing = this.animationTriggers.get(playerId);
    if (existing) existing[kind] = true;
    else this.animationTriggers.set(playerId, { kick: kind === 'kick', tackle: kind === 'tackle' });
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  private applyCommand(player: PlayerState, dt: number, live: boolean): void {
    const body = this.bodyFor(player.id);
    if (!body) return;
    const command = this.commands.get(player.id);

    player.kickCooldown = Math.max(0, player.kickCooldown - dt);
    player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
    player.stunTimer = Math.max(0, player.stunTimer - dt);

    if (!command || !live) {
      body.setHorizontalVelocity(0, 0);
      player.sprinting = false;
      player.charging = false;
      player.kickCharge = 0;
      player.stamina = Math.min(
        GameConfig.player.staminaMax,
        player.stamina + GameConfig.player.staminaRegenPerSecond * dt,
      );
      return;
    }

    // The shot type belongs to the player, not to the device: each player keeps
    // their own choice, and a controller only ever asks for a swap.
    if (command.lobToggle) player.lofted = !player.lofted;

    const config = GameConfig.player;
    const moveLength = Math.hypot(command.moveX, command.moveY);
    const wantsSprint =
      command.sprintPressed && moveLength > 0.1 && player.stamina > config.staminaSprintFloor;

    player.sprinting = wantsSprint;
    player.stamina = clamp(
      player.stamina +
        (wantsSprint ? -config.staminaDrainPerSecond : config.staminaRegenPerSecond) * dt,
      0,
      config.staminaMax,
    );

    // Charging a shot slows the player down: a real trade-off, not a free action.
    const chargeSlowdown = command.shootHeld ? GameConfig.kick.chargeMoveScale : 1;
    const targetSpeed = (wantsSprint ? config.sprintSpeed : config.walkSpeed) * chargeSlowdown;
    const scaled = targetSpeed * Math.min(1, moveLength);
    const desiredX = moveLength > 0 ? (command.moveX / moveLength) * scaled : 0;
    const desiredZ = moveLength > 0 ? (command.moveY / moveLength) * scaled : 0;

    const velocity = player.velocity;
    const rate = moveLength > 0.05 ? config.acceleration : config.deceleration;
    const nextX = approach(velocity.x, desiredX, rate * dt);
    const nextZ = approach(velocity.z, desiredZ, rate * dt);
    body.setHorizontalVelocity(nextX, nextZ);

    // Facing: an explicit aim wins, otherwise follow the movement, otherwise hold.
    const aimLength = Math.hypot(command.aimX, command.aimY);
    const facingTarget =
      aimLength > 0.05
        ? yawOf(command.aimX, command.aimY)
        : moveLength > 0.05
          ? yawOf(command.moveX, command.moveY)
          : player.facing;
    player.facing = rotateTowards(player.facing, facingTarget, config.turnRate * dt);

    // Kick charge. A short wind-up keeps the very first frames from firing a
    // full-power shot, so a tap is always a gentle pass.
    if (command.shootHeld && player.kickCooldown <= 0) {
      player.charging = true;
      player.kickCharge = Math.min(1, player.kickCharge + dt / GameConfig.kick.chargeSeconds);
    } else if (!command.shootHeld) {
      player.charging = false;
    }

    if (command.shootReleased) {
      this.tryKick(player);
    }
    if (command.tacklePressed) {
      this.tryTackle(player);
    }
  }

  /**
   * Validates the shot at the moment of release and schedules the strike.
   * The short wind-up is what makes a kick readable; the impulse lands when the
   * foot does, so the animation and the physics always agree.
   */
  private tryKick(player: PlayerState): void {
    const power = Math.max(GameConfig.kick.minPower, player.kickCharge);
    player.kickCharge = 0;
    player.charging = false;

    if (player.kickCooldown > 0 || player.stunTimer > 0) return;
    if (!this.ballIsKickable(player)) return;

    this.pendingKicks.push({ playerId: player.id, power });
    player.windUpTimer = GameConfig.kick.windUpSeconds;
    player.kickCooldown = GameConfig.kick.cooldownSeconds + GameConfig.kick.windUpSeconds;
  }

  /** True when the ball is close enough and inside the cone in front of the player. */
  private ballIsKickable(player: PlayerState): boolean {
    const ball = this.state.ball.position;
    if (horizontalDistance(player.position, ball) > GameConfig.kick.range) return false;
    const toBall = yawFromXZ(ball.x - player.position.x, ball.z - player.position.z);
    let angle = Math.abs(toBall - player.facing) % (Math.PI * 2);
    if (angle > Math.PI) angle = Math.PI * 2 - angle;
    return angle <= GameConfig.kick.coneHalfAngle;
  }

  /** Runs the scheduled strikes whose wind-up has elapsed. */
  private resolvePendingKicks(dt: number): void {
    if (this.pendingKicks.length === 0) return;
    for (let i = this.pendingKicks.length - 1; i >= 0; i -= 1) {
      const pending = this.pendingKicks[i];
      if (!pending) continue;
      const player = this.state.players.find((entry) => entry.id === pending.playerId);
      if (!player) {
        this.pendingKicks.splice(i, 1);
        continue;
      }
      player.windUpTimer = Math.max(0, player.windUpTimer - dt);
      if (player.windUpTimer > 0) continue;
      this.pendingKicks.splice(i, 1);
      this.strikeBall(player, pending.power);
    }
  }

  private strikeBall(player: PlayerState, power: number): void {
    const facing = this.assistedShotYaw(player);
    const magnitude = GameConfig.kick.maxImpulse * power;
    const lift = player.lofted ? GameConfig.kick.loftRatio : GameConfig.kick.flatLift;
    const dirX = Math.sin(facing);
    const dirZ = Math.cos(facing);

    this.ball.applyImpulse(dirX * magnitude, magnitude * lift, dirZ * magnitude);
    this.ball.clampSpeed();
    this.shotCounter += 1;
    this.activeShot = {
      record: {
        shotId: `shot-${this.shotCounter}`,
        playerId: player.id,
        teamId: player.team,
        originatingTick: this.state.tick,
        shotType: player.lofted ? 'lob' : 'flat',
        power,
      },
      startedAt: this.state.elapsed,
    };
    this.state.ball.lastTouchBy = player.id;
    this.state.ball.lastTouchTeam = player.team;
    this.state.ball.lastTouchTick = this.state.tick;
    this.possessionPlayerId = null;

    this.trigger(player.id, 'kick');
    this.events.emit('kick', {
      playerId: player.id,
      team: player.team,
      power,
      lofted: player.lofted,
    });
  }

  private tryTackle(player: PlayerState): void {
    if (player.tackleCooldown > 0 || player.stunTimer > 0) return;

    const opponent = this.state.players.find((other) => other.team !== player.team);
    const ball = this.state.ball.position;
    const inRange = horizontalDistance(player.position, ball) <= GameConfig.tackle.range;
    const success = inRange && this.rng.chance(GameConfig.tackle.successChance);
    // Missing costs more than connecting, which is what stops tackle spam.
    player.tackleCooldown = success
      ? GameConfig.tackle.cooldownSeconds
      : GameConfig.tackle.missCooldownSeconds;

    if (success) {
      const dirX = Math.sin(player.facing);
      const dirZ = Math.cos(player.facing);
      this.ball.applyImpulse(
        dirX * GameConfig.tackle.ballImpulse,
        GameConfig.tackle.ballImpulse * 0.12,
        dirZ * GameConfig.tackle.ballImpulse,
      );
      if (
        opponent &&
        horizontalDistance(opponent.position, ball) <= GameConfig.ball.controlRadius * 1.4
      ) {
        opponent.stunTimer = GameConfig.tackle.stunSeconds;
      }
      this.state.ball.lastTouchBy = player.id;
      this.state.ball.lastTouchTeam = player.team;
      this.invalidateShot();
    }
    this.trigger(player.id, 'tackle');
    this.events.emit('tackle', { playerId: player.id, team: player.team, success });
  }

  /**
   * Nudges a shot towards the mouth of the goal being attacked.
   * The strength lives on the player as a plain number, so the simulation never
   * learns whether a pad, a thumb or a keyboard produced the shot.
   */
  private assistedShotYaw(player: PlayerState): number {
    const strength = clamp(player.aimAssist, 0, 1);
    if (strength <= 0) return player.facing;

    const goalZ = attackingGoalZ(player.team);
    const ball = this.state.ball.position;
    const distance = Math.hypot(ball.x - 0, goalZ - ball.z);
    if (distance > GameConfig.aimAssist.range) return player.facing;

    // Aim at the nearest point inside the posts rather than the exact centre,
    // so the assist never fights a deliberate shot across the goal.
    const halfMouth = GameConfig.goal.width * 0.36;
    const targetX = clamp(ball.x, -halfMouth, halfMouth);
    const idealYaw = yawFromXZ(targetX - player.position.x, goalZ - player.position.z);

    const maxCorrection = GameConfig.aimAssist.maxAngle * strength;
    const delta = angleDelta(player.facing, idealYaw);
    return player.facing + clamp(delta, -maxCorrection, maxCorrection);
  }

  // ── Ball ────────────────────────────────────────────────────────────────────

  /** Light steering while the ball is close: control without gluing it to the foot. */
  private applyBallControl(dt: number): void {
    const ball = this.state.ball;
    let closest: PlayerState | null = null;
    let closestDistance = Infinity;

    for (const player of this.state.players) {
      const distance = horizontalDistance(player.position, ball.position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = player;
      }
    }

    if (!closest || closestDistance > GameConfig.ball.controlRadius || closest.stunTimer > 0) {
      if (this.possessionPlayerId !== null) {
        this.possessionPlayerId = null;
        this.events.emit('possession', { playerId: null, team: null });
      }
      return;
    }

    if (this.possessionPlayerId !== closest.id) {
      this.possessionPlayerId = closest.id;
      this.events.emit('possession', { playerId: closest.id, team: closest.team });
    }

    if (ball.lastTouchBy !== closest.id) {
      ball.lastTouchBy = closest.id;
      ball.lastTouchTeam = closest.team;
      ball.lastTouchTick = this.state.tick;
      this.events.emit('touch', { playerId: closest.id, team: closest.team });
    }
    // A touch by any player ends the previous shot, so a rebound cannot re-score.
    if (this.activeShot && this.state.elapsed - this.activeShot.startedAt > 0.2) {
      this.invalidateShot();
    }

    const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
    if (speed > GameConfig.ball.dribbleMaxSpeed) return;

    // Control assist: a weak pull back towards the controlling player once the
    // ball drifts to the edge of the control radius. Weak on purpose — the ball
    // must never look glued to the foot.
    const falloffStart = GameConfig.ball.controlRadius * GameConfig.ball.assistFalloff;
    if (closestDistance > falloffStart) {
      const pull =
        ((closestDistance - falloffStart) / (GameConfig.ball.controlRadius - falloffStart)) *
        GameConfig.ball.assistStrength *
        dt;
      const toPlayerX = (closest.position.x - ball.position.x) / closestDistance;
      const toPlayerZ = (closest.position.z - ball.position.z) / closestDistance;
      this.ball.setVelocity(
        ball.velocity.x + toPlayerX * pull,
        ball.velocity.y,
        ball.velocity.z + toPlayerZ * pull,
      );
    }

    const playerSpeed = Math.hypot(closest.velocity.x, closest.velocity.z);
    if (playerSpeed < 0.35) return;

    const targetSpeed = Math.min(playerSpeed * 1.18, GameConfig.ball.dribbleMaxSpeed);
    const targetX = Math.sin(closest.facing) * targetSpeed;
    const targetZ = Math.cos(closest.facing) * targetSpeed;
    const step = GameConfig.ball.dribbleForce * dt;

    this.ball.setVelocity(
      approach(ball.velocity.x, targetX, step),
      ball.velocity.y,
      approach(ball.velocity.z, targetZ, step),
    );
  }

  private processCollisions(collisions: readonly RawCollision[], live: boolean): void {
    for (const collision of collisions) {
      const ballSide = collision.a.kind === 'ball' ? collision.b : collision.a;
      const isBall = collision.a.kind === 'ball' || collision.b.kind === 'ball';
      if (!isBall) continue;

      if (ballSide.kind === 'wall') {
        if (this.ballSpeedBeforeStep > 3) {
          this.events.emit('wallHit', { speed: this.ballSpeedBeforeStep });
        }
        continue;
      }

      if (ballSide.kind === 'goalPart' && live) {
        const kind = kindForGoalPart(ballSide.part);
        const shooterTeam = this.activeShot?.record.teamId ?? null;
        const team =
          shooterTeam === null ? null : resolveScoringTeam(ballSide.goal, shooterTeam, false);

        this.events.emit('frameHit', {
          part: ballSide.part,
          goal: ballSide.goal,
          speed: this.ballSpeedBeforeStep,
        });

        if (this.rulesAuthority !== 'authoritative') continue;
        this.scoring.registerContact({
          shot: this.activeShot?.record ?? null,
          kind,
          team,
          ownGoal: false,
          colliderId: `${ballSide.goal}:${ballSide.part}`,
          ballId: BALL_ID,
          speed: this.ballSpeedBeforeStep,
          time: this.state.elapsed,
          tick: this.state.tick,
        });
      }
    }
  }

  private checkGoalLine(): void {
    const owner = goalEntered(this.state.ball.position);
    if (!owner) return;

    // A goal needs a player touch behind it, but not necessarily a live shot:
    // a ball that rolls over the line after a shot still counts.
    const shot = this.activeShot?.record ?? this.rollingShot();
    if (!shot) return;

    // Whoever owns the net concedes; an own goal is worth a single goal only,
    // which is exactly what the 'goal' kind is worth.
    const ownGoal = shot.teamId === owner;

    this.scoring.registerContact({
      shot,
      kind: 'goal',
      team: resolveScoringTeam(owner, opponentOf(owner), true),
      ownGoal,
      colliderId: `${owner}:goalLine`,
      ballId: BALL_ID,
      speed: Math.max(this.ballSpeedBeforeStep, GameConfig.scoring.minGoalSpeed),
      time: this.state.elapsed,
      tick: this.state.tick,
    });
  }

  /** Builds a shot record for a goal that came from a loose ball. */
  private rollingShot(): ShotRecord | null {
    const { lastTouchBy, lastTouchTeam, lastTouchTick } = this.state.ball;
    if (!lastTouchBy || !lastTouchTeam) return null;
    return {
      shotId: `roll-${lastTouchBy}-${lastTouchTick}`,
      playerId: lastTouchBy,
      teamId: lastTouchTeam,
      originatingTick: lastTouchTick,
      shotType: 'flat',
      power: 0,
    };
  }

  private expireShot(): void {
    if (!this.activeShot) return;
    if (this.state.elapsed - this.activeShot.startedAt > GameConfig.scoring.shotLifetimeSeconds) {
      this.invalidateShot();
    }
  }

  private invalidateShot(): void {
    this.activeShot = null;
  }

  private recoverOutOfBounds(): void {
    if (!ballOutOfBounds(this.state.ball.position)) return;
    this.ball.reset({ x: 0, y: GameConfig.ball.radius + 0.2, z: 0 });
    this.invalidateShot();
  }

  // ── State sync ──────────────────────────────────────────────────────────────

  private applyKickoffReset(): void {
    resetForKickoff(this.state);
    this.ball.reset(this.state.ball.position);
    for (const player of this.state.players) {
      this.bodyFor(player.id)?.reset(player.position);
    }
    this.scoring.reset();
    this.invalidateShot();
    this.commands.clear();
    this.pendingKicks.length = 0;
    this.possessionPlayerId = null;
  }

  private writeBackState(): void {
    this.ball.writeToState(this.state.ball);
    for (const player of this.state.players) {
      this.bodyFor(player.id)?.writeToState(player);
    }
  }
}

/** Moves `current` towards `target` by at most `maxDelta`. */
function approach(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}
