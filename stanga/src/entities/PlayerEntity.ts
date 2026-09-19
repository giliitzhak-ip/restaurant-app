/**
 * A player: one upright dynamic capsule for the physics, plus a procedurally
 * built street-football character driven by PlayerAnimator.
 *
 * No external models and no violent animation — the tackle is a leg poke at the
 * ball, and the celebration is arms up and a hop.
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
import { createKitTexture, type KitPattern } from '../rendering/ProceduralTextures';
import { PlayerAnimator, type AnimatorInputs } from './PlayerAnimator';

const SKIN_TONES: readonly string[] = ['#c98d63', '#8d5a3b', '#e0b08a', '#6f4326'];
const HAIR_TONES: readonly string[] = ['#241b16', '#3d2a1c', '#111114', '#5a3b22'];

export interface KitDefinition {
  readonly id: number;
  readonly name: string;
  readonly shirt: string;
  readonly trim: string;
  readonly pattern: string;
}

export function kitFor(colorId: number): KitDefinition {
  const kits = GameConfig.kits;
  const index = Number.isFinite(colorId) ? Math.abs(Math.trunc(colorId)) % kits.length : 0;
  return kits[index] ?? kits[0];
}

export class PlayerEntity {
  readonly root: Mesh;
  readonly body: PhysicsBody;
  readonly visual: TransformNode;
  readonly marker: Mesh;
  readonly meshes: Mesh[] = [];
  readonly animator = new PlayerAnimator();

  private readonly limbs: { leftLeg: Mesh; rightLeg: Mesh; leftArm: Mesh; rightArm: Mesh };
  private readonly torso: Mesh;
  private readonly torsoMaterial: StandardMaterial;
  private readonly markerMaterial: StandardMaterial;
  private readonly scratch = new Vector3();
  private readonly identity = Quaternion.Identity();
  private readonly baseVisualY: number;
  private colorId = -1;

  constructor(
    scene: Scene,
    world: PhysicsWorld,
    readonly id: string,
    readonly team: TeamId,
    isHuman: boolean,
    start: Vec3,
    private readonly scene_ = scene,
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

    this.visual = new TransformNode(`visual-${id}`, scene);
    this.visual.parent = this.root;
    this.baseVisualY = -player.height / 2;
    this.visual.position.y = this.baseVisualY;

    // Small per-player variation so the two characters are not clones.
    const variant = hashString(id);
    const skinTone = SKIN_TONES[variant % SKIN_TONES.length] ?? '#c98d63';
    const hairTone = HAIR_TONES[variant % HAIR_TONES.length] ?? '#241b16';
    const skinMaterial = solidMaterial(scene, `skin-${id}`, skinTone);
    const shortsMaterial = solidMaterial(scene, `shorts-${id}`, '#1d1f24');

    this.torsoMaterial = new StandardMaterial(`shirt-${id}`, scene);
    this.torsoMaterial.specularColor = new Color3(0.08, 0.08, 0.09);

    this.torso = MeshBuilder.CreateBox(
      `torso-${id}`,
      { width: 0.46, height: 0.6, depth: 0.26 },
      scene,
    );
    this.torso.position.y = 1.16;
    this.torso.material = this.torsoMaterial;
    this.torso.parent = this.visual;

    const hips = MeshBuilder.CreateBox(
      `hips-${id}`,
      { width: 0.42, height: 0.24, depth: 0.25 },
      scene,
    );
    hips.position.y = 0.78;
    hips.material = shortsMaterial;
    hips.parent = this.visual;

    const neck = MeshBuilder.CreateCylinder(
      `neck-${id}`,
      { height: 0.1, diameter: 0.13, tessellation: 8 },
      scene,
    );
    neck.position.y = 1.48;
    neck.material = skinMaterial;
    neck.parent = this.visual;

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
    hair.material = solidMaterial(scene, `hair-${id}`, hairTone);
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

    const shoeMaterial = solidMaterial(scene, `shoe-${id}`, '#111216');
    for (const [name, parent] of [
      ['shoeL', leftLeg],
      ['shoeR', rightLeg],
    ] as const) {
      const shoe = MeshBuilder.CreateBox(
        `${name}-${id}`,
        { width: 0.19, height: 0.1, depth: 0.3 },
        scene,
      );
      shoe.position.set(0, -0.3, 0.05);
      shoe.material = shoeMaterial;
      shoe.parent = parent;
      this.meshes.push(shoe);
    }

    this.limbs = { leftLeg, rightLeg, leftArm, rightArm };
    this.meshes.push(this.torso, hips, neck, head, hair, leftLeg, rightLeg, leftArm, rightArm);

    // Every player gets a ring; whether it is shown depends on who is driving,
    // which can change between matches.
    this.marker = MeshBuilder.CreateTorus(
      `marker-${id}`,
      { diameter: 1.05, thickness: 0.07, tessellation: 24 },
      scene,
    );
    this.marker.position.y = 0.045;
    this.marker.parent = this.visual;
    this.marker.isPickable = false;
    this.markerMaterial = new StandardMaterial(`markerMat-${id}`, scene);
    this.markerMaterial.alpha = 0.9;
    this.marker.material = this.markerMaterial;
    this.setMarkerVisible(isHuman);
  }

  /** Shows the player ring. Humans get one so they can find themselves. */
  setMarkerVisible(visible: boolean): void {
    this.marker?.setEnabled(visible);
  }

  /** Applies a kit. Cheap enough to call whenever the player changes colour. */
  applyKit(colorId: number): void {
    if (colorId === this.colorId) return;
    this.colorId = colorId;
    const kit = kitFor(colorId);
    this.torsoMaterial.diffuseTexture?.dispose();
    this.torsoMaterial.diffuseTexture = createKitTexture(
      this.scene_,
      kit.shirt,
      kit.trim,
      kit.pattern as KitPattern,
    );
    const color = Color3.FromHexString(kit.shirt);
    this.markerMaterial.emissiveColor = color;
    this.markerMaterial.diffuseColor = color;
  }

  /** Highlights the player currently in control of the ball. */
  setInControl(inControl: boolean): void {
    this.markerMaterial.alpha = inControl ? 1 : 0.55;
    this.marker.scaling.setAll(inControl ? 1.14 : 1);
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
    this.visual.rotation.set(0, facing, 0);
    this.animator.reset();
  }

  /**
   * Drives the animation state machine and applies the resulting pose.
   * Rendering only — it never writes back into the simulation.
   */
  updateVisual(state: PlayerState, inputs: AnimatorInputs, dt: number): void {
    const pose = this.animator.update(state, inputs, dt);

    this.visual.rotation.y = state.facing + pose.torsoYaw;
    this.visual.rotation.x = pose.torsoPitch;
    this.visual.rotation.z = pose.torsoRoll;
    this.visual.position.y = this.baseVisualY + pose.bob;

    this.limbs.leftLeg.rotation.x = pose.leftLeg;
    this.limbs.rightLeg.rotation.x = pose.rightLeg;
    this.limbs.leftArm.rotation.x = pose.leftArm;
    this.limbs.rightArm.rotation.x = pose.rightArm;
    // Arms swing outwards as they are raised, so a celebration reads clearly.
    this.limbs.leftArm.rotation.z = -pose.armsUp * 0.5;
    this.limbs.rightArm.rotation.z = pose.armsUp * 0.5;

    // Counter-rotate so the ring never appears to spin with the body.
    this.marker.rotation.y = -this.visual.rotation.y;
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

/** Stable small hash, so a player id always picks the same skin and hair. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}
