/** The match ball: one dynamic body, plus the mesh that visualises it. */
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig } from '../config/GameConfig';
import type { Vec3 } from '../core/math';
import type { BallState } from '../game/MatchState';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { createBallTexture } from '../rendering/ProceduralTextures';

export class BallEntity {
  readonly mesh: Mesh;
  readonly body: PhysicsBody;
  private readonly scratch = new Vector3();
  private readonly identity = Quaternion.Identity();

  constructor(scene: Scene, world: PhysicsWorld) {
    const { ball } = GameConfig;
    this.mesh = MeshBuilder.CreateSphere(
      'ball',
      { diameter: ball.radius * 2, segments: 20 },
      scene,
    );
    this.mesh.position.set(0, ball.radius, 0);

    const material = new StandardMaterial('ballMat', scene);
    material.diffuseTexture = createBallTexture(scene);
    material.specularColor = new Color3(0.42, 0.42, 0.45);
    material.specularPower = 48;
    this.mesh.material = material;
    this.mesh.receiveShadows = true;

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
    this.body.setTargetTransform(this.scratch, this.identity);
    this.mesh.position.copyFrom(this.scratch);
    this.body.setLinearVelocity(Vector3.ZeroReadOnly);
    this.body.setAngularVelocity(Vector3.ZeroReadOnly);
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
