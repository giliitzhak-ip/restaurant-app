/**
 * Image-based lighting, captured from the scene's own sky.
 *
 * PBR materials need something to reflect. The usual answer is a prefiltered
 * HDR environment shipped as an asset — but this project has no third-party
 * art in it, and inventing one would be a licence we cannot document. So the
 * sky dome that is already there is rendered into a cube map once, with a
 * `ReflectionProbe`, and that becomes the scene's environment.
 *
 * It is a real capture of the real sky: the asphalt picks up the blue above
 * it, the goal frames catch the sun's side, and the ball has something to be
 * shiny about. It is not a prefiltered HDR — roughness is approximated from
 * the mip chain rather than from a proper convolution — and that is the
 * honest limit of doing this without assets.
 */
import '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';

/** Cube face size. 128 is plenty for a sky with no fine detail in it. */
const PROBE_SIZE = 128;

export class Environment {
  private probe: ReflectionProbe | null = null;
  private enabled = false;

  constructor(private readonly scene: Scene) {
    this.configureImageProcessing();
  }

  /**
   * Captures the sky once and lights the scene with it.
   *
   * @param sources the meshes worth reflecting — the sky dome, and the far
   *   scenery that gives the horizon its colour. Deliberately not the players:
   *   a probe that has to re-render every frame is a different budget.
   */
  enable(sources: readonly AbstractMesh[]): void {
    if (this.enabled) return;
    const probe = new ReflectionProbe('skyProbe', PROBE_SIZE, this.scene);
    probe.position = new Vector3(0, 6, 0);
    for (const mesh of sources) probe.renderList?.push(mesh);
    // Once: the sky does not move, and a live probe would cost six extra
    // render passes a frame for a reflection nobody would notice changing.
    probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    probe.cubeTexture.gammaSpace = false;

    this.scene.environmentTexture = probe.cubeTexture;
    this.scene.environmentIntensity = 0.85;
    this.probe = probe;
    this.enabled = true;
  }

  disable(): void {
    if (!this.enabled) return;
    this.scene.environmentTexture = null;
    this.probe?.dispose();
    this.probe = null;
    this.enabled = false;
  }

  setEnabled(enabled: boolean, sources: readonly AbstractMesh[]): void {
    if (enabled) this.enable(sources);
    else this.disable();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {
    this.disable();
  }

  /**
   * Tone mapping and exposure.
   *
   * This applies whether or not there is a post-processing pipeline, because
   * it lives on the materials' image processing rather than on a post-process:
   * without it, a PBR scene lit by a bright sky clips to white in the sunlit
   * half of the pitch.
   */
  private configureImageProcessing(): void {
    const processing = this.scene.imageProcessingConfiguration;
    processing.toneMappingEnabled = true;
    processing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    processing.exposure = 1.05;
    processing.contrast = 1.12;
  }
}
