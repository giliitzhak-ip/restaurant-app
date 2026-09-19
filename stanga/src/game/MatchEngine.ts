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
import { clamp, horizontalDistance, rotateTowards, yawFromXZ } from '../core/math';
import { BallEntity } from '../entities/BallEntity';
import { PlayerEntity } from '../entities/PlayerEntity';
import type { InputCommand } from '../input/Command';
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
  createMatchState,
  opponentOf,
  type MatchOutcome,
  type MatchState,
  type PlayerState,
  type ScoreEventRecord,
  type TeamId,
} from './MatchState';
import { ScoringSystem } from './ScoringSystem';

export interface MatchEventMap extends Record<string, unknown> {
  kick: { playerId: string; team: TeamId; power: number; lofted: boolean };
  touch: { playerId: string; team: TeamId };
  frameHit: { part: GoalPart; goal: TeamId; speed: number };
  wallHit: { speed: number };
  scored: ScoreEventRecord;
  kickoff: { team: TeamId };
  ballLive: { tick: number };
  matchEnd: { outcome: MatchOutcome };
}

interface ActiveShot {
  id: string;
  team: TeamId;
  playerId: string;
  startedAt: number;
}

const BALL_ID = 'ball';

export class MatchEngine {
  readonly state: MatchState = createMatchState();
  readonly events = new EventBus<MatchEventMap>();
  readonly ball: BallEntity;
  readonly players: PlayerEntity[] = [];

  private readonly scoring = new ScoringSystem();
  private readonly commands = new Map<string, InputCommand>();
  private readonly rng: Rng;
  private activeShot: ActiveShot | null = null;
  private shotCounter = 0;
  private ballSpeedBeforeStep = 0;

  constructor(
    scene: Scene,
    private readonly world: PhysicsWorld,
    seed = 0x5741c6,
  ) {
    this.rng = new Rng(seed);
    this.ball = new BallEntity(scene, world);
    for (const player of this.state.players) {
      this.players.push(
        new PlayerEntity(scene, world, player.id, player.team, player.isHuman, player.position),
      );
    }
  }

  get humanPlayerId(): string {
    return this.state.players.find((player) => player.isHuman)?.id ?? 'home-1';
  }

  get aiPlayerId(): string {
    return this.state.players.find((player) => !player.isHuman)?.id ?? 'away-1';
  }

  entityFor(playerId: string): PlayerEntity | undefined {
    return this.players.find((entity) => entity.id === playerId);
  }

  /** Resets the match and places everyone for the opening kickoff. */
  start(): void {
    startMatch(this.state);
    this.scoring.reset();
    this.activeShot = null;
    this.shotCounter = 0;
    this.commands.clear();
    this.applyKickoffReset();
    this.events.emit('kickoff', { team: this.state.kickoffTeam });
  }

  /** Queues the command for one player for the next tick. */
  submitCommand(command: InputCommand): void {
    this.commands.set(command.playerId, command);
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
      this.applyBallControl(dt);
    } else {
      // Outside live play the ball is parked: no drift during the countdown.
      this.ball.setVelocity(0, 0, 0);
    }

    this.ballSpeedBeforeStep = this.ball.speed;
    const collisions = this.world.step(dt);
    this.ball.clampSpeed();

    this.processCollisions(collisions, live);
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

