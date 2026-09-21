/**
 * The visible character: a jointed street footballer driven by PlayerAnimator,
 * parented to the capsule that PlayerBody owns.
 *
 * Client only. The server has the capsule and none of this, which is what lets
 * the authoritative simulation run in Node.
 *
 * The figure is built from real joints rather than four rigid boxes: hip →
 * knee → ankle and shoulder → elbow → wrist, with a sphere at every joint so
 * the limbs stay solid as they fold. That is what separates a person from a
 * marionette at chase-camera distance, and it costs a handful of small meshes
 * per player. The knee and elbow angles are derived here from the hip and
 * shoulder angles the animator produces — a limb folds because of where it is
 * swung, so there is nothing for the animation state machine to author and
 * nothing that can fall out of step with it.
 *
 * No external models, and no violent animation: the tackle is a leg poke at
 * the ball and the celebration is arms up and a hop.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig } from '../config/GameConfig';
import { clamp } from '../core/math';
import type { PlayerBody } from '../entities/PlayerBody';
import { PlayerAnimator, type AnimatorInputs, type Pose } from '../entities/PlayerAnimator';
import type { PlayerState } from '../game/MatchState';
import { createKitTexture, type KitPattern } from './ProceduralTextures';
import { createSurface } from './Surfaces';

const SKIN_TONES: readonly string[] = ['#c98d63', '#8d5a3b', '#e0b08a', '#6f4326'];
const HAIR_TONES: readonly string[] = ['#241b16', '#3d2a1c', '#111114', '#5a3b22'];

/** Segment lengths in metres, measured off a 1.78 m player. */
const RIG = {
  hipY: 0.9,
  thigh: 0.44,
  shin: 0.42,
  chestY: 1.28,
  shoulderY: 1.44,
  shoulderX: 0.2,
  upperArm: 0.3,
  forearm: 0.27,
  headY: 1.66,
} as const;

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

/** One side's leg: a hip that swings, and a knee that folds under it. */
interface Leg {
  hip: TransformNode;
  knee: TransformNode;
}

interface Arm {
  shoulder: TransformNode;
  elbow: TransformNode;
}

export class PlayerView {
  readonly visual: TransformNode;
  readonly marker: Mesh;
  readonly meshes: Mesh[] = [];
  readonly animator = new PlayerAnimator();

  private readonly legs: { left: Leg; right: Leg };
  private readonly arms: { left: Arm; right: Arm };
  private readonly torso: TransformNode;
  private readonly head: TransformNode;
  private readonly torsoMaterial: PBRMaterial;
  private readonly markerMaterial: StandardMaterial;
  private readonly baseVisualY: number;
  /** Small parts hidden once the player is far enough away to not see them. */
  private readonly detailMeshes: Mesh[] = [];
  private detailVisible = true;
  private colorId = -1;

