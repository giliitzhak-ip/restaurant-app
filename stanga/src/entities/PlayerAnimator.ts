/**
 * PlayerAnimator — the character animation state machine.
 *
 * Deliberately pure: it turns match state into a Pose (a set of joint angles)
 * and knows nothing about Babylon. That makes it unit-testable, and it
 * guarantees the rule that animation can never feed back into the simulation —
 * poses are an output, never an input.
 */
import { GameConfig } from '../config/GameConfig';
import { clamp, lerp } from '../core/math';
import type { PlayerState } from '../game/MatchState';

export type AnimationState =
  | 'Idle'
  | 'Walk'
  | 'Run'
  | 'Sprint'
  | 'Dribble'
  | 'ChargeKick'
  | 'Kick'
  | 'LobKick'
  | 'Tackle'
  | 'Recover'
  | 'ScoreCelebration'
  | 'Defeat';

/** Joint angles in radians, plus a vertical bob in metres. */
export interface Pose {
  leftLeg: number;
  rightLeg: number;
  leftArm: number;
  rightArm: number;
  /** Forward lean. */
  torsoPitch: number;
  /** Sideways lean. */
  torsoRoll: number;
  /** Body twist around the vertical axis, relative to the facing direction. */
  torsoYaw: number;
  bob: number;
  /** Arms raised for a celebration, 0..1. */
  armsUp: number;
}

export function neutralPose(): Pose {
  return {
    leftLeg: 0,
    rightLeg: 0,
    leftArm: 0,
    rightArm: 0,
    torsoPitch: 0,
    torsoRoll: 0,
    torsoYaw: 0,
    bob: 0,
    armsUp: 0,
  };
}

/** States that play once and then hand back to the movement states. */
const ONE_SHOT: Partial<Record<AnimationState, number>> = {
  Kick: GameConfig.animation.kickSeconds,
  LobKick: GameConfig.animation.kickSeconds,
  Tackle: GameConfig.animation.tackleSeconds,
  ScoreCelebration: GameConfig.animation.celebrationSeconds,
};

export interface AnimatorInputs {
  /** Horizontal speed in m/s. */
  speed: number;
  /** True while this player is the one controlling the ball. */
  hasBall: boolean;
  /** Set for one frame when the foot connects with the ball. */
  kickTriggered: boolean;
  /** Set for one frame when a tackle is attempted. */
  tackleTriggered: boolean;
  /** Set while the celebration should play. */
  celebrating: boolean;
  /** Set while the defeat pose should play. */
  defeated: boolean;
}

export class PlayerAnimator {
  private state: AnimationState = 'Idle';
  private stateTime = 0;
  /** Seconds remaining of a one-shot animation. */
  private oneShotRemaining = 0;
  private stridePhase = 0;
  private blend = 1;
  private readonly current: Pose = neutralPose();
  private readonly from: Pose = neutralPose();
  private readonly target: Pose = neutralPose();

  get currentState(): AnimationState {
    return this.state;
  }

  get pose(): Readonly<Pose> {
    return this.current;
  }

  reset(): void {
    this.state = 'Idle';
    this.stateTime = 0;
    this.oneShotRemaining = 0;
    this.stridePhase = 0;
    this.blend = 1;
    copyPose(neutralPose(), this.current);
    copyPose(this.current, this.from);
    copyPose(this.current, this.target);
  }

  /** Advances the machine and produces the pose for this frame. */
  update(player: PlayerState, inputs: AnimatorInputs, dt: number): Readonly<Pose> {
    const next = this.decide(player, inputs);
    if (next !== this.state) {
      copyPose(this.current, this.from);
      this.state = next;
      this.stateTime = 0;
      this.blend = 0;
      this.oneShotRemaining = ONE_SHOT[next] ?? 0;
    }

    this.stateTime += dt;
    if (this.oneShotRemaining > 0) {
      this.oneShotRemaining = Math.max(0, this.oneShotRemaining - dt);
    }

    // The stride rate follows the actual speed, so footfalls match the movement.
    const speedRatio = clamp(inputs.speed / GameConfig.player.sprintSpeed, 0, 1);
    const strideRate = lerp(
      GameConfig.animation.walkStrideRate,
      GameConfig.animation.sprintStrideRate,
      speedRatio,
    );
    this.stridePhase += dt * strideRate;

    this.buildPose(this.target, player, inputs, speedRatio);

    this.blend = Math.min(1, this.blend + dt / GameConfig.animation.blendSeconds);
    blendPose(this.from, this.target, this.blend, this.current);
    return this.current;
  }

