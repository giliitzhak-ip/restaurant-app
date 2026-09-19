/**
 * A player: one kinematic-feeling dynamic capsule plus a procedurally built
 * street-football character. No external models, no violent animation —
 * just a run cycle driven by horizontal speed.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig } from '../config/GameConfig';
import type { Vec3 } from '../core/math';
import type { PlayerState, TeamId } from '../game/MatchState';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export interface KitColors {
  readonly shirt: string;
  readonly shorts: string;
  readonly accent: string;
}

export const TEAM_KITS: Record<TeamId, KitColors> = {
  home: { shirt: '#f5f7fa', shorts: '#1d1f24', accent: '#ffa524' },
  away: { shirt: '#1f6fe0', shorts: '#12203a', accent: '#e8eef8' },
};

const SKIN = '#c98d63';

export class PlayerEntity {
  readonly root: Mesh;
  readonly body: PhysicsBody;
  readonly visual: TransformNode;
  readonly marker: Mesh | null;
  readonly meshes: Mesh[] = [];

  private readonly limbs: { leftLeg: Mesh; rightLeg: Mesh; leftArm: Mesh; rightArm: Mesh };
  private readonly scratch = new Vector3();
  private readonly identity = Quaternion.Identity();
  private stridePhase = 0;

  constructor(
    scene: Scene,
    world: PhysicsWorld,
    readonly id: string,
    readonly team: TeamId,
    isHuman: boolean,
    start: Vec3,
  ) {
    const { player } = GameConfig;
    const kit = TEAM_KITS[team];

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

    this.visual = new TransformNode(`visual-${id}`, scene);
    this.visual.parent = this.root;
    this.visual.position.y = -player.height / 2;

    const shirtMaterial = solidMaterial(scene, `shirt-${id}`, kit.shirt);
    const shortsMaterial = solidMaterial(scene, `shorts-${id}`, kit.shorts);
    const skinMaterial = solidMaterial(scene, `skin-${id}`, SKIN);
    const shoeMaterial = solidMaterial(scene, `shoe-${id}`, kit.accent);

    const torso = MeshBuilder.CreateBox(
      `torso-${id}`,
      { width: 0.46, height: 0.6, depth: 0.26 },
      scene,
    );
    torso.position.y = 1.16;
    torso.material = shirtMaterial;
    torso.parent = this.visual;

    const hips = MeshBuilder.CreateBox(
      `hips-${id}`,
      { width: 0.42, height: 0.24, depth: 0.25 },
      scene,
    );
    hips.position.y = 0.78;
    hips.material = shortsMaterial;
    hips.parent = this.visual;

    const head = MeshBuilder.CreateSphere(`head-${id}`, { diameter: 0.28, segments: 12 }, scene);
    head.position.y = 1.6;
    head.material = skinMaterial;
    head.parent = this.visual;

    const hair = MeshBuilder.CreateSphere(
      `hair-${id}`,
      { diameter: 0.3, segments: 10, slice: 0.58 },
      scene,
    );
    hair.position.y = 1.605;
    hair.material = solidMaterial(scene, `hair-${id}`, '#241b16');
    hair.parent = this.visual;

    const makeLimb = (name: string, x: number, y: number, length: number, thickness: number) => {
      const limb = MeshBuilder.CreateBox(
        `${name}-${id}`,
        { width: thickness, height: length, depth: thickness },
        scene,
      );
      // Pivot at the top so rotation swings the limb from the joint.
      limb.setPivotPoint(new Vector3(0, length / 2, 0));
      limb.position.set(x, y, 0);
      limb.parent = this.visual;
      return limb;
    };

    const leftLeg = makeLimb('legL', -0.12, 0.42, 0.72, 0.17);
    const rightLeg = makeLimb('legR', 0.12, 0.42, 0.72, 0.17);
    leftLeg.material = skinMaterial;
    rightLeg.material = skinMaterial;

    const leftArm = makeLimb('armL', -0.31, 1.18, 0.56, 0.13);
    const rightArm = makeLimb('armR', 0.31, 1.18, 0.56, 0.13);
    leftArm.material = skinMaterial;
    rightArm.material = skinMaterial;

    for (const [name, x] of [
      ['shoeL', -0.12],
      ['shoeR', 0.12],
    ] as const) {
      const shoe = MeshBuilder.CreateBox(
        `${name}-${id}`,
        { width: 0.19, height: 0.1, depth: 0.3 },
        scene,
      );
      shoe.position.set(x, -0.3, 0.05);
      shoe.material = shoeMaterial;
      shoe.parent = name === 'shoeL' ? leftLeg : rightLeg;
    }

    this.limbs = { leftLeg, rightLeg, leftArm, rightArm };
    this.meshes.push(torso, hips, head, hair, leftLeg, rightLeg, leftArm, rightArm);

    if (isHuman) {
      this.marker = MeshBuilder.CreateTorus(
        `marker-${id}`,
        { diameter: 1.05, thickness: 0.07, tessellation: 24 },
        scene,
      );
      this.marker.position.y = 0.04;
      this.marker.parent = this.visual;
      this.marker.isPickable = false;
      const markerMaterial = new StandardMaterial(`markerMat-${id}`, scene);
      markerMaterial.emissiveColor = Color3.FromHexString(kit.accent);
      markerMaterial.diffuseColor = Color3.FromHexString(kit.accent);
      markerMaterial.alpha = 0.85;
      this.marker.material = markerMaterial;
    } else {
      this.marker = null;
    }
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

  reset(position: Vec3, facing: number): void {
    this.scratch.set(position.x, GameConfig.player.height / 2, position.z);
    this.body.setTargetTransform(this.scratch, this.identity);
    this.root.position.copyFrom(this.scratch);
    this.body.setLinearVelocity(Vector3.ZeroReadOnly);
    this.body.setAngularVelocity(Vector3.ZeroReadOnly);
    this.visual.rotation.y = facing;
    this.stridePhase = 0;
  }

  /** Drives the run cycle and body facing. Rendering only — never affects physics. */
  updateVisual(state: PlayerState, dt: number): void {
    this.visual.rotation.y = state.facing;

    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    const normalized = Math.min(1, speed / GameConfig.player.sprintSpeed);
    this.stridePhase += dt * (5 + normalized * 9);

    const swing = Math.sin(this.stridePhase) * (0.16 + normalized * 0.72);
    const armSwing = Math.sin(this.stridePhase) * (0.1 + normalized * 0.5);
    this.limbs.leftLeg.rotation.x = swing;
    this.limbs.rightLeg.rotation.x = -swing;
    this.limbs.leftArm.rotation.x = -armSwing;
    this.limbs.rightArm.rotation.x = armSwing;

    // Lean forward a touch while charging a shot or sprinting.
    const lean = state.charging ? 0.14 : normalized * 0.1;
    this.visual.rotation.x = -lean;

    if (this.marker) {
      this.marker.rotation.y = -state.facing;
    }
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

function solidMaterial(scene: Scene, name: string, hex: string): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.specularColor = new Color3(0.08, 0.08, 0.09);
  return material;
}