  constructor(
    private readonly scene: Scene,
    playerBody: PlayerBody,
    isHuman: boolean,
  ) {
    const { player } = GameConfig;
    const id = playerBody.id;

    this.visual = new TransformNode(`visual-${id}`, scene);
    this.visual.parent = playerBody.root;
    this.baseVisualY = -player.height / 2;
    this.visual.position.y = this.baseVisualY;

    // Small per-player variation so the characters are not clones.
    const variant = hashString(id);
    const skinTone = SKIN_TONES[variant % SKIN_TONES.length] ?? '#c98d63';
    const hairTone = HAIR_TONES[(variant >> 3) % HAIR_TONES.length] ?? '#241b16';
    const skin = solidMaterial(scene, `skin-${id}`, skinTone, 0.52);
    const shorts = solidMaterial(scene, `shorts-${id}`, '#1d1f24', 0.86);
    const sock = solidMaterial(scene, `sock-${id}`, '#e8eaee', 0.9);
    const boot = solidMaterial(scene, `boot-${id}`, '#111216', 0.34);
    const hair = solidMaterial(scene, `hair-${id}`, hairTone, 0.68);

    this.torsoMaterial = createSurface(scene, `shirt-${id}`, {
      roughness: 0.82,
      ambientLift: 0.26,
    });

    // ── Torso ────────────────────────────────────────────────────────────────
    this.torso = new TransformNode(`torso-${id}`, scene);
    this.torso.parent = this.visual;

    // A chest that tapers to the waist reads as a body; a box reads as a box.
    const chest = MeshBuilder.CreateCylinder(
      `chest-${id}`,
      { height: 0.5, diameterTop: 0.44, diameterBottom: 0.36, tessellation: 12 },
      scene,
    );
    chest.scaling.z = 0.62;
    chest.position.y = RIG.chestY;
    chest.material = this.torsoMaterial;
    chest.parent = this.torso;

    const hips = MeshBuilder.CreateCylinder(
      `hips-${id}`,
      { height: 0.26, diameterTop: 0.38, diameterBottom: 0.36, tessellation: 12 },
      scene,
    );
    hips.scaling.z = 0.66;
    hips.position.y = RIG.hipY + 0.05;
    hips.material = shorts;
    hips.parent = this.torso;

    const neck = MeshBuilder.CreateCylinder(
      `neck-${id}`,
      { height: 0.12, diameter: 0.13, tessellation: 8 },
      scene,
    );
    neck.position.y = 1.54;
    neck.material = skin;
    neck.parent = this.torso;

    this.meshes.push(chest, hips, neck);
    this.detailMeshes.push(neck);

    for (const side of [-1, 1] as const) {
      const shoulder = MeshBuilder.CreateSphere(
        `shoulder-${id}-${side}`,
        { diameter: 0.19, segments: 8 },
        scene,
      );
      shoulder.position.set(side * RIG.shoulderX, RIG.shoulderY, 0);
      shoulder.material = this.torsoMaterial;
      shoulder.parent = this.torso;
      this.meshes.push(shoulder);
    }

    // ── Head ─────────────────────────────────────────────────────────────────
    this.head = new TransformNode(`head-${id}`, scene);
    this.head.position.y = RIG.headY;
    this.head.parent = this.torso;

    const skull = MeshBuilder.CreateSphere(`skull-${id}`, { diameter: 0.25, segments: 14 }, scene);
    skull.scaling.set(1, 1.12, 1.04);
    skull.material = skin;
    skull.parent = this.head;

    // A cap of hair, and a brow that catches the light: at this distance a
    // silhouette is the face, and these two are what give it one.
    const crown = MeshBuilder.CreateSphere(
      `hair-${id}`,
      { diameter: 0.27, segments: 12, slice: 0.56 },
      scene,
    );
    crown.position.y = 0.012;
    crown.scaling.set(1, 1.02, 1.06);
    crown.material = hair;
    crown.parent = this.head;

    const brow = MeshBuilder.CreateBox(
      `brow-${id}`,
      { width: 0.2, height: 0.035, depth: 0.05 },
      scene,
    );
    brow.position.set(0, 0.035, 0.105);
    brow.material = hair;
    brow.parent = this.head;

    this.meshes.push(skull, crown, brow);
    this.detailMeshes.push(crown, brow);

    // ── Limbs ────────────────────────────────────────────────────────────────
    this.legs = {
      left: this.buildLeg(id, -1, skin, shorts, sock, boot),
      right: this.buildLeg(id, 1, skin, shorts, sock, boot),
    };
    this.arms = {
      left: this.buildArm(id, -1, skin),
      right: this.buildArm(id, 1, skin),
    };

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

  /** Hip → thigh → knee → shin → sock → boot, each hanging off the last. */
  private buildLeg(
    id: string,
    side: -1 | 1,
    skin: PBRMaterial,
    shorts: PBRMaterial,
    sock: PBRMaterial,
    boot: PBRMaterial,
  ): Leg {
    const tag = side < 0 ? 'L' : 'R';
    const hip = new TransformNode(`hip${tag}-${id}`, this.scene);
    hip.position.set(side * 0.105, RIG.hipY, 0);
    hip.parent = this.visual;

    const thigh = MeshBuilder.CreateCylinder(
      `thigh${tag}-${id}`,
      { height: RIG.thigh, diameterTop: 0.19, diameterBottom: 0.145, tessellation: 8 },
      this.scene,
    );
    thigh.position.y = -RIG.thigh / 2;
    thigh.material = skin;
    thigh.parent = hip;

    // The shorts hang off the thigh, so they swing with the leg.
    const short = MeshBuilder.CreateCylinder(
      `short${tag}-${id}`,
      { height: 0.22, diameterTop: 0.23, diameterBottom: 0.2, tessellation: 10 },
      this.scene,
    );
    short.position.y = -0.09;
    short.material = shorts;
    short.parent = hip;

    const knee = new TransformNode(`knee${tag}-${id}`, this.scene);
    knee.position.y = -RIG.thigh;
    knee.parent = hip;

    const kneeCap = MeshBuilder.CreateSphere(
      `kneecap${tag}-${id}`,
      { diameter: 0.145, segments: 8 },
      this.scene,
    );
    kneeCap.material = skin;
    kneeCap.parent = knee;

    const shin = MeshBuilder.CreateCylinder(
      `shin${tag}-${id}`,
      { height: RIG.shin, diameterTop: 0.135, diameterBottom: 0.1, tessellation: 8 },
      this.scene,
    );
    shin.position.y = -RIG.shin / 2;
    shin.material = skin;
    shin.parent = knee;

    const stocking = MeshBuilder.CreateCylinder(
      `sock${tag}-${id}`,
      { height: 0.24, diameterTop: 0.14, diameterBottom: 0.108, tessellation: 8 },
      this.scene,
    );
    stocking.position.y = -RIG.shin + 0.12;
    stocking.material = sock;
    stocking.parent = knee;

    const shoe = MeshBuilder.CreateBox(
      `boot${tag}-${id}`,
      { width: 0.11, height: 0.075, depth: 0.26 },
      this.scene,
    );
    shoe.position.set(0, -RIG.shin - 0.03, 0.05);
    shoe.material = boot;
    shoe.parent = knee;

    this.meshes.push(thigh, short, kneeCap, shin, stocking, shoe);
    this.detailMeshes.push(kneeCap, stocking, shoe);
    return { hip, knee };
  }

  /** Shoulder → upper arm → elbow → forearm → hand. */
  private buildArm(id: string, side: -1 | 1, skin: PBRMaterial): Arm {
    const tag = side < 0 ? 'L' : 'R';
    const shoulder = new TransformNode(`arm${tag}-${id}`, this.scene);
    shoulder.position.set(side * RIG.shoulderX, RIG.shoulderY, 0);
    shoulder.parent = this.visual;

    const upper = MeshBuilder.CreateCylinder(
      `upperarm${tag}-${id}`,
      { height: RIG.upperArm, diameterTop: 0.125, diameterBottom: 0.1, tessellation: 8 },
      this.scene,
    );
    upper.position.y = -RIG.upperArm / 2;
    upper.material = skin;
    upper.parent = shoulder;

    const elbow = new TransformNode(`elbow${tag}-${id}`, this.scene);
    elbow.position.y = -RIG.upperArm;
    elbow.parent = shoulder;

    const joint = MeshBuilder.CreateSphere(
      `elbowcap${tag}-${id}`,
      { diameter: 0.1, segments: 6 },
      this.scene,
    );
    joint.material = skin;
    joint.parent = elbow;

    const forearm = MeshBuilder.CreateCylinder(
      `forearm${tag}-${id}`,
      { height: RIG.forearm, diameterTop: 0.098, diameterBottom: 0.078, tessellation: 8 },
      this.scene,
    );
    forearm.position.y = -RIG.forearm / 2;
    forearm.material = skin;
    forearm.parent = elbow;

    const hand = MeshBuilder.CreateSphere(
      `hand${tag}-${id}`,
      { diameter: 0.095, segments: 6 },
      this.scene,
    );
    hand.scaling.set(0.8, 1.15, 1);
    hand.position.y = -RIG.forearm - 0.02;
    hand.material = skin;
    hand.parent = elbow;

    this.meshes.push(upper, joint, forearm, hand);
    this.detailMeshes.push(joint, hand);
    return { shoulder, elbow };
  }

  /**
   * Level of detail, by distance.
   *
   * Joint caps, hands, boots, socks and hair are nine meshes nobody can
   * resolve from twenty metres away. Hiding them there is the cheapest LOD
   * there is, and unlike a swapped mesh it cannot pop the silhouette.
   */
  setDetailVisible(visible: boolean): void {
    if (visible === this.detailVisible) return;
    this.detailVisible = visible;
    for (const mesh of this.detailMeshes) mesh.setEnabled(visible);
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
    this.torsoMaterial.albedoTexture?.dispose();
    this.torsoMaterial.albedoTexture = createKitTexture(
      this.scene,
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

  /** Releases every mesh and material this view owns. */
  dispose(): void {
    this.torsoMaterial.albedoTexture?.dispose();
    this.visual.dispose(false, true);
  }

  /** Snaps the character back to a neutral pose facing a given direction. */
  reset(facing: number): void {
    this.visual.rotation.set(0, facing, 0);
    this.visual.position.y = this.baseVisualY;
    this.animator.reset();
  }

  /**
   * Drives the animation state machine and applies the resulting pose.
   * Rendering only — it never writes back into the simulation.
   */
  updateVisual(state: PlayerState, inputs: AnimatorInputs, dt: number): void {
    const pose = this.animator.update(state, inputs, dt);

    this.visual.rotation.y = state.facing;
    this.visual.position.y = this.baseVisualY + pose.bob;

    // The torso leans and twists; the legs hang off the body itself, so a
    // forward lean does not drag the feet out from under the player.
    this.torso.rotation.x = pose.torsoPitch;
    this.torso.rotation.z = pose.torsoRoll;
    this.torso.rotation.y = pose.torsoYaw;
    // The head stays roughly level whatever the body is doing, which is most
    // of what makes a run cycle look like a person rather than a puppet.
    this.head.rotation.x = -pose.torsoPitch * 0.6;
    this.head.rotation.y = -pose.torsoYaw * 0.4;

    this.poseLeg(this.legs.left, pose.leftLeg);
    this.poseLeg(this.legs.right, pose.rightLeg);
    this.poseArm(this.arms.left, pose.leftArm, pose.armsUp, -1);
    this.poseArm(this.arms.right, pose.rightArm, pose.armsUp, 1);

    // Counter-rotate so the ring never appears to spin with the body.
    this.marker.rotation.y = -this.visual.rotation.y;
  }

  /**
   * A knee folds because of where the leg is swung, not because something
   * authored it: drawn back behind the body it folds hard (the heel comes up),
   * reaching forward it stays nearly straight (that is the leg you stand on).
   * Deriving it here means all twelve animation states get knees for free and
   * none of them can disagree with the hip they hang from.
   */
  private poseLeg(leg: Leg, hipAngle: number): void {
    leg.hip.rotation.x = hipAngle;
    const drawnBack = Math.max(0, -hipAngle);
    const reachingForward = Math.max(0, hipAngle);
    leg.knee.rotation.x = clamp(0.1 + drawnBack * 1.15 + reachingForward * 0.3, 0, 2.2);
  }

  /** Elbows are never straight on a running body; they open as the arm rises. */
  private poseArm(arm: Arm, shoulderAngle: number, armsUp: number, side: -1 | 1): void {
    arm.shoulder.rotation.x = shoulderAngle;
    // Arms swing outwards as they are raised, so a celebration reads clearly.
    arm.shoulder.rotation.z = side * armsUp * 0.5;
    const bend = (0.38 + Math.abs(shoulderAngle) * 0.42) * (1 - armsUp * 0.65);
    arm.elbow.rotation.x = clamp(bend, 0, 1.6);
  }
}

/**
 * Skin, cloth and rubber all under one helper, differing only in roughness.
 * Skin is slightly glossy, a cotton shirt is not, and a boot is somewhere
 * between — which is enough to stop the character reading as one plastic
 * colour under a single light.
 */
function solidMaterial(scene: Scene, name: string, hex: string, roughness = 0.72): PBRMaterial {
  return createSurface(scene, name, {
    roughness,
    albedoColor: hex,
    // A character is often in their own shadow; without a floor the far side
    // of the body goes to black and the silhouette disappears.
    ambientLift: 0.26,
  });
}

/** Stable small hash, so a player id always picks the same skin and hair. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export type { Pose };