    this.writeBackState();
  }

  /** Render-rate visual update. Never touches physics or rules. */
  updateVisuals(dt: number): void {
    for (const player of this.state.players) {
      this.entityFor(player.id)?.updateVisual(player, dt);
    }
  }

  // ── Commands ────────────────────────────────────────────────────────────────

  private applyCommand(player: PlayerState, dt: number, live: boolean): void {
    const entity = this.entityFor(player.id);
    if (!entity) return;
    const command = this.commands.get(player.id);

    player.kickCooldown = Math.max(0, player.kickCooldown - dt);
    player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
    player.stunTimer = Math.max(0, player.stunTimer - dt);

    if (!command || !live) {
      entity.setHorizontalVelocity(0, 0);
      player.sprinting = false;
      player.charging = false;
      player.kickCharge = 0;
      player.stamina = Math.min(
        GameConfig.player.staminaMax,
        player.stamina + GameConfig.player.staminaRegenPerSecond * dt,
      );
      return;
    }

    const config = GameConfig.player;
    const moveLength = Math.hypot(command.moveX, command.moveZ);
    const wantsSprint =
      command.sprint && moveLength > 0.1 && player.stamina > config.staminaSprintFloor;

    player.sprinting = wantsSprint;
    player.stamina = clamp(
      player.stamina +
        (wantsSprint ? -config.staminaDrainPerSecond : config.staminaRegenPerSecond) * dt,
      0,
      config.staminaMax,
    );

    // Charging a shot slows the player down: a real trade-off, not a free action.
    const chargeSlowdown = command.chargeKick ? 0.62 : 1;
    const targetSpeed = (wantsSprint ? config.sprintSpeed : config.walkSpeed) * chargeSlowdown;
    const desiredX =
      moveLength > 0 ? (command.moveX / moveLength) * targetSpeed * Math.min(1, moveLength) : 0;
    const desiredZ =
      moveLength > 0 ? (command.moveZ / moveLength) * targetSpeed * Math.min(1, moveLength) : 0;

    const velocity = player.velocity;
    const rate = moveLength > 0.05 ? config.acceleration : config.deceleration;
    const nextX = approach(velocity.x, desiredX, rate * dt);
    const nextZ = approach(velocity.z, desiredZ, rate * dt);
    entity.setHorizontalVelocity(nextX, nextZ);

    // Facing: while charging, the aim wins; otherwise follow the movement.
    const facingTarget =
      command.chargeKick || moveLength <= 0.05
        ? command.aimYaw
        : yawFromXZ(command.moveX, command.moveZ);
    player.facing = rotateTowards(player.facing, facingTarget, config.turnRate * dt);

    // Kick charge.
    if (command.chargeKick && player.kickCooldown <= 0) {
      player.charging = true;
      player.kickCharge = Math.min(1, player.kickCharge + dt / GameConfig.kick.chargeSeconds);
    } else if (!command.chargeKick) {
      player.charging = false;
    }
    player.lofted = command.lofted;

    if (command.releaseKick) {
      this.tryKick(player);
    }
    if (command.tackle) {
      this.tryTackle(player);
    }
  }

  private tryKick(player: PlayerState): void {
    const power = Math.max(GameConfig.kick.minPower, player.kickCharge);
    player.kickCharge = 0;
    player.charging = false;

    if (player.kickCooldown > 0 || player.stunTimer > 0) return;

    const ball = this.state.ball.position;
    const distance = horizontalDistance(player.position, ball);
    if (distance > GameConfig.kick.range) return;

    // The ball must be in the cone in front of the player.
    const toBall = yawFromXZ(ball.x - player.position.x, ball.z - player.position.z);
    let angle = Math.abs(toBall - player.facing) % (Math.PI * 2);
    if (angle > Math.PI) angle = Math.PI * 2 - angle;
    if (angle > GameConfig.kick.coneHalfAngle) return;

    const magnitude = GameConfig.kick.maxImpulse * power;
    const lift = player.lofted ? GameConfig.kick.loftRatio : GameConfig.kick.flatLift;
    const dirX = Math.sin(player.facing);
    const dirZ = Math.cos(player.facing);

    this.ball.applyImpulse(dirX * magnitude, magnitude * lift, dirZ * magnitude);
    this.ball.clampSpeed();

    player.kickCooldown = GameConfig.kick.cooldownSeconds;
    this.shotCounter += 1;
    this.activeShot = {
      id: `shot-${this.shotCounter}`,
      team: player.team,
      playerId: player.id,
      startedAt: this.state.elapsed,
    };
    this.state.ball.lastTouchBy = player.id;
    this.state.ball.lastTouchTeam = player.team;
    this.state.ball.lastTouchTick = this.state.tick;

    this.events.emit('kick', {
      playerId: player.id,
      team: player.team,
      power,
      lofted: player.lofted,
    });
  }

  private tryTackle(player: PlayerState): void {
    if (player.tackleCooldown > 0 || player.stunTimer > 0) return;
    player.tackleCooldown = GameConfig.tackle.cooldownSeconds;

    const opponent = this.state.players.find((other) => other.team !== player.team);
    const ball = this.state.ball.position;
    const inRange = horizontalDistance(player.position, ball) <= GameConfig.tackle.range;
    const success = inRange && this.rng.chance(GameConfig.tackle.successChance);

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

    if (!closest || closestDistance > GameConfig.ball.controlRadius) return;
    if (closest.stunTimer > 0) return;

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
        const shooterTeam = this.activeShot?.team ?? null;
        const team =
          shooterTeam === null ? null : resolveScoringTeam(ballSide.goal, shooterTeam, false);

        this.events.emit('frameHit', {
          part: ballSide.part,
          goal: ballSide.goal,
          speed: this.ballSpeedBeforeStep,
        });

        this.scoring.registerContact({
          shotId: this.activeShot?.id ?? null,
          kind,
          team,
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
    const shotId = this.activeShot?.id ?? this.rollingShotId();
    if (!shotId) return;

    this.scoring.registerContact({
      shotId,
      kind: 'goal',
      team: resolveScoringTeam(owner, opponentOf(owner), true),
      colliderId: `${owner}:goalLine`,
      ballId: BALL_ID,
      speed: Math.max(this.ballSpeedBeforeStep, GameConfig.scoring.minGoalSpeed),
      time: this.state.elapsed,
      tick: this.state.tick,
    });
  }

  /** Identifies a goal that came from a loose ball, keyed on the last touch. */
  private rollingShotId(): string | null {
    const { lastTouchBy, lastTouchTick } = this.state.ball;
    return lastTouchBy ? `roll-${lastTouchBy}-${lastTouchTick}` : null;
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
      this.entityFor(player.id)?.reset(player.position, player.facing);
    }
    this.scoring.reset();
    this.invalidateShot();
    this.commands.clear();
  }

  private writeBackState(): void {
    this.ball.writeToState(this.state.ball);
    for (const player of this.state.players) {
      this.entityFor(player.id)?.writeToState(player);
    }
  }
}

/** Moves `current` towards `target` by at most `maxDelta`. */
function approach(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}
