/**
 * MatchEngine — the simulation.
 *
 * One fixed tick is: commands in -> player/ball forces -> physics step ->
 * contacts translated into scoring inputs -> rules -> serializable state out.
 * The renderer and the UI only ever read the resulting MatchState and events.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig, kindForGoalPart, type GoalPart } from '../config/GameConfig';
import { EventBus } from '../core/EventBus';
import { Rng } from '../core/Rng';
import { angleDelta, clamp, horizontalDistance, rotateTowards, yawFromXZ } from '../core/math';
import { BallBody } from '../entities/BallBody';
import { PlayerBody } from '../entities/PlayerBody';
import type { PlayerCommand } from '../input/PlayerCommand';
import { yawOf, type ShotProfile } from '../input/PlayerCommand';
import type { PhysicsWorld, RawCollision } from '../physics/PhysicsWorld';
import {
  advancePhases,
  applyScoreEvent,
  applyTouchViolation,
  ballOutOfBounds,
  deadBallRestart,
  goalEntered,
  outcomeOf,
  resetForKickoff,
  resolveScoringTeam,
  startMatch,
} from './MatchRules';
import {
  attackingGoalZ,
  createMatchState,
  createPlayerStats,
  opponentOf,
  type MatchOutcome,
  type MatchState,
  type PlayerState,
  type PlayerStats,
  type ScoreEventRecord,
  type ShotRecord,
  type TeamId,
  type ViolationRecord,
} from './MatchState';
import { findAssist } from './Attribution';
import { ONE_VS_ONE_ROSTER, type MatchRoster } from './MatchRoster';
import { airDragFactor, magnusAcceleration, rollingFactor } from './BallFlight';
import { resolveShot, type ResolvedShot } from './ShotResolver';
import { TouchRuleEngine, type TouchOutcome } from './TouchRuleEngine';
import { ScoringSystem } from './ScoringSystem';

export interface MatchEventMap extends Record<string, unknown> {
  kick: {
    playerId: string;
    team: TeamId;
    power: number;
    lofted: boolean;
    profile: ShotProfile;
  };
  /** The ball sat still too long, so the touch rule let everyone back in. */
  turnReopened: { tick: number };
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
  /** The line-up was replaced; every view built from it is now stale. */
  rosterChanged: { roster: MatchRoster };
  /** The touch rule was broken; the ball goes the other way. */
  violation: ViolationRecord;
  /** A pass was played to a team-mate the server chose. */
  pass: { playerId: string; team: TeamId; targetId: string; through: boolean };
  /** The ball was flicked up; `count` is the length of the aerial chain. */
  juggle: { playerId: string; team: TeamId; count: number };
}

/** A strike waiting for its wind-up to finish. A pass carries its target. */
interface PendingKick {
  playerId: string;
  power: number;
  /** A short press: a soft ball along the ground rather than a charged strike. */
  tap: boolean;
  pass?: { targetId: string; hold: number };
}

interface ActiveShot {
  record: ShotRecord;
  startedAt: number;
}

const BALL_ID = 'ball';

/**
 * How many touches back the attribution looks. Four covers a pass, a control
 * and a finish with one to spare; a longer log would only invent assists.
 */
const TOUCH_LOG_LENGTH = 4;

/** One-shot animation cues the renderer consumes and clears. */
export type AnimationTrigger = 'kick' | 'tackle' | 'pass' | 'juggle' | 'volley';

export interface AnimationTriggers {
  kick: boolean;
  tackle: boolean;
  pass: boolean;
  juggle: boolean;
  /** The strike was made on a ball in the air, which is a different swing. */
  volley: boolean;
}

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
  /** Who is on the pitch. Defaults to 1×1; `setRoster` changes it later. */
  roster?: MatchRoster;
  /**
   * How hard team-mates push each other apart, 0 to 1. Team-mate capsules do
   * not collide (see `PLAYER_LAYER`); this scales the spring that replaces
   * that collision. 1 is close to a solid body, 0 lets them walk through each
   * other. Irrelevant in 1×1, where nobody has a team-mate.
   */
  friendlyCollision?: number;
}

export class MatchEngine {
  state: MatchState;
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
  private readonly pendingKicks: PendingKick[] = [];
  private readonly animationTriggers = new Map<string, AnimationTriggers>();
  /** The STANGA touch rule. Authoritative here; the online client mirrors it. */
  touchRule: TouchRuleEngine;
  /** Last tick each player's capsule was accepted as a contact. */
  private readonly lastContactTick = new Map<string, number>();

