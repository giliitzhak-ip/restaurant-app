/**
 * Third-person chase camera.
 *
 * The yaw is anchored to the direction of the attacking goal, blended towards the
 * ball, so camera-relative movement stays stable (no feedback loop between the
 * stick and the camera) while both the ball and the goal stay readable.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig, type ShakeLevel } from '../config/GameConfig';
import { Rng } from '../core/Rng';
import { clamp, damp, yawFromXZ } from '../core/math';
import type { Vec3 } from '../core/math';
import { attackingGoalZ, type TeamId } from '../game/MatchState';

export class CameraRig {
  readonly camera: UniversalCamera;
  private yaw = 0;
  private readonly focus = new Vector3();
  private readonly desired = new Vector3();
  /** Player-driven offsets on top of the automatic angle. */
  private userYaw = 0;
  private userPitch = 0;
  /** Seconds since the last look input, for the ease back. */
  private sinceLook = Number.POSITIVE_INFINITY;
  /**
   * How hard a shot is being charged, smoothed.
   *
   * The camera leans in a little while a strike is loading. It is a small
   * movement and it does a specific job: it says the shot is winding up
   * without taking anything out of frame.
   */
  private charge = 0;
  /** A short, decaying kick of the camera when a hard shot connects. */
  private shakeStrength = 0;
  private shakeScale = 1;
  private reduceMotion = false;
  private readonly shakeOffset = new Vector3();
  private readonly rng = new Rng(0x5ca3e);

  constructor(scene: Scene) {
    this.camera = new UniversalCamera(
      'chaseCamera',
      new Vector3(0, GameConfig.camera.height, -GameConfig.camera.distance),
      scene,
    );
    this.camera.minZ = 0.25;
    this.camera.maxZ = 300;
    this.camera.fov = GameConfig.camera.fov;
    // The camera is fully script-driven; user input must not detach or rotate it.
    this.camera.inputs.clear();
    scene.activeCamera = this.camera;
  }

  /**
   * Yaw the movement stick is expressed in.
   *
   * It includes the player's own swing, which is the point: after you drag the
   * view round, "forward" is forward on the screen you are looking at.
   */
  get movementYaw(): number {
    return this.yaw + this.userYaw;
  }

  /**
   * Swings the view. Both arguments are fractions of the screen dragged, so
   * the feel is the same whatever the device is.
   */
  /** 0..1 of the power meter, from the player this camera is following. */
  setCharge(ratio: number): void {
    this.charge = clamp(ratio, 0, 1);
  }

  setShakeLevel(level: ShakeLevel): void {
    this.shakeScale = GameConfig.camera.shakeScale[level];
  }

  setReduceMotion(reduce: boolean): void {
    this.reduceMotion = reduce;
    if (reduce) this.shakeStrength = 0;
  }

  /** A brief, decaying jolt. Ignored when the player has asked for less motion. */
  addShake(strength: number): void {
    if (this.shakeScale <= 0 || this.reduceMotion) return;
    this.shakeStrength = Math.min(1, this.shakeStrength + clamp(strength, 0, 1));
  }

  look(dxScreens: number, dyScreens: number): void {
    if (dxScreens === 0 && dyScreens === 0) return;
    const look = GameConfig.camera.look;
    this.userYaw = clamp(this.userYaw - dxScreens * look.yawPerScreen, -look.maxYaw, look.maxYaw);
    this.userPitch = clamp(
      this.userPitch + dyScreens * look.pitchPerScreen,
      -look.maxPitch,
      look.maxPitch,
    );
    this.sinceLook = 0;
  }

  /** True while the view is not sitting at its automatic angle. */
  get isLookingAround(): boolean {
    return Math.abs(this.userYaw) > 0.02 || Math.abs(this.userPitch) > 0.02;
  }

  /** Drops any swing at once. Used at kickoff, where the pitch flips round. */
  recentre(): void {
    this.userYaw = 0;
    this.userPitch = 0;
    this.sinceLook = Number.POSITIVE_INFINITY;
  }

  /** Snaps straight to the target pose. Used on kickoff so there is no slide-in. */
  snapTo(playerPosition: Vec3, ballPosition: Vec3, team: TeamId): void {
    this.recentre();
    this.update(playerPosition, ballPosition, team, 1, 1);
  }

  update(playerPosition: Vec3, ballPosition: Vec3, team: TeamId, dt: number, snapFactor = 0): void {
    const config = GameConfig.camera;
    const goalZ = attackingGoalZ(team);
    this.easeLookBack(dt);

    const toGoalYaw = yawFromXZ(-playerPosition.x * 0.35, goalZ - playerPosition.z);
    const toBallYaw = yawFromXZ(
      ballPosition.x - playerPosition.x,
      ballPosition.z - playerPosition.z,
    );

    // Lean towards the ball, but never far enough to lose sight of the goal.
    const blended = blendAngles(
      toGoalYaw,
      toBallYaw,
      config.ballAwarenessWeight,
      config.maxYawDeviation,
    );
    this.yaw = snapFactor >= 1 ? blended : dampAngle(this.yaw, blended, config.targetSmoothing, dt);

    const focusX = playerPosition.x + (ballPosition.x - playerPosition.x) * 0.28;
    const focusZ = playerPosition.z + (ballPosition.z - playerPosition.z) * 0.28;

    // The player's swing is applied on top of the automatic angle rather than
    // replacing it, so letting go returns to a view that is still tracking.
    const viewYaw = this.yaw + this.userYaw;
    const forwardX = Math.sin(viewYaw);
    const forwardZ = Math.cos(viewYaw);

    // Looking up pulls the camera higher and closer, looking down drops it
    // behind the shoulder. One control, two things that always move together.
    const look = config.look;
    const pitch = this.userPitch;
    // Charging pulls the view in and down a touch: closer to the strike.
    const charge = this.reduceMotion ? 0 : this.charge;
    const height =
      config.height * (1 + pitch * (look.pitchHeight - 1)) * (1 - charge * config.chargeHeightPull);
    const distance =
      config.distance * (1 + pitch * (look.pitchDistance - 1)) * (1 - charge * config.chargeZoom);

    this.desired.set(focusX - forwardX * distance, height, focusZ - forwardZ * distance);
    this.clampInsideArena(this.desired);

    if (snapFactor >= 1) {
      this.camera.position.copyFrom(this.desired);
      this.focus.set(focusX, config.lookAtHeight, focusZ);
    } else {
      this.camera.position.x = damp(
        this.camera.position.x,
        this.desired.x,
        config.positionSmoothing,
        dt,
      );
      this.camera.position.y = damp(
        this.camera.position.y,
        this.desired.y,
        config.positionSmoothing,
        dt,
      );
      this.camera.position.z = damp(
        this.camera.position.z,
        this.desired.z,
        config.positionSmoothing,
        dt,
      );
      this.focus.x = damp(this.focus.x, focusX, config.targetSmoothing, dt);
      this.focus.y = config.lookAtHeight;
      this.focus.z = damp(this.focus.z, focusZ, config.targetSmoothing, dt);
    }

    // The jolt is added after the smoothing, not before it, so a hard shot
    // reads as a knock rather than as the camera being dragged somewhere.
    this.updateShake(dt);
    this.camera.position.addInPlace(this.shakeOffset);
    this.camera.setTarget(this.focus);
  }

  private updateShake(dt: number): void {
    if (this.shakeStrength <= 0.001) {
      this.shakeOffset.setAll(0);
      this.shakeStrength = 0;
      return;
    }
    const amplitude = GameConfig.camera.shakeAmplitude * this.shakeStrength * this.shakeScale;
    this.shakeOffset.set(
      this.rng.jitter(amplitude),
      this.rng.jitter(amplitude * 0.6),
      this.rng.jitter(amplitude),
    );
    this.shakeStrength = Math.max(
      0,
      this.shakeStrength - GameConfig.camera.shakeDecayPerSecond * dt * 0.25,
    );
  }

  /**
   * Eases the swing back to the automatic angle after the player stops.
   *
   * Not immediately — holding a view for a second while you look for a
   * team-mate is the whole point — and not never, because a camera left
   * pointing backwards makes the controls feel broken to somebody who has
   * forgotten they moved it.
   */
  private easeLookBack(dt: number): void {
    this.sinceLook += dt;
    const look = GameConfig.camera.look;
    if (this.sinceLook < look.recentreDelay) return;
    const step = look.recentreRate * dt;
    this.userYaw = approachZero(this.userYaw, step);
    this.userPitch = approachZero(this.userPitch, step);
  }

  /** Keeps the camera inside the walls and above the ground. */
  private clampInsideArena(position: Vector3): void {
    const { field, goal, camera } = GameConfig;
    const limitX = field.width / 2 + field.wallThickness - camera.collisionPadding;
    const limitZ = field.length / 2 + goal.depth + field.wallThickness - camera.collisionPadding;
    position.x = clamp(position.x, -limitX, limitX);
    position.z = clamp(position.z, -limitZ, limitZ);
    position.y = Math.max(position.y, 1.4);
  }

  /** Widens the field of view on narrow screens so the goal stays visible. */
  applyAspect(aspect: number): void {
    const { fov, minFov, maxFov } = GameConfig.camera;
    // Babylon's fov is vertical: a wide screen needs less, a narrow one more.
    const adjusted = fov * clamp(1.75 / Math.max(aspect, 0.2), 0.75, 1.45);
    this.camera.fov = clamp(adjusted, minFov, maxFov);
  }
}

function approachZero(value: number, step: number): number {
  if (Math.abs(value) <= step) return 0;
  return value - Math.sign(value) * step;
}

function blendAngles(a: number, b: number, weight: number, maxDeviation: number): number {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + clamp(delta * clamp(weight, 0, 1), -maxDeviation, maxDeviation);
}

function dampAngle(current: number, target: number, smoothing: number, dt: number): number {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  const factor = 1 - Math.pow(1 - clamp(smoothing, 0, 1), dt * 60);
  return current + delta * factor;
}
