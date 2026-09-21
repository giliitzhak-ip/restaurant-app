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
  /** 0..1 of a decaying speed pulse, from a hard strike. */
  private speedPulse = 0;
  private baseVignette = 1;

  constructor(private readonly scene: Scene) {}

  /** The camera changes between the solo and the shared rigs; follow it. */
  setCamera(camera: Camera): void {
    if (this.camera === camera) return;
    this.camera = camera;
    if (this.profile) this.apply(this.profile);
  }

  /**
   * A hard shot just left somebody's foot.
   *
   * What this does is deliberately small: the vignette tightens for about a
   * third of a second and lets go. Real motion blur would need a velocity
   * buffer for an object that crosses the screen in three frames, and the
   * camera itself barely moves, so a screen-space blur would render almost
   * nothing. A rim that closes in for a moment reads as pace and costs a
   * uniform. It is skipped entirely on the presets with no post chain.
   *
   * @param strength 0..1, normally the power of the strike
   */
  pulseSpeed(strength: number): void {
    this.speedPulse = Math.max(this.speedPulse, Math.max(0, Math.min(1, strength)));
  }

  /** Decays the speed pulse. Cheap enough to call every frame, always. */
  update(dt: number): void {
    if (this.speedPulse <= 0) return;
    this.speedPulse = Math.max(0, this.speedPulse - dt * SPEED_PULSE_DECAY);
    const processing = this.pipeline?.imageProcessing;
    if (processing) {
      processing.vignetteWeight = this.baseVignette + this.speedPulse * SPEED_PULSE_VIGNETTE;
    }
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
      pipeline.bloomThreshold = 0.9;
      pipeline.bloomWeight = 0.18;
      pipeline.bloomKernel = 48;
      pipeline.bloomScale = 0.5;
    }

    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.16;
    pipeline.sharpen.colorAmount = 1;

    pipeline.imageProcessingEnabled = true;
    const processing = pipeline.imageProcessing;
    processing.vignetteEnabled = true;
    // A hint of falloff at the corners, not a tunnel.
    processing.vignetteWeight = this.baseVignette;
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

/** How fast the speed pulse fades, in units per second. */
const SPEED_PULSE_DECAY = 3.2;

/** How much the vignette tightens at the peak of the pulse. */
const SPEED_PULSE_VIGNETTE = 2.4;
