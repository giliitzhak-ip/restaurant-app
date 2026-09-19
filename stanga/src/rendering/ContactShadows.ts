/**
 * Contact shadows.
 *
 * The shadow map handles the large directional shadows on medium and high
 * quality. These discs are the grounding cue that must never be missing: they
 * cost almost nothing, they work in the low quality preset where the shadow map
 * is off, and they still read correctly on GPUs or drivers where a depth-based
 * shadow map is unavailable.
 *
 * They are deliberately opaque and tinted towards the asphalt rather than
 * alpha-blended: a blended overlay is at the mercy of the driver's transparency
 * sorting, and a missing shadow is far worse than a slightly firmer one.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { clamp } from '../core/math';
import type { Vec3 } from '../core/math';

/** Height at which a contact shadow has faded into the ground colour. */
const FADE_HEIGHT = 3;
/** Darkest tint, directly under a grounded object. */
const SHADOW_COLOR = Color3.FromHexString('#212329');
/** The colour the disc fades towards: the lit asphalt around it. */
const GROUND_COLOR = Color3.FromHexString('#3c3e45');

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
    material.disableLighting = true;
    material.diffuseColor = SHADOW_COLOR.clone();
    material.specularColor = Color3.Black();
    material.emissiveColor = Color3.Black();
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
    Color3.LerpToRef(GROUND_COLOR, SHADOW_COLOR, fade, blob.material.diffuseColor);
  }

  setEnabled(enabled: boolean): void {
    for (const blob of this.blobs) blob.mesh.setEnabled(enabled);
  }
}