  private rulesAuthority: RulesAuthority;
  private pendingViolation: { playerId: string; team: TeamId } | null = null;
  /** Side spin currently on the ball, for the Magnus force. */
  private ballSpin = 0;
  /** Reused scratch for the per-tick ball forces; no per-frame allocation. */
  private readonly ballVelocity = new Vector3();
  /** How long the ball has sat still with nobody allowed to play it. */
  private staleSeconds = 0;
  private roster: MatchRoster;
  private readonly scene: Scene;
  private friendlyCollision: number;

  constructor(
    scene: Scene,
    private readonly world: PhysicsWorld,
    options: MatchEngineOptions = {},
  ) {
    this.scene = scene;
    this.rulesAuthority = options.rules ?? 'authoritative';
    this.rng = new Rng(options.seed ?? 0x5741c6);
    this.roster = options.roster ?? ONE_VS_ONE_ROSTER;
    this.friendlyCollision = clamp(options.friendlyCollision ?? 1, 0, 1);
    this.state = createMatchState(this.roster);
    this.touchRule = this.makeTouchRule();
    this.ball = new BallBody(scene, world);
    this.buildPlayerBodies();
  }

  private makeTouchRule(): TouchRuleEngine {
    return new TouchRuleEngine(
      {
        minRelativeSpeed: GameConfig.touch.minRelativeSpeed,
        violationCooldownTicks: GameConfig.touch.violationCooldownTicks,
      },
      this.state.touch,
    );
  }

  /**
   * Swaps the whole line-up: a new state, new bodies, and a `rosterChanged`
   * event so the renderer can rebuild its views. Called between matches, never
   * during one — the physics bodies are replaced outright.
   */
  setRoster(roster: MatchRoster): void {
    if (roster === this.roster) return;
    this.roster = roster;
    for (const body of this.players) body.dispose();
    this.players.length = 0;
    this.state = createMatchState(roster);
    this.touchRule = this.makeTouchRule();
    this.commands.clear();
    this.animationTriggers.clear();
    this.possessionPlayerId = null;
    this.activeShot = null;
    this.scoring.reset();
    this.buildPlayerBodies();
    this.events.emit('rosterChanged', { roster });
  }

  get currentRoster(): MatchRoster {
    return this.roster;
  }

  /**
   * Changes how hard team-mates push each other apart. The online client sets
   * this from the room's config so its prediction matches the server, which is
   * why it is not fixed at construction.
   */
  setFriendlyCollision(value: number): void {
    this.friendlyCollision = clamp(value, 0, 1);
  }

