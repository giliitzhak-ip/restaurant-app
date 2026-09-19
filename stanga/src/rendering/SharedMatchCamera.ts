/**
 * SharedMatchCamera — one camera that keeps two players and the ball readable.
 *
 * Deliberately not split-screen: a single camera means a single render pass,
 * which is what keeps the frame budget intact on a phone.
 *
 * It frames a weighted target, dollies in and out with the spread of the
 * action, leans towards the goal the move is developing against, and clamps
 * itself inside the walls so it can never clip through the arena.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig, type ShakeLevel } from '../config/GameConfig';
import { clamp, damp } from '../core/math';
import type { Vec3 } from '../core/math';
import { Rng } from '../core/Rng';
import { attackingGoalZ, type TeamId } from '../game/MatchState';

export interface CameraFocus {
  /** Every point that must stay on screen. */
  points: readonly Vec3[];
  ball: Vec3;
  /** Goal the action is heading towards, used for a gentle lean. */
  leadingTeam: TeamId | null;
}

export class SharedMatchCamera {
  readonly camera: UniversalCamera;

  private yaw = 0;
  private distance: number = GameConfig.sharedCamera.minDistance;
  private height: number = GameConfig.sharedCamera.minHeight;
  private readonly focusPoint = new Vector3();
  private readonly desired = new Vector3();
  private readonly shakeOffset = new Vector3();
  private readonly rng = new Rng(0x1d3a7);

  private shakeStrength = 0;
  private shakeScale = 1;
  /** Field of view with no widening applied; the baseline for the aspect ratio. */
  private baseFov: number = GameConfig.camera.fov;
  private zoomPulse = 1;
  private reduceMotion = false;
  private aspect = 16 / 9;

  constructor(scene: Scene) {
    this.camera = new UniversalCamera(
      'sharedCamera',
      new Vector3(0, GameConfig.sharedCamera.minHeight, -GameConfig.sharedCamera.minDistance),
      scene,
    );
    this.camera.minZ = 0.25;
    this.camera.maxZ = 320;
    this.camera.fov = GameConfig.camera.fov;
    // Fully script-driven: no user input may detach or rotate it.
    this.camera.inputs.clear();
  }

  activate(scene: Scene): void {
    scene.activeCamera = this.camera;
  }

  /** Yaw that camera-relative movement is expressed in, shared by both players. */
  get movementYaw(): number {
    return this.yaw;
  }

  setShakeLevel(level: ShakeLevel): void {
    this.shakeScale = GameConfig.camera.shakeScale[level];
  }

  setReduceMotion(reduce: boolean): void {
    this.reduceMotion = reduce;
  }

  /** Adds a shake impulse, 0..1. Ignored entirely when the player turned it off. */
  addShake(strength: number): void {
    if (this.shakeScale <= 0 || this.reduceMotion) return;
    this.shakeStrength = Math.min(1, this.shakeStrength + clamp(strength, 0, 1));
  }

  /** A brief pull-in used on a scoring event. */
  pulseZoom(): void {
    if (this.reduceMotion) return;
    this.zoomPulse = GameConfig.sharedCamera.celebrationZoom;
  }

  applyAspect(aspect: number): void {
    this.aspect = aspect;
    const { fov, minFov, maxFov } = GameConfig.camera;
    const adjusted = fov * clamp(1.75 / Math.max(aspect, 0.2), 0.75, 1.45);
    this.baseFov = clamp(adjusted, minFov, maxFov);
    this.camera.fov = this.baseFov;
  }

  /** Jumps straight to the framing, with no slide-in. Used after a reset. */
  snapTo(focus: CameraFocus): void {
    this.update(focus, 1, true);
  }

