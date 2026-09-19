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
import { GameConfig } from '../config/GameConfig';
import { clamp, damp, yawFromXZ } from '../core/math';
import type { Vec3 } from '../core/math';
import { attackingGoalZ, type TeamId } from '../game/MatchState';

export class CameraRig {
  readonly camera: UniversalCamera;
  private yaw = 0;
  private readonly focus = new Vector3();
  private readonly desired = new Vector3();

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

  /** Yaw the movement stick is expressed in. */
  get movementYaw(): number {
    return this.yaw;
  }

  /** Snaps straight to the target pose. Used on kickoff so there is no slide-in. */
  snapTo(playerPosition: Vec3, ballPosition: Vec3, team: TeamId): void {
    this.update(playerPosition, ballPosition, team, 1, 1);
  }

  update(playerPosition: Vec3, ballPosition: Vec3, team: TeamId, dt: number, snapFactor = 0): void {
    const config = GameConfig.camera;
    const goalZ = attackingGoalZ(team);

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

    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);

    this.desired.set(
      focusX - forwardX * config.distance,
      config.height,
      focusZ - forwardZ * config.distance,
    );
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

    this.camera.setTarget(this.focus);
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
