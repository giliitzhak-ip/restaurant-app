/**
 * The ball's physics body.
 *
 * Deliberately free of materials, textures and anything else that needs a
 * browser: this runs unchanged inside the authoritative server on Babylon's
 * NullEngine. The look of the ball lives in `rendering/BallView`.
 */
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig } from '../config/GameConfig';
import type { Vec3 } from '../core/math';
import type { BallState } from '../game/MatchState';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export class BallBody {
  readonly mesh: Mesh;
  readonly body: PhysicsBody;
  private readonly scratch = new Vector3();
  private readonly identity = Quaternion.Identity();

  constructor(
    scene: Scene,
    private readonly world: PhysicsWorld,
  ) {
    const { ball } = GameConfig;
    this.mesh = MeshBuilder.CreateSphere(
      'ball',
      { diameter: ball.radius * 2, segments: 20 },
      scene,
    );
    this.mesh.position.set(0, ball.radius, 0);

    const aggregate = new PhysicsAggregate(
      this.mesh,
      PhysicsShapeType.SPHERE,
      {
        mass: ball.mass,
        restitution: ball.restitution,
        friction: ball.friction,
        radius: ball.radius,
      },
      scene,
    );
    this.body = aggregate.body;
    this.body.setLinearDamping(ball.linearDamping);
    this.body.setAngularDamping(ball.angularDamping);
    this.body.setCollisionCallbackEnabled(true);
    world.tag(this.body, { kind: 'ball' });
  }

  get position(): Vector3 {
    return this.mesh.position;
  }

  /**
   * Live velocity, straight from the physics body.
   *
   * `MatchState.ball.velocity` is only refreshed after the physics step, so
   * anything that reads it inside a tick — after a kick, say — is a tick
   * behind. Writing that stale value back would undo the kick.
   */
  readVelocity(out: Vector3): Vector3 {
    this.body.getLinearVelocityToRef(out);
    return out;
  }

  get speed(): number {
    this.body.getLinearVelocityToRef(this.scratch);
    return this.scratch.length();
  }

  applyImpulse(x: number, y: number, z: number): void {
    this.scratch.set(x, y, z);
    this.body.applyImpulse(this.scratch, this.mesh.position);
  }

  setVelocity(x: number, y: number, z: number): void {
    this.scratch.set(x, y, z);
    this.body.setLinearVelocity(this.scratch);
  }

  /** Teleports the ball and kills all motion. Used for kickoffs and resets. */
  reset(position: Vec3): void {
    this.scratch.set(position.x, position.y, position.z);
    this.mesh.position.copyFrom(this.scratch);
    this.mesh.rotationQuaternion?.copyFrom(this.identity);
    this.body.setLinearVelocity(Vector3.ZeroReadOnly);
    this.body.setAngularVelocity(Vector3.ZeroReadOnly);
    this.world.teleport(this.body);
  }

  /**
   * Sets side spin about the vertical axis, which is what bends a curled shot.
   * Roll and top spin are left alone: they are what the bounce already does.
   */
  setSpin(rateY: number): void {
    this.body.getAngularVelocityToRef(this.scratch);
    this.scratch.y = rateY;
    this.body.setAngularVelocity(this.scratch);
  }

  /** Side spin currently on the ball, radians per second. */
  get spin(): number {
    this.body.getAngularVelocityToRef(this.scratch);
    return this.scratch.y;
  }

  /** Hard cap on speed so the ball can never outrun the collision substeps. */
  clampSpeed(): void {
    this.body.getLinearVelocityToRef(this.scratch);
    const speed = this.scratch.length();
    if (speed > GameConfig.ball.maxSpeed) {
      this.scratch.scaleInPlace(GameConfig.ball.maxSpeed / speed);
      this.body.setLinearVelocity(this.scratch);
    }
  }

  /** Mirrors the physics result into the serializable match state. */
  writeToState(state: BallState): void {
    state.position.x = this.mesh.position.x;
    state.position.y = this.mesh.position.y;
    state.position.z = this.mesh.position.z;
    this.body.getLinearVelocityToRef(this.scratch);
    state.velocity.x = this.scratch.x;
    state.velocity.y = this.scratch.y;
    state.velocity.z = this.scratch.z;
  }
}