  update(focus: CameraFocus, dt: number, snap = false): void {
    const config = GameConfig.sharedCamera;

    // ── Target: the mid-point of everything, pulled towards the ball ──────────
    let sumX = 0;
    let sumZ = 0;
    for (const point of focus.points) {
      sumX += point.x;
      sumZ += point.z;
    }
    const count = Math.max(1, focus.points.length);
    const playersX = sumX / count;
    const playersZ = sumZ / count;

    const ballWeight = config.ballWeight;
    const targetX = playersX * (1 - ballWeight) + focus.ball.x * ballWeight;
    let targetZ = playersZ * (1 - ballWeight) + focus.ball.z * ballWeight;

    // A gentle lean towards the goal being attacked, so the move reads.
    if (focus.leadingTeam) {
      const goalZ = attackingGoalZ(focus.leadingTeam);
      targetZ += (goalZ - targetZ) * config.goalBias;
    }

    // ── Field of view: widen only when pulling back is no longer enough ──────
    // Two players at opposite ends of a 34m pitch cannot be framed by distance
    // alone without putting the camera so far away that both become specks.
    // Widening the lens frames them while keeping them a readable size.
    const neededFov = this.solveFov(focus, targetX, targetZ);
    this.camera.fov = snap
      ? neededFov
      : damp(this.camera.fov, neededFov, config.distanceSmoothing, dt);

    // ── Distance: enough to hold the whole spread inside the safe frame ───────
    const requiredDistance = this.solveDistance(focus, targetX, targetZ);
    const targetDistance = clamp(
      requiredDistance * this.zoomPulse,
      config.minDistance,
      config.maxDistance,
    );
    const ratio =
      (targetDistance - config.minDistance) /
      Math.max(0.001, config.maxDistance - config.minDistance);
    const targetHeight = config.minHeight + (config.maxHeight - config.minHeight) * ratio;

    // ── Yaw: fixed along the pitch, so the view never spins around the players ─
    // A shared camera that rotates makes camera-relative controls unusable for
    // whichever player is facing the other way, so the yaw stays put.
    const targetYaw = 0;

    const smoothing = this.reduceMotion ? 0.06 : 1;
    if (snap) {
      this.distance = targetDistance;
      this.height = targetHeight;
      this.yaw = targetYaw;
      this.focusPoint.set(targetX, GameConfig.camera.lookAtHeight, targetZ);
      this.zoomPulse = 1;
    } else {
      this.distance = damp(this.distance, targetDistance, config.distanceSmoothing * smoothing, dt);
      this.height = damp(this.height, targetHeight, config.distanceSmoothing * smoothing, dt);
      this.focusPoint.x = damp(this.focusPoint.x, targetX, config.targetSmoothing * smoothing, dt);
      this.focusPoint.y = GameConfig.camera.lookAtHeight;
      this.focusPoint.z = damp(this.focusPoint.z, targetZ, config.targetSmoothing * smoothing, dt);
      // The zoom pulse relaxes back to neutral on its own.
      this.zoomPulse = damp(this.zoomPulse, 1, 0.05, dt);
    }

    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    this.desired.set(
      this.focusPoint.x - forwardX * this.distance,
      this.height,
      this.focusPoint.z - forwardZ * this.distance,
    );
    this.clampInsideArena(this.desired);

    this.updateShake(dt);

    if (snap) {
      this.camera.position.copyFrom(this.desired);
    } else {
      const positionSmoothing = config.positionSmoothing * smoothing;
      this.camera.position.x = damp(this.camera.position.x, this.desired.x, positionSmoothing, dt);
      this.camera.position.y = damp(this.camera.position.y, this.desired.y, positionSmoothing, dt);
      this.camera.position.z = damp(this.camera.position.z, this.desired.z, positionSmoothing, dt);
    }
    this.camera.position.addInPlace(this.shakeOffset);
    this.camera.setTarget(this.focusPoint);
  }

  /**
   * Narrowest field of view that still frames everything once the camera is as
   * far back as it is allowed to go. Returns the base value whenever the
   * distance alone is enough, so the lens only widens when it has to.
   */
  private solveFov(focus: CameraFocus, targetX: number, targetZ: number): number {
    const previous = this.camera.fov;
    this.camera.fov = this.baseFov;
    const fitsAtBase = this.fits(GameConfig.sharedCamera.maxDistance, focus, targetX, targetZ);
    this.camera.fov = previous;
    if (fitsAtBase) return this.baseFov;

    let low: number = this.baseFov;
    let high: number = GameConfig.camera.maxFov;
    for (let i = 0; i < 10; i += 1) {
      const mid = (low + high) / 2;
      this.camera.fov = mid;
      const ok = this.fits(GameConfig.sharedCamera.maxDistance, focus, targetX, targetZ);
      if (ok) high = mid;
      else low = mid;
    }
    this.camera.fov = previous;
    return high;
  }