  private decide(player: PlayerState, inputs: AnimatorInputs): AnimationState {
    if (inputs.defeated) return 'Defeat';
    if (inputs.celebrating) return 'ScoreCelebration';

    // A one-shot keeps control until it finishes, so a kick is never cut short.
    if (this.oneShotRemaining > 0 && this.state !== 'ScoreCelebration') {
      return this.state;
    }

    if (inputs.kickTriggered) return player.lofted ? 'LobKick' : 'Kick';
    if (inputs.tackleTriggered) return 'Tackle';
    if (player.stunTimer > 0) return 'Recover';
    if (player.charging || player.windUpTimer > 0) return 'ChargeKick';

    if (inputs.speed < 0.35) return 'Idle';
    if (inputs.hasBall) return 'Dribble';
    if (player.sprinting) return 'Sprint';
    if (inputs.speed > GameConfig.player.walkSpeed * 0.62) return 'Run';
    return 'Walk';
  }

  private buildPose(
    out: Pose,
    player: PlayerState,
    inputs: AnimatorInputs,
    speedRatio: number,
  ): void {
    const swing = Math.sin(this.stridePhase);
    const counterSwing = Math.sin(this.stridePhase + Math.PI);

    switch (this.state) {
      case 'Idle': {
        // A slow breath keeps a standing player from looking frozen.
        const breath = Math.sin(this.stateTime * 1.6) * 0.03;
        out.leftLeg = 0.04;
        out.rightLeg = -0.04;
        out.leftArm = 0.08 + breath;
        out.rightArm = -0.08 - breath;
        out.torsoPitch = 0.02 + breath * 0.5;
        out.torsoRoll = 0;
        out.torsoYaw = 0;
        out.bob = breath * 0.4;
        out.armsUp = 0;
        break;
      }
      case 'Walk':
      case 'Run':
      case 'Sprint': {
        const amount = 0.24 + speedRatio * 0.68;
        out.leftLeg = swing * amount;
        out.rightLeg = counterSwing * amount;
        out.leftArm = counterSwing * (amount * 0.62);
        out.rightArm = swing * (amount * 0.62);
        out.torsoPitch = -(0.05 + speedRatio * 0.22);
        out.torsoRoll = Math.sin(this.stridePhase * 0.5) * 0.04 * speedRatio;
        out.torsoYaw = counterSwing * 0.08 * speedRatio;
        out.bob = Math.abs(swing) * 0.05 * speedRatio;
        out.armsUp = 0;
        break;
      }
      case 'Dribble': {
        // Shorter, choppier strides, with the body low over the ball.
        const amount = 0.2 + speedRatio * 0.4;
        out.leftLeg = swing * amount;
        out.rightLeg = counterSwing * amount;
        out.leftArm = counterSwing * 0.3 - 0.1;
        out.rightArm = swing * 0.3 - 0.1;
        out.torsoPitch = -0.16;
        out.torsoRoll = Math.sin(this.stridePhase) * 0.06;
        out.torsoYaw = 0.06;
        out.bob = Math.abs(swing) * 0.03;
        out.armsUp = 0;
        break;
      }
      case 'ChargeKick': {
        // Plant the standing foot, draw the kicking leg back.
        const draw = clamp(player.kickCharge, 0, 1);
        out.leftLeg = 0.12;
        out.rightLeg = -0.35 - draw * 0.75;
        out.leftArm = -0.5 - draw * 0.35;
        out.rightArm = 0.35 + draw * 0.3;
        out.torsoPitch = 0.1 + draw * 0.12;
        out.torsoRoll = -0.06 - draw * 0.08;
        out.torsoYaw = -0.18 - draw * 0.16;
        out.bob = -0.03;
        out.armsUp = 0;
        break;
      }
      case 'Kick':
      case 'LobKick': {
        // Swing through: the extreme sits early, then follows through.
        const t = clamp(this.stateTime / GameConfig.animation.kickSeconds, 0, 1);
        const swingThrough = Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.75);
        const lift = this.state === 'LobKick' ? 0.3 : 0;
        out.leftLeg = -0.18 * swingThrough;
        out.rightLeg = (0.95 + lift) * swingThrough;
        out.leftArm = 0.55 * swingThrough;
        out.rightArm = -0.45 * swingThrough;
        out.torsoPitch = (this.state === 'LobKick' ? 0.2 : -0.12) * swingThrough;
        out.torsoRoll = 0.1 * swingThrough;
        out.torsoYaw = 0.22 * swingThrough;
        out.bob = 0.04 * swingThrough;
        out.armsUp = 0;
        break;
      }
      case 'Tackle': {
        // A legal poke: reach with the leg, no slide, no contact with the player.
        const t = clamp(this.stateTime / GameConfig.animation.tackleSeconds, 0, 1);
        const reach = Math.sin(t * Math.PI);
        out.leftLeg = -0.2 * reach;
        out.rightLeg = 1.05 * reach;
        out.leftArm = -0.7 * reach;
        out.rightArm = 0.5 * reach;
        out.torsoPitch = -0.3 * reach;
        out.torsoRoll = 0.18 * reach;
        out.torsoYaw = 0.12 * reach;
        out.bob = -0.16 * reach;
        out.armsUp = 0;
        break;
      }
      case 'Recover': {
        // Off balance after being dispossessed, hands out, coming back upright.
        const t = clamp(player.stunTimer / GameConfig.tackle.stunSeconds, 0, 1);
        out.leftLeg = 0.3 * t;
        out.rightLeg = -0.25 * t;
        out.leftArm = -0.8 * t;
        out.rightArm = -0.8 * t;
        out.torsoPitch = 0.25 * t;
        out.torsoRoll = 0.2 * t;
        out.torsoYaw = -0.2 * t;
        out.bob = -0.1 * t;
        out.armsUp = 0.35 * t;
        break;
      }
      case 'ScoreCelebration': {
        // Arms up and a small hop. No taunting, no contact.
        const hop = Math.abs(Math.sin(this.stateTime * 6));
        out.leftLeg = Math.sin(this.stateTime * 6) * 0.25;
        out.rightLeg = -Math.sin(this.stateTime * 6) * 0.25;
        out.leftArm = -2.2;
        out.rightArm = -2.2;
        out.torsoPitch = 0.08;
        out.torsoRoll = Math.sin(this.stateTime * 3) * 0.1;
        out.torsoYaw = Math.sin(this.stateTime * 2.4) * 0.25;
        out.bob = hop * 0.22;
        out.armsUp = 1;
        break;
      }
      case 'Defeat': {
        // Hands on hips, head down.
        out.leftLeg = 0.05;
        out.rightLeg = -0.05;
        out.leftArm = -0.9;
        out.rightArm = -0.9;
        out.torsoPitch = 0.3;
        out.torsoRoll = 0;
        out.torsoYaw = 0;
        out.bob = -0.06;
        out.armsUp = 0.2;
        break;
      }
    }

