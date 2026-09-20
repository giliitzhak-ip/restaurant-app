/**
 * PBR materials for the things you stand on, kick and hit.
 *
 * Physically based shading is what separates "coloured boxes" from a pitch you
 * believe in: the asphalt goes matte and the goal frame goes metallic, and
 * both change as the sun moves across them rather than staying a flat tint.
 * With the sky captured as an environment (see `Environment`) they also pick
 * up the world around them.
 *
 * Every map is drawn at runtime, like everything else here. There is no
 * third-party art in this project — see `docs/art-asset-pipeline.md`.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { Scene } from '@babylonjs/core/scene';

export interface SurfaceOptions {
  /** 0 is a mirror, 1 is chalk. */
  roughness: number;
  /** 0 for everything that is not actually metal. */
  metallic?: number;
  albedoColor?: string;
  albedoTexture?: BaseTexture;
  bumpTexture?: BaseTexture;
  /** glTF packing: green roughness, blue metallic. */
  metallicRoughnessTexture?: BaseTexture;
  emissiveColor?: string;
  alpha?: number;
  opacityTexture?: BaseTexture;
  backFaceCulling?: boolean;
  /** Keeps a surface from going black in shadow where ambient is all it has. */
  ambientLift?: number;
}

export function createSurface(scene: Scene, name: string, options: SurfaceOptions): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.metallic = options.metallic ?? 0;
  material.roughness = options.roughness;

  if (options.albedoTexture) material.albedoTexture = options.albedoTexture;
  if (options.albedoColor) material.albedoColor = Color3.FromHexString(options.albedoColor);
  if (options.bumpTexture) material.bumpTexture = options.bumpTexture;
  if (options.metallicRoughnessTexture) {
    // Babylon reads the same channels glTF does when told to.
    material.metallicTexture = options.metallicRoughnessTexture;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = true;
    material.useRoughnessFromMetallicTextureAlpha = false;
  }
  if (options.emissiveColor) {
    material.emissiveColor = Color3.FromHexString(options.emissiveColor);
  }
  if (options.opacityTexture) {
    material.opacityTexture = options.opacityTexture;
    material.useAlphaFromAlbedoTexture = false;
  }
  if (options.alpha !== undefined) material.alpha = options.alpha;
  if (options.backFaceCulling !== undefined) material.backFaceCulling = options.backFaceCulling;

  // Direct light only reaches half the pitch; without a floor the shaded half
  // reads as a hole rather than as shade.
  material.ambientColor = new Color3(1, 1, 1).scale(options.ambientLift ?? 0.12);

  return material;
}