  /**
   * Smallest distance at which every tracked point still projects inside the
   * safe frame.
   *
   * A closed form is tempting but wrong: the camera looks DOWN at the pitch, so
   * a metre of ground depth covers far less screen height than a metre of width,
   * and by a factor that itself depends on the distance. Instead this does a
   * short bisection over the real frustum test. It is a dozen scalar iterations
   * with no allocation, which is cheaper than the error it prevents.
   */
  private solveDistance(focus: CameraFocus, targetX: number, targetZ: number): number {
    const config = GameConfig.sharedCamera;
    if (this.fits(config.minDistance, focus, targetX, targetZ)) return config.minDistance;
    if (!this.fits(config.maxDistance, focus, targetX, targetZ)) return config.maxDistance;

    let low: number = config.minDistance;
    let high: number = config.maxDistance;
    for (let i = 0; i < 12; i += 1) {
      const mid = (low + high) / 2;
      if (this.fits(mid, focus, targetX, targetZ)) high = mid;
      else low = mid;
    }
    return high;
  }

  /**
   * True when every tracked point lands inside the safe frame at this distance.
   *
   * This mirrors the perspective projection itself — normalized device
   * coordinates, not angles — because screen position is proportional to
   * tan(angle), and treating the two as interchangeable puts the nearest player
   * off the bottom of the screen.
   */
  private fits(distance: number, focus: CameraFocus, targetX: number, targetZ: number): boolean {
    const config = GameConfig.sharedCamera;
    const safe = config.safeFrame;
    const tanHalfY = Math.tan(this.camera.fov / 2);
    const tanHalfX = tanHalfY * this.aspect;

    // Height is tied to distance, so the test must use the matching height.
    const ratio = clamp(
      (distance - config.minDistance) / Math.max(0.001, config.maxDistance - config.minDistance),
      0,
      1,
    );
    const height = config.minHeight + (config.maxHeight - config.minHeight) * ratio;

    // The yaw is fixed, so the camera sits straight behind the focus on -Z —
    // but the wall clamp can pull it forward, and the framing has to know that,
    // otherwise it solves for a position the camera is never allowed to take.
    const camZ = clamp(targetZ - distance, -this.limitZ, this.limitZ);
    const camX = clamp(targetX, -this.limitX, this.limitX);
    const effectiveDistance = targetZ - camZ;
    if (effectiveDistance <= 0.001) return false;
    const lookY = GameConfig.camera.lookAtHeight;

    // Camera basis: forward towards the focus, right along +X, up their cross.
    const forwardLength = Math.hypot(lookY - height, effectiveDistance);
    if (forwardLength < 0.001) return false;
    const fy = (lookY - height) / forwardLength;
    const fz = effectiveDistance / forwardLength;
    // up = forward x right, which for right = (1,0,0) is (0, fz, -fy).
    const uy = fz;
    const uz = -fy;

    for (const point of this.eachTrackedPoint(focus)) {
      const dx = point.x - camX;
      const dy = point.y - height;
      const dz = point.z - camZ;

      const alongView = dy * fy + dz * fz;
      if (alongView <= this.camera.minZ) return false;

      const vertical = dy * uy + dz * uz;
      if (Math.abs(dx / (alongView * tanHalfX)) > safe) return false;
      if (Math.abs(vertical / (alongView * tanHalfY)) > safe) return false;
    }
    return true;
  }

  /** Iterates the players and the ball without building an array each frame. */
  private *eachTrackedPoint(focus: CameraFocus): Generator<Vec3> {
    for (const point of focus.points) yield point;
    yield focus.ball;
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
      this.shakeStrength - GameConfig.camera.shakeDecayPerSecond * dt * 0.2,
    );
  }

  /**
   * Furthest the camera may sit from the centre before it clips the arena.
   * A hard bound: an unbounded camera would frame anything, at the cost of
   * turning both players into specks.
   */
  private get limitX(): number {
    const { field, camera } = GameConfig;
    return field.width / 2 + field.wallThickness - camera.collisionPadding;
  }

  private get limitZ(): number {
    const { field, goal, camera } = GameConfig;
    return field.length / 2 + goal.depth + field.wallThickness - camera.collisionPadding;
  }

  private clampInsideArena(position: Vector3): void {
    position.x = clamp(position.x, -this.limitX, this.limitX);
    position.z = clamp(position.z, -this.limitZ, this.limitZ);
    position.y = clamp(position.y, GameConfig.sharedCamera.minHeight * 0.6, 40);
  }

  /** Test seam: the distance and height currently in use. */
  get framing(): { distance: number; height: number } {
    return { distance: this.distance, height: this.height };
  }
}
