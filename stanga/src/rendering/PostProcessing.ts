/**
 * The post chain: anti-aliasing, bloom, a vignette and a touch of sharpening.
 *
 * All of it is switchable and all of it is off on the lowest preset, because
 * on a phone the honest answer to "can we afford bloom" is usually no. The
 * chain is rebuilt rather than reconfigured when the preset changes: Babylon's
 * pipeline allocates its render targets at construction, and toggling them
 * afterwards leaves the memory allocated.
 */
import '@babylonjs/core/Rendering/prePassRendererSceneComponent';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { Scene } from '@babylonjs/core/scene';
import type { QualityProfile } from '../config/GameConfig';

export class PostProcessing {
  private pipeline: DefaultRenderingPipeline | null = null;
  private ssao: SSAO2RenderingPipeline | null = null;
  private camera: Camera | null = null;
  private profile: QualityProfile | null = null;

  constructor(private readonly scene: Scene) {}

  /** The camera changes between the solo and the shared rigs; follow it. */
  setCamera(camera: Camera): void {
    if (this.camera === camera) return;
    this.camera = camera;
    if (this.profile) this.apply(this.profile);
  }

  apply(profile: QualityProfile): void {
    this.profile = profile;
    this.dispose();
    const camera = this.camera ?? this.scene.activeCamera;
    if (!camera || !profile.postProcessing) return;

    const pipeline = new DefaultRenderingPipeline('stanga', true, this.scene, [camera]);
    // FXAA rather than MSAA: it survives a half-resolution backing store,
    // which is exactly where the cheaper presets are running.
    pipeline.fxaaEnabled = profile.antialias;
    pipeline.samples = 1;

    pipeline.bloomEnabled = profile.bloom;
    if (profile.bloom) {
      // Sunlight on wet asphalt, not a light show.
      pipeline.bloomThreshold = 0.86;
      pipeline.bloomWeight = 0.22;
      pipeline.bloomKernel = 48;
      pipeline.bloomScale = 0.5;
    }

    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.16;
    pipeline.sharpen.colorAmount = 1;

    pipeline.imageProcessingEnabled = true;
    const processing = pipeline.imageProcessing;
    processing.vignetteEnabled = true;
    processing.vignetteWeight = 2.2;
    processing.vignetteColor = new Color4(0, 0, 0, 0);
    processing.vignetteCameraFov = 1.2;

    this.pipeline = pipeline;

    if (profile.ambientOcclusion) {
      // Contact darkening where the players meet the ground and inside the
      // goal mouth. Expensive enough that only the top preset asks for it.
      const ssao = new SSAO2RenderingPipeline('stangaSsao', this.scene, { ssaoRatio: 0.5 }, [
        camera,
      ]);
      ssao.radius = 1.1;
      ssao.totalStrength = 0.9;
      ssao.samples = 16;
      ssao.expensiveBlur = false;
      this.ssao = ssao;
    }
  }

  dispose(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
    this.ssao?.dispose();
    this.ssao = null;
  }
}
