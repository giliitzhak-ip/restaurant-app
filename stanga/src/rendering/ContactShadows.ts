/**
 * Contact shadows.
 *
 * The shadow map handles the large directional shadows on medium and high
 * quality. These discs are the grounding cue that must never be missing: they
 * cost almost nothing, they work in the low quality preset where the shadow map
 * is off, and they still read correctly on GPUs or drivers where a depth-based
 * shadow map is unavailable.
 *
 * They multiply the ground rather than painting over it. A shadow that paints
 * an absolute colour has to guess how bright the lit pitch will end up, and
 * that guess is wrong the moment anything about the lighting changes: these
 * were pure black discs for a while, and then the right grey on one quality
 * preset and black holes on another, because the exposure differs between
 * them. Multiplying cannot be wrong that way — whatever is underneath gets
 * darker, and white means no shadow at all.
 */
import { Constants } from '@babylonjs/core/Engines/constants';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { clamp } from '../core/math';
import type { Vec3 } from '../core/math';

/** Height at which a contact shadow has faded away entirely. */
const FADE_HEIGHT = 3;
/** Multiplier directly under a grounded object: how much darker the ground goes. */
const SHADOW_COLOR = Color3.FromHexString('#6f747e');
/** No shadow. White multiplies to nothing. */
const CLEAR_COLOR = Color3.White();

interface Blob {
  mesh: Mesh;
  material: StandardMaterial;
  strength: number;
}

export class ContactShadows {
  private readonly blobs: Blob[] = [];
  private readonly offsetX: number;
  private readonly offsetZ: number;

  constructor(
    private readonly scene: Scene,
    lightDirection: Vector3,
  ) {
    // Metres the shadow slides sideways per metre of height, following the sun.
    const drop = Math.max(0.25, Math.abs(lightDirection.y));
    this.offsetX = lightDirection.x / drop;
    this.offsetZ = lightDirection.z / drop;
  }

  create(name: string, radius: number, strength = 1): number {
    const material = new StandardMaterial(`contactShadowMat-${name}`, this.scene);
    /*
     * With lighting disabled, Babylon renders `emissiveColor` and ignores
     * `diffuseColor` entirely — so the tint has to be written there. It was
     * being written to the diffuse, which left every one of these discs pure
     * black: unnoticeable on a dark pitch, and a hole punched in a bright one.
     */
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveColor = SHADOW_COLOR.clone();
    // Multiply: the disc scales what is already on screen, so it darkens the
    // pitch by the same amount whatever the exposure of the preset in use.
    material.alphaMode = Constants.ALPHA_MULTIPLY;
    material.alpha = 0.999;
    material.backFaceCulling = false;
    // Same trick the pitch markings use to stay above the asphalt.
    material.zOffset = -2;

    const mesh = MeshBuilder.CreateDisc(
      `contactShadow-${name}`,
      { radius, tessellation: 28 },
      this.scene,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = false;

    this.blobs.push({ mesh, material, strength });
    return this.blobs.length - 1;
  }

  /** Hides one blob, for a shadow whose player is not on the pitch. */
  setBlobEnabled(handle: number, enabled: boolean): void {
    this.blobs[handle]?.mesh.setEnabled(enabled);
  }

  /** Places a shadow under an object, given its height above the ground. */
  update(handle: number, position: Vec3, heightAboveGround: number): void {
    const blob = this.blobs[handle];
    if (!blob) return;

    const height = clamp(heightAboveGround, 0, FADE_HEIGHT);
    const fade = (1 - height / FADE_HEIGHT) * blob.strength;
    if (fade <= 0.04) {
      blob.mesh.setEnabled(false);
      return;
    }

    blob.mesh.setEnabled(true);
    // Higher up: larger, lighter, and offset towards the sun.
    const spread = 1 + height * 0.45;
    blob.mesh.scaling.set(spread, spread, 1);
    blob.mesh.position.set(
      position.x - this.offsetX * height,
      0.02,
      position.z - this.offsetZ * height,
    );
    Color3.LerpToRef(CLEAR_COLOR, SHADOW_COLOR, fade, blob.material.emissiveColor);
  }

  setEnabled(enabled: boolean): void {
    for (const blob of this.blobs) blob.mesh.setEnabled(enabled);
  }
}
