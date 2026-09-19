/**
 * QualityManager — the low / medium / high presets.
 * Changes render resolution, shadows and scene effects at runtime, without
 * rebuilding the scene.
 */
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { GameConfig, type QualityLevel, type QualityProfile } from '../config/GameConfig';

export class QualityManager {
  private generator: ShadowGenerator | null = null;
  private level: QualityLevel = 'medium';
  private readonly casters = new Set<AbstractMesh>();

  constructor(
    private readonly engine: AbstractEngine,
    private readonly sun: DirectionalLight,
    initialCasters: readonly AbstractMesh[] = [],
  ) {
    for (const mesh of initialCasters) this.casters.add(mesh);
  }

  get current(): QualityLevel {
    return this.level;
  }

  get profile(): QualityProfile {
    return GameConfig.quality[this.level];
  }

  addCaster(mesh: AbstractMesh): void {
    this.casters.add(mesh);
    this.generator?.addShadowCaster(mesh, true);
  }

  apply(level: QualityLevel): void {
    this.level = level;
    const profile = GameConfig.quality[level];

    this.applyPixelRatio(profile);

    if (!profile.shadows) {
      this.disposeGenerator();
      this.sun.shadowEnabled = false;
      return;
    }

    this.sun.shadowEnabled = true;
    // The shadow map size is fixed at creation, so a change means a new generator.
    if (!this.generator || this.generator.mapSize !== profile.shadowMapSize) {
      this.disposeGenerator();
      const generator = new ShadowGenerator(profile.shadowMapSize, this.sun);
      // PCF gives a crisp contact shadow that survives on low-end GPUs, where
      // the exponential variants tend to wash out entirely.
      generator.usePercentageCloserFiltering = true;
      generator.filteringQuality =
        profile.shadowMapSize >= 2048
          ? ShadowGenerator.QUALITY_HIGH
          : ShadowGenerator.QUALITY_MEDIUM;
      generator.darkness = 0.34;
      // Bias is in normalized depth: anything large enough to matter here also
      // pushes a player-sized shadow off the ground entirely.
      generator.bias = 0.0006;
      generator.normalBias = 0.012;
      this.generator = generator;
      for (const mesh of this.casters) generator.addShadowCaster(mesh, true);
    }
  }

  /** Recomputes the backing-store resolution; call on resize too. */
  applyPixelRatio(profile: QualityProfile = this.profile): void {
    const devicePixelRatio =
      typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const effective = Math.min(devicePixelRatio, profile.maxPixelRatio);
    // Babylon's hardware scaling is the inverse of the pixel ratio.
    this.engine.setHardwareScalingLevel(1 / effective);
  }

  /** Cheap frame-rate guard: drop the resolution once if we are far off target. */
  degradeOnce(): void {
    const current = this.engine.getHardwareScalingLevel();
    if (current >= 2) return;
    this.engine.setHardwareScalingLevel(Math.min(2, current * 1.25));
  }

  dispose(): void {
    this.disposeGenerator();
    this.casters.clear();
  }

  private disposeGenerator(): void {
    this.generator?.dispose();
    this.generator = null;
  }
}