    void inputs;
  }
}

export function copyPose(source: Readonly<Pose>, target: Pose): Pose {
  target.leftLeg = source.leftLeg;
  target.rightLeg = source.rightLeg;
  target.leftArm = source.leftArm;
  target.rightArm = source.rightArm;
  target.torsoPitch = source.torsoPitch;
  target.torsoRoll = source.torsoRoll;
  target.torsoYaw = source.torsoYaw;
  target.bob = source.bob;
  target.armsUp = source.armsUp;
  return target;
}

export function blendPose(from: Readonly<Pose>, to: Readonly<Pose>, t: number, out: Pose): Pose {
  const amount = clamp(t, 0, 1);
  out.leftLeg = lerp(from.leftLeg, to.leftLeg, amount);
  out.rightLeg = lerp(from.rightLeg, to.rightLeg, amount);
  out.leftArm = lerp(from.leftArm, to.leftArm, amount);
  out.rightArm = lerp(from.rightArm, to.rightArm, amount);
  out.torsoPitch = lerp(from.torsoPitch, to.torsoPitch, amount);
  out.torsoRoll = lerp(from.torsoRoll, to.torsoRoll, amount);
  out.torsoYaw = lerp(from.torsoYaw, to.torsoYaw, amount);
  out.bob = lerp(from.bob, to.bob, amount);
  out.armsUp = lerp(from.armsUp, to.armsUp, amount);
  return out;
}