  private buildPlayerBodies(): void {
    for (const player of this.state.players) {
      this.players.push(
        new PlayerBody(this.scene, this.world, player.id, player.team, player.position),
      );
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
    for (const player of this.state.players) this.state.stats[player.id] = createPlayerStats();
    this.state.recentTouches.length = 0;
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

    this.touchRule.advance();
    this.separateTeammates(dt);

    if (live) {
      this.resolvePendingKicks(dt);
    } else {
      // Outside live play the ball is parked: no drift during the countdown.
      this.ball.setVelocity(0, 0, 0);
    }

    this.applyBallForces(dt);

    this.ballSpeedBeforeStep = this.ball.speed;
    // How lively the next bounce is depends on how hard the ball arrives.
    this.ball.applySpeedRestitution();
    // More substeps for a faster ball: at the speed cap a single 1/120s step
    // moves the ball further than the crossbar is thick, and it would tunnel.
    const collisions = this.world.step(dt, this.substepsFor(this.ballSpeedBeforeStep));
    this.ball.clampSpeed();

    this.processCollisions(collisions, live);

    if (this.rulesAuthority === 'authoritative') {
      if (live) {
        this.checkGoalLine();
        this.expireShot();
        this.recoverOutOfBounds();
        this.reopenStaleTurn(dt);
      }
      if (this.pendingViolation) {
        const offence = this.pendingViolation;
        this.pendingViolation = null;
        const record = applyTouchViolation(this.state, offence.playerId, offence.team);
        this.invalidateShot();
        this.scoring.reset();
        this.touchRule.reset(tick);
        this.lastContactTick.clear();
        this.possessionPlayerId = null;
        this.ball.reset(this.state.ball.position);
        this.events.emit('violation', record);
      }

      for (const raw of this.scoring.update(this.state.elapsed)) {
        if (this.state.phase !== 'playing') continue;
        const record = this.attribute(raw);
        applyScoreEvent(this.state, record);
        this.recordScoreStats(record);
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
  consumeAnimationTriggers(playerId: string): AnimationTriggers {
    const triggers = this.animationTriggers.get(playerId);
    if (!triggers) {
      return { kick: false, tackle: false, pass: false, juggle: false, volley: false };
    }
    const consumed = { ...triggers };
    triggers.kick = false;
    triggers.tackle = false;
    triggers.pass = false;
    triggers.juggle = false;
    triggers.volley = false;
    return consumed;
  }

  /**
   * The forces on the ball that Havok does not model.
   *
   * Havok gives us gravity, the bounce and the surface friction. What it has
   * is one blanket linear damping, which bleeds the same fraction out of a
   * ball flying through the air and a ball rolling across asphalt — and those
   * are different laws. So the damping is turned almost off and the two are
   * applied here instead:
   *
   * - in flight, drag proportional to the square of the speed, which is what
   *   takes the edge off a hard shot over a long ball and lets a floated one
   *   hang;
   * - on the ground, a rolling resistance proportional to the speed, which is
   *   what brings a pass to a stop in a believable distance;
   * - side spin, as a sideways acceleration that develops over the flight
   *   rather than a bend applied at the foot.
   */
  private applyBallForces(dt: number): void {
    const { ball: config } = GameConfig;
    const velocity = this.ball.readVelocity(this.ballVelocity);
    const speed = velocity.length();
    if (speed < 1e-4) {
      this.ballSpin = this.ball.spin;
      return;
    }

    // Air is air whether the ball is flying or rolling: dv = -k |v| v dt, on
    // all three components, so the drag pulls against the actual direction of
    // travel rather than only along the floor.
    const drag = airDragFactor(speed, dt);
    let vx = velocity.x * drag;
    const vy = velocity.y * drag;
    let vz = velocity.z * drag;

    this.ballSpin = this.ball.spin;
    const airborne = this.state.ball.position.y > config.airborneHeight;

    if (airborne) {
      if (Math.abs(this.ballSpin) > 0.5) {
        const bend = magnusAcceleration(this.ballSpin, vx, vz);
        vx += bend.x * dt;
        vz += bend.z * dt;
        // Spin bleeds off, so a curl is a curve and not a permanent orbit.
        this.ball.setSpin(this.ballSpin * Math.max(0, 1 - config.spinDecay * dt));
      }
    } else {
      // Rolling resistance is the ground's alone, and it acts along the floor.
      const roll = rollingFactor(dt);
      vx *= roll;
      vz *= roll;
    }

    this.ball.setVelocity(vx, vy, vz);
  }

  /**
   * How finely this tick has to be sliced so nothing is missed.
   *
   * The crossbar is 0.17m thick, so the ball must not travel more than about
   * a third of that per substep — otherwise a hard shot goes straight through
   * the frame with no contact at all.
   */
  private substepsFor(speed: number): number {
    const perTick = speed * GameConfig.simulation.fixedDeltaSeconds;
    const needed = Math.ceil(perTick / 0.055);
    return Math.max(GameConfig.physics.substeps, Math.min(10, needed));
  }

  /** Flags a one-shot animation. Cleared once the renderer has consumed it. */
  private trigger(playerId: string, kind: AnimationTrigger): void {
    const existing = this.animationTriggers.get(playerId);
    if (existing) {
      existing[kind] = true;
      return;
    }
    this.animationTriggers.set(playerId, {
      kick: kind === 'kick',
      tackle: kind === 'tackle',
      pass: kind === 'pass',
      juggle: kind === 'juggle',
      volley: kind === 'volley',
    });
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

    // Aim, spin and chip live on the player rather than on the command, so the
    // last thing asked for still holds when the foot finally connects.
    player.verticalAim = clamp(command.verticalAim, -1, 1);
    player.spin = clamp(command.spin, -1, 1);
    player.chipRequested = command.chipRequested;
    player.shotStyle = command.shotStyle;
    /*
     * `lofted` is a readout, not a switch.
     *
     * It used to be toggled here, and then overwritten on the very next tick
     * by the controller's own aim value — so the flat/high control did
     * nothing at all and there was no way to deliberately put the ball in the
     * air. The toggle now lives where the aim lives, in the controllers, and
     * this line only reports which half of the range they left it in, for the
     * HUD, the animation and the aim marker.
     */
    player.lofted = player.verticalAim > 0.25;
    player.passCooldown = Math.max(0, player.passCooldown - dt);
    player.juggleCooldown = Math.max(0, player.juggleCooldown - dt);

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
      player.shootHold += dt;
      player.kickCharge = Math.min(1, player.kickCharge + dt / GameConfig.kick.chargeSeconds);
    } else if (!command.shootHeld) {
      player.charging = false;
    }
    // A press that started while the kick was on cooldown still counts as a
    // press: without this the hold reads as zero and every such kick is a tap.
    if (command.shootPressed) player.shootHold = dt;

    if (command.shootReleased) {
      this.tryKick(player);
    }
    if (command.passReleased || command.passPressed) {
      player.passHold = command.passReleased ? player.passHold : 0;
      this.tryPass(player, command.preferredPassSlot, player.passHold);
    }
    if (command.passHeld) {
      player.passHold = Math.min(GameConfig.pass.holdSeconds, player.passHold + dt);
    } else if (!command.passReleased) {
      player.passHold = 0;
    }
    if (command.jugglePressed) {
      this.tryJuggle(player);
    }
    if (command.tacklePressed) {
      this.tryTackle(player);
    }
  }

  /**
   * A pass: the server picks the target, the client only suggests one.
   *
   * `preferredSlot` is a request. It is honoured when it names a team-mate who
   * is actually reachable and roughly in front; otherwise the best available
   * team-mate is chosen, and if there is nobody the pass simply does not
   * happen rather than becoming a random clearance.
   */
  private tryPass(player: PlayerState, preferredSlot: number, hold: number): void {
    if (player.passCooldown > 0 || player.stunTimer > 0) return;
    if (!this.ballIsKickable(player)) return;

    const target = this.choosePassTarget(player, preferredSlot);
    if (!target) return;

    player.passCooldown = GameConfig.pass.cooldownSeconds;
    this.pendingKicks.push({
      playerId: player.id,
      power: 0,
      tap: false,
      pass: { targetId: target.id, hold },
    });
    player.windUpTimer = GameConfig.kick.windUpSeconds;
  }

  /** The team-mate a pass should go to, or null when there is nobody to aim at. */
  /**
   * Who a pass from this player would go to right now, for the HUD to point
   * at. Read-only, and it asks exactly the same question the pass itself does,
   * so the ring never promises a target the pass would not pick.
   */
  passTargetFor(playerId: string): string | null {
    const player = this.state.players.find((candidate) => candidate.id === playerId);
    if (!player) return null;
    const command = this.commands.get(playerId);
    return this.choosePassTarget(player, command?.preferredPassSlot ?? -1)?.id ?? null;
  }

  private choosePassTarget(player: PlayerState, preferredSlot: number): PlayerState | null {
    const mates = this.state.players.filter(
      (other) => other.team === player.team && other.id !== player.id,
    );
    if (mates.length === 0) return null;

    const facing = player.facing;
    const scored = mates
      .map((mate) => {
        const dx = mate.position.x - player.position.x;
        const dz = mate.position.z - player.position.z;
        const distance = Math.hypot(dx, dz);
        const toMate = yawFromXZ(dx, dz);
        const offAngle = Math.abs(angleDelta(facing, toMate));
        return { mate, distance, offAngle };
      })
      .filter(
        (candidate) =>
          candidate.distance >= GameConfig.pass.minRange &&
          candidate.distance <= GameConfig.pass.throughMaxRange,
      );
    if (scored.length === 0) return null;

    // A request is honoured only when it is legal: the right team, in range
    // and roughly in front. Everything else falls back to the server's choice.
    const requested = scored.find(
      (candidate) =>
        candidate.mate.slotIndex === preferredSlot &&
        candidate.offAngle <= GameConfig.pass.coneHalfAngle,
    );
    if (requested) return requested.mate;

    // Otherwise: whoever is most in front, with distance as the tie-break.
    scored.sort((a, b) => a.offAngle - b.offAngle || a.distance - b.distance);
    return scored[0]?.mate ?? null;
  }

  /**
   * Flicks the ball up. This is the one legal way to touch the ball twice, so
   * it goes through the touch rule like everything else — it is just that a
   * ball still in the air means the rule says yes.
   */
  private tryJuggle(player: PlayerState): void {
    if (player.juggleCooldown > 0 || player.stunTimer > 0) return;
    const ball = this.state.ball.position;
    if (horizontalDistance(player.position, ball) > GameConfig.juggle.range) return;
    if (ball.y > GameConfig.juggle.maxHeight) return;

    const outcome = this.registerTouch(player, true, Number.POSITIVE_INFINITY);
    if (outcome === 'violation' || outcome === 'ignored') return;

    player.juggleCooldown = GameConfig.juggle.cooldownSeconds;
    this.lastContactTick.set(player.id, this.state.tick);
    const { juggle } = GameConfig;
    this.ball.applyImpulse(
      Math.sin(player.facing) * juggle.forward,
      juggle.lift,
      Math.cos(player.facing) * juggle.forward,
    );
    this.statsFor(player.id).juggles += 1;
    this.trigger(player.id, 'juggle');
    this.events.emit('juggle', {
      playerId: player.id,
      team: player.team,
      count: this.touchRule.aerialCount,
    });
  }

  /**
   * Validates the shot at the moment of release and schedules the strike.
   * The short wind-up is what makes a kick readable; the impulse lands when the
   * foot does, so the animation and the physics always agree.
   */
  private tryKick(player: PlayerState): void {
    // A press shorter than the tap window is a tap: a soft ball along the
    // ground, whatever the aim wheel was left on. Anything longer is a charge,
    // and the charge decides the pace.
    const tap = player.shootHold > 0 && player.shootHold < GameConfig.kick.tapSeconds;
    const power = Math.max(GameConfig.kick.minPower, player.kickCharge);
    player.kickCharge = 0;
    player.charging = false;
    player.shootHold = 0;

    if (player.kickCooldown > 0 || player.stunTimer > 0) return;
    if (!this.ballIsKickable(player)) return;

    this.pendingKicks.push({ playerId: player.id, power, tap });
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
      this.strikeBall(player, pending.power, pending.tap, pending.pass);
    }
  }

  private strikeBall(
    player: PlayerState,
    power: number,
    tap: boolean,
    pass?: PendingKick['pass'],
  ): void {
    // A kick is a deliberate touch, so the rule decides before the foot lands.
    // Refusing here rather than at wind-up time is what makes the call fair:
    // somebody else may have played the ball while the leg was swinging.
    const outcome = this.registerTouch(player, true, Number.POSITIVE_INFINITY);
    if (outcome === 'violation' || outcome === 'ignored') {
      this.trigger(player.id, pass ? 'pass' : 'kick');
      return;
    }
    this.lastContactTick.set(player.id, this.state.tick);

    const resolved = pass
      ? this.resolvePass(player, pass)
      : resolveShot({
          yaw: this.assistedShotYaw(player),
          power,
          verticalAim: player.verticalAim,
          spin: player.spin,
          // The chip key is a hold-to-override on top of whatever style is
          // selected, so it stays a real control rather than a sixth entry in
          // a cycle nobody would reach for in a hurry.
          style: player.chipRequested ? 'chip' : player.shotStyle,
          runSpeed: Math.hypot(player.velocity.x, player.velocity.z),
          ballHeight: this.state.ball.position.y,
          tap,
        });
    if (!resolved) return;

    /*
     * A strike sets the ball's velocity; it does not add to it.
     *
     * A foot swinging through a ball dominates whatever the ball was already
     * doing, and more to the point it is the only model in which the same
     * charge and the same aim give the same shot twice — which is what aiming
     * at a crossbar needs. Adding an impulse meant a ball rolling towards you
     * and a ball rolling away produced two different shots from one control.
     */
    this.ball.setVelocity(resolved.velocityX, resolved.velocityY, resolved.velocityZ);
    this.ball.setSpin(resolved.spinRate);
    this.ball.clampSpeed();
    this.ballSpin = resolved.spinRate;

    this.shotCounter += 1;
    this.activeShot = {
      record: {
        shotId: `shot-${this.shotCounter}`,
        playerId: player.id,
        teamId: player.team,
        originatingTick: this.state.tick,
        shotType: pass ? 'pass' : resolved.profile,
        power: resolved.power,
      },
      startedAt: this.state.elapsed,
    };

    if (pass) {
      this.statsFor(player.id).passes += 1;
      this.trigger(player.id, 'pass');
      this.events.emit('pass', {
        playerId: player.id,
        team: player.team,
        targetId: pass.targetId,
        through: pass.hold > 0.05,
      });
      return;
    }

    this.statsFor(player.id).shots += 1;
    this.trigger(player.id, 'kick');
    // A ball struck out of the air is a different swing, so the animation
    // needs to know. It rides alongside the kick rather than replacing it.
    if (resolved.profile === 'volley') this.trigger(player.id, 'volley');
    this.events.emit('kick', {
      playerId: player.id,
      team: player.team,
      power: resolved.power,
      lofted: resolved.profile === 'lofted' || resolved.profile === 'chip',
      profile: resolved.profile,
    });
  }

  /**
   * Works out the impulse that puts the ball on a team-mate.
   *
   * Everything here is the server's: the client asked for a target, and even
   * that is only honoured when it is legal. The ball is aimed slightly ahead
   * of a moving receiver, and a held pass goes into the space beyond them.
   */
  private resolvePass(
    player: PlayerState,
    pass: NonNullable<PendingKick['pass']>,
  ): ResolvedShot | null {
    const target = this.state.players.find((entry) => entry.id === pass.targetId);
    if (!target || target.team !== player.team) return null;

    const config = GameConfig.pass;
    const through = pass.hold > 0.05;
    const lead = config.leadSeconds * (through ? 2 : 1);
    const aimX = target.position.x + target.velocity.x * lead;
    const aimZ = target.position.z + target.velocity.z * lead;

    const dx = aimX - player.position.x;
    const dz = aimZ - player.position.z;
    const distance = Math.max(config.minRange, Math.hypot(dx, dz));
    const maxRange = through ? config.throughMaxRange : config.maxRange;
    const reach = Math.min(distance, maxRange);

    // Pace scales with the distance to cover, so a short ball stays short.
    const speed = config.maxSpeed * (0.45 + 0.55 * (reach / maxRange));
    const yaw = yawFromXZ(dx, dz);
    const elevation = through ? config.throughElevation : config.groundElevation;
    const horizontal = speed * Math.cos(elevation);

    return {
      velocityX: Math.sin(yaw) * horizontal,
      velocityY: speed * Math.sin(elevation),
      velocityZ: Math.cos(yaw) * horizontal,
      spinRate: 0,
      profile: 'ground',
      power: reach / maxRange,
      elevation,
      speed,
    };
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
      // Winning the ball is a deliberate touch too, and it resets whoever had
      // the turn — which is exactly how a tackle should feel.
      const outcome = this.registerTouch(player, true, Number.POSITIVE_INFINITY);
      if (outcome !== 'violation' && outcome !== 'ignored') {
        this.statsFor(player.id).tackles += 1;
        this.lastContactTick.set(player.id, this.state.tick);
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
        this.invalidateShot();
      }
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
  /**
   * The touch that a player takes when they simply run into the ball.
   *
   * There is no dribbling under the STANGA rule: keeping the ball at your feet
   * would be a second touch the moment it came down. So a legal first touch
   * pushes the ball forward at a controlled speed instead — a trap, not a
   * carry — and the player then has to juggle it or play it to somebody.
   */
  private applyFirstTouch(player: PlayerState): void {
    const { touch } = GameConfig;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const push = Math.max(touch.firstTouchSpeed * 0.55, Math.min(touch.firstTouchSpeed, speed));
    this.ball.setVelocity(
      Math.sin(player.facing) * push,
      push * touch.firstTouchLift,
      Math.cos(player.facing) * push,
    );
  }

  /**
   * Offers one contact to the touch rule and applies what it decides.
   * Returns the outcome so the caller can skip whatever it was about to do.
   */
  private registerTouch(
    player: PlayerState,
    deliberate: boolean,
    relativeSpeed: number,
  ): TouchOutcome {
    const outcome = this.touchRule.register({
      playerId: player.id,
      team: player.team,
      tick: this.state.tick,
      deliberate,
      relativeSpeed,
    });

    if (outcome === 'ignored') return outcome;

    if (outcome === 'violation') {
      // Recorded here, acted on at the end of the tick: the physics step has
      // already run, and a restart must not move bodies mid-step.
      if (!this.pendingViolation) {
        this.pendingViolation = { playerId: player.id, team: player.team };
        this.statsFor(player.id).violations += 1;
      }
      return outcome;
    }

    this.logTouch(player.id, player.team);
    this.state.ball.lastTouchBy = player.id;
    this.state.ball.lastTouchTeam = player.team;
    this.state.ball.lastTouchTick = this.state.tick;
    if (this.possessionPlayerId !== player.id) {
      this.possessionPlayerId = player.id;
      this.events.emit('possession', { playerId: player.id, team: player.team });
    }
    // Any touch ends the previous shot, so a rebound cannot re-score.
    if (this.activeShot && this.state.elapsed - this.activeShot.startedAt > 0.2) {
      this.invalidateShot();
    }
    this.events.emit('touch', { playerId: player.id, team: player.team });
    return outcome;
  }

  /**
   * A player's capsule met the ball. Whether that is a touch at all is the
   * rule's call; whether it is *this* player's turn is also the rule's call.
   */
  private handlePlayerContact(playerId: string): void {
    if (this.contactDebounced(playerId)) return;
    const player = this.state.players.find((entry) => entry.id === playerId);
    if (!player || player.stunTimer > 0) return;

    const relativeSpeed = Math.hypot(
      this.state.ball.velocity.x - player.velocity.x,
      this.state.ball.velocity.z - player.velocity.z,
    );
    const outcome = this.registerTouch(
      player,
      false,
      Math.max(relativeSpeed, this.ballSpeedBeforeStep),
    );
    if (outcome === 'ignored') return;

    this.lastContactTick.set(playerId, this.state.tick);
    if (outcome === 'firstTouch') this.applyFirstTouch(player);
  }

  /** True when this player's capsule is allowed to report a contact again. */
  private contactDebounced(playerId: string): boolean {
    const last = this.lastContactTick.get(playerId);
    return last !== undefined && this.state.tick - last < GameConfig.touch.contactDebounceTicks;
  }

  /**
   * Works out who set a goal up.
   *
   * The assist is the last meaningful touch before the scorer's own, by a
   * different player on the same side, inside the assist window. Nothing is
   * credited for an own goal, and nothing is credited across a restart —
   * `recentTouches` is cleared at every kickoff, so a touch from before the
   * last goal can never turn into an assist for this one.
   */
  private attribute(record: ScoreEventRecord): ScoreEventRecord {
    const touches = this.state.recentTouches.slice(0, TOUCH_LOG_LENGTH);
    const scorer = record.playerId;
    if (scorer === null || record.ownGoal) {
      return { ...record, assistingPlayerId: null, lastTouches: touches };
    }

    const windowTicks = Math.round(
      GameConfig.pass.assistWindowSeconds / GameConfig.simulation.fixedDeltaSeconds,
    );
    const assist = findAssist(touches, scorer, record.team, record.tick, windowTicks);
    return { ...record, assistingPlayerId: assist, lastTouches: touches };
  }

  /** Counts a scoring event against the people responsible for it. */
  private recordScoreStats(record: ScoreEventRecord): void {
    if (record.ownGoal) {
      // The points go to the other team; the own goal goes on the record of
      // whoever put it in, which is the last person to touch it.
      const culprit = this.state.recentTouches[0]?.playerId ?? null;
      if (culprit !== null) this.statsFor(culprit).ownGoals += 1;
      return;
    }
    if (record.playerId !== null) {
      const stats = this.statsFor(record.playerId);
      stats.goals += 1;
      stats.points += record.points;
    }
    if (record.assistingPlayerId !== null) this.statsFor(record.assistingPlayerId).assists += 1;
  }

  /** The tally for one player, created on demand so a roster swap is safe. */
  private statsFor(playerId: string): PlayerStats {
    const existing = this.state.stats[playerId];
    if (existing) return existing;
    const created = createPlayerStats();
    this.state.stats[playerId] = created;
    return created;
  }

  /** Remembers a meaningful touch, newest first, for assists and attribution. */
  private logTouch(playerId: string, team: TeamId): void {
    this.state.recentTouches.unshift({ playerId, team, tick: this.state.tick });
    if (this.state.recentTouches.length > TOUCH_LOG_LENGTH) {
      this.state.recentTouches.length = TOUCH_LOG_LENGTH;
    }
    this.statsFor(playerId).touches += 1;
  }

  /**
   * The spring that stands in for a team-mate collision.
   *
   * Two players on the same side pass through each other as far as the physics
   * engine is concerned, so without this they would stand in the same spot.
   * An overlap pushes both apart along the line between them, capped so that
   * being caught inside a team-mate cannot launch anybody. It runs before the
   * physics step, on the server and on the client alike, from the same state.
   */
  private separateTeammates(dt: number): void {
    if (this.friendlyCollision <= 0 || this.players.length < 3) return;
    const { player } = GameConfig;
    const minimum = player.radius * 2;
    const stiffness = player.friendlySeparation * this.friendlyCollision;
    const maxImpulse = player.mass * player.friendlySeparationMaxSpeed;

    for (let i = 0; i < this.players.length; i += 1) {
      for (let j = i + 1; j < this.players.length; j += 1) {
        const a = this.players[i];
        const b = this.players[j];
        if (a === undefined || b === undefined || a.team !== b.team) continue;

        let dx = b.position.x - a.position.x;
        let dz = b.position.z - a.position.z;
        let distance = Math.hypot(dx, dz);
        if (distance >= minimum) continue;
        if (distance < 1e-4) {
          // Exactly on top of each other: pick a stable axis rather than
          // dividing by zero, so the result stays deterministic.
          dx = 1;
          dz = 0;
          distance = 1;
        }
        const overlap = minimum - distance;
        const magnitude = Math.min(stiffness * overlap * dt, maxImpulse);
        const nx = (dx / distance) * magnitude;
        const nz = (dz / distance) * magnitude;
        a.applyImpulse(-nx, 0, -nz);
        b.applyImpulse(nx, 0, nz);
      }
    }
  }

  private processCollisions(collisions: readonly RawCollision[], live: boolean): void {
    for (const collision of collisions) {
      const ballSide = collision.a.kind === 'ball' ? collision.b : collision.a;
      const isBall = collision.a.kind === 'ball' || collision.b.kind === 'ball';
      if (!isBall) continue;

      if (ballSide.kind === 'ground') {
        // The one contact that closes an aerial chain. A wall, a post or the
        // bar deliberately does not.
        this.touchRule.registerGroundContact(this.state.tick);
        continue;
      }

      if (ballSide.kind === 'player') {
        if (live) this.handlePlayerContact(ballSide.playerId);
        continue;
      }

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

  /**
   * Reopens the turn on a ball that nobody is coming for.
   *
   * The touch rule gives the turn back on somebody else's touch or on an
   * official restart. This is the restart: once the ball has been sitting
   * still for long enough with the last toucher still barred from it, the
   * turn is simply cleared and everyone may play again. It is not a
   * punishment and nothing is awarded — the ball stays exactly where it is.
   */
  private reopenStaleTurn(dt: number): void {
    const { touch } = GameConfig;
    const owner = this.state.touch.lastMeaningfulTouchPlayerId;
    const settled = this.ballSpeedBeforeStep < touch.staleSpeed;

    if (owner === null || !settled || !this.state.touch.ballHasTouchedGroundSinceFirstTouch) {
      this.staleSeconds = 0;
      return;
    }

    this.staleSeconds += dt;
    if (this.staleSeconds < touch.staleSeconds) return;

    this.staleSeconds = 0;
    this.touchRule.reset(this.state.tick);
    this.lastContactTick.clear();
    this.events.emit('turnReopened', { tick: this.state.tick });
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
      shotType: 'ground',
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
    this.ball.reset(deadBallRestart(this.state.ball.position));
    this.invalidateShot();
    // An out-of-bounds reset is an official restart: everyone may touch again.
    this.touchRule.reset(this.state.tick);
    this.lastContactTick.clear();
    this.possessionPlayerId = null;
  }

  // ── State sync ──────────────────────────────────────────────────────────────

  private applyKickoffReset(): void {
    this.touchRule.reset(this.state.tick);
    // A restart wipes the touch log: a touch from before the last goal must
    // never come back as an assist for the next one.
    this.state.recentTouches.length = 0;
    this.lastContactTick.clear();
    this.possessionPlayerId = null;
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
