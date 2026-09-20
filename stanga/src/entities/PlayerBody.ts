/**
 * A player's physics body: one upright capsule.
 *
 * Like BallBody this is free of anything browser-only, so the authoritative
 * server runs it unchanged. The character mesh and animation live in
 * `rendering/PlayerView`.
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
import type { PlayerState, TeamId } from '../game/MatchState';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export class PlayerBody {
  readonly root: Mesh;
  readonly body: PhysicsBody;
  private readonly scratch = new Vector3();
  private readonly identity = Quaternion.Identity();

  constructor(
    scene: Scene,
    private readonly world: PhysicsWorld,
    readonly id: string,
    readonly team: TeamId,
    start: Vec3,
  ) {
    const { player } = GameConfig;

    this.root = MeshBuilder.CreateCapsule(
      `player-${id}`,
      { height: player.height, radius: player.radius, tessellation: 12, subdivisions: 2 },
      scene,
    );
    this.root.position.set(start.x, player.height / 2, start.z);
    this.root.isVisible = false;

    const aggregate = new PhysicsAggregate(
      this.root,
      PhysicsShapeType.CAPSULE,
      {
        mass: player.mass,
        friction: 0.35,
        restitution: 0.05,
        pointA: new Vector3(0, -player.height / 2 + player.radius, 0),
        pointB: new Vector3(0, player.height / 2 - player.radius, 0),
        radius: player.radius,
      },
      scene,
    );
    this.body = aggregate.body;
    // Zero inertia keeps the capsule upright: the character never tips over.
    this.body.setMassProperties({ mass: player.mass, inertia: Vector3.ZeroReadOnly });
    this.body.setAngularDamping(1);
    this.body.setLinearDamping(0.05);
    this.body.setCollisionCallbackEnabled(true);
    world.tag(this.body, { kind: 'player', playerId: id, team });
  }

  get position(): Vector3 {
    return this.root.position;
  }

  /** Sets horizontal velocity while leaving gravity to do its job on Y. */
  setHorizontalVelocity(x: number, z: number): void {
    this.body.getLinearVelocityToRef(this.scratch);
    this.scratch.x = x;
    this.scratch.z = z;
    this.body.setLinearVelocity(this.scratch);
  }

  get horizontalSpeed(): number {
    this.body.getLinearVelocityToRef(this.scratch);
    return Math.hypot(this.scratch.x, this.scratch.z);
  }

  applyImpulse(x: number, y: number, z: number): void {
    this.scratch.set(x, y, z);
    this.body.applyImpulse(this.scratch, this.root.position);
  }

  /**
   * Shifts the body without touching its velocity.
   *
   * The online client closes the gap between its prediction and the server a
   * little each tick this way: a slow frame rate makes the local player fall
   * behind, and sliding them forward is invisible where a teleport would not
   * be.
   */
  nudge(dx: number, dz: number): void {
    this.root.position.x += dx;
    this.root.position.z += dz;
    this.world.teleport(this.body);
  }

  /** Teleports the player and kills all motion. Used for kickoffs and resets. */
  reset(position: Vec3): void {
    this.scratch.set(position.x, GameConfig.player.height / 2, position.z);
    this.root.position.copyFrom(this.scratch);
    this.root.rotationQuaternion?.copyFrom(this.identity);
    this.body.setLinearVelocity(Vector3.ZeroReadOnly);
    this.body.setAngularVelocity(Vector3.ZeroReadOnly);
    this.world.teleport(this.body);
  }

  /** Mirrors the physics result into the serializable match state. */
  writeToState(state: PlayerState): void {
    state.position.x = this.root.position.x;
    state.position.y = this.root.position.y - GameConfig.player.height / 2;
    state.position.z = this.root.position.z;
    this.body.getLinearVelocityToRef(this.scratch);
    state.velocity.x = this.scratch.x;
    state.velocity.y = this.scratch.y;
    state.velocity.z = this.scratch.z;
  }
}
