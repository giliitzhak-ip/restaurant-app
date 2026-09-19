/**
 * Visual effects: dust puffs, a ball trail, a struck-frame flash and a scoring
 * ring pulse.
 *
 * Everything is pooled and allocated once at construction. Nothing here creates
 * a mesh, a vector or an array during a frame, which is what keeps the effect
 * layer off the frame-time budget.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig, type QualityLevel } from '../config/GameConfig';
import { clamp } from '../core/math';
import type { Vec3 } from '../core/math';
import { Rng } from '../core/Rng';

interface DustParticle {
  mesh: Mesh;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

interface TrailSegment {
  mesh: Mesh;
  life: number;
}

/** How much of the effect budget each quality preset allows. */
const QUALITY_BUDGET: Record<QualityLevel, { dust: number; trail: boolean; flash: boolean }> = {
  low: { dust: 0, trail: false, flash: true },
  medium: { dust: 0.55, trail: true, flash: true },
  high: { dust: 1, trail: true, flash: true },
};

export class Effects {
  private readonly dust: DustParticle[] = [];
  private readonly trail: TrailSegment[] = [];
  private readonly rng = new Rng(0x9ab3c);

  private readonly dustMaterial: StandardMaterial;
  private readonly trailMaterial: StandardMaterial;
  private readonly flashMaterial: StandardMaterial;
  private readonly ringMaterial: StandardMaterial;
  private readonly ring: Mesh;

  private budget = QUALITY_BUDGET.medium;
  private trailCursor = 0;
  private ringLife = 0;
  private reduceFlashes = false;
  private readonly flashes: { mesh: Mesh; life: number; baseColor: Color3 }[] = [];

  constructor(private readonly scene: Scene) {
    this.dustMaterial = new StandardMaterial('dustMat', scene);
    this.dustMaterial.diffuseColor = Color3.FromHexString('#6a6257');
    this.dustMaterial.specularColor = Color3.Black();
    this.dustMaterial.disableLighting = true;

    this.trailMaterial = new StandardMaterial('trailMat', scene);
    this.trailMaterial.diffuseColor = Color3.FromHexString('#cfd6e2');
    this.trailMaterial.specularColor = Color3.Black();
    this.trailMaterial.disableLighting = true;

    this.flashMaterial = new StandardMaterial('frameFlashMat', scene);
    this.flashMaterial.diffuseColor = Color3.FromHexString('#ffd27a');
    this.flashMaterial.emissiveColor = Color3.FromHexString('#ffb43c');
    this.flashMaterial.specularColor = Color3.Black();

    this.ringMaterial = new StandardMaterial('celebrationRingMat', scene);
    this.ringMaterial.diffuseColor = Color3.FromHexString('#ffa524');
    this.ringMaterial.emissiveColor = Color3.FromHexString('#ffa524');
    this.ringMaterial.specularColor = Color3.Black();
    this.ringMaterial.disableLighting = true;

    // ── Pools, built once ────────────────────────────────────────────────────
    for (let i = 0; i < GameConfig.effects.dustPoolSize; i += 1) {
      const mesh = MeshBuilder.CreateDisc(`dust-${i}`, { radius: 0.5, tessellation: 6 }, scene);
      mesh.rotation.x = Math.PI / 2;
      mesh.material = this.dustMaterial;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.dust.push({ mesh, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, size: 1 });
    }

    for (let i = 0; i < GameConfig.effects.trailSegments; i += 1) {
      const mesh = MeshBuilder.CreateSphere(
        `trail-${i}`,
        { diameter: GameConfig.ball.radius * 1.5, segments: 6 },
        scene,
      );
      mesh.material = this.trailMaterial;
      mesh.isPickable = false;
      mesh.setEnabled(false);
      this.trail.push({ mesh, life: 0 });
    }

    this.ring = MeshBuilder.CreateDisc('celebrationRing', { radius: 1, tessellation: 32 }, scene);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.material = this.ringMaterial;
    this.ring.isPickable = false;
    this.ring.setEnabled(false);
  }

  setQuality(level: QualityLevel): void {
    this.budget = QUALITY_BUDGET[level];
    if (!this.budget.trail) {
      for (const segment of this.trail) {
        segment.life = 0;
        segment.mesh.setEnabled(false);
      }
    }
  }

  setReduceFlashes(reduce: boolean): void {
    this.reduceFlashes = reduce;
  }

  /** A puff of dust at ground level, e.g. a hard stop or the moment of a kick. */
  spawnDust(position: Vec3, amount: number, spread = 1.1): void {
    if (this.budget.dust <= 0) return;
    const count = Math.round(clamp(amount, 0, 1) * 6 * this.budget.dust);
    for (let i = 0; i < count; i += 1) {
      const particle = this.takeDust();
      if (!particle) return;
      particle.maxLife = GameConfig.effects.dustLifeSeconds * this.rng.range(0.7, 1.2);
      particle.life = particle.maxLife;
      particle.size = this.rng.range(0.12, 0.3);
      particle.vx = this.rng.jitter(spread);
      particle.vz = this.rng.jitter(spread);
      particle.vy = GameConfig.effects.dustRiseSpeed * this.rng.range(0.4, 1);
      particle.mesh.position.set(position.x, 0.04, position.z);
      particle.mesh.scaling.setAll(particle.size);
      particle.mesh.setEnabled(true);
    }
  }

  /** Lights up a struck goal-frame part. */
  flashFrame(mesh: Mesh): void {
    if (!this.budget.flash || this.reduceFlashes) return;
    const material = mesh.material;
    if (!(material instanceof StandardMaterial)) return;
    const existing = this.flashes.find((entry) => entry.mesh === mesh);
    if (existing) {
      existing.life = GameConfig.effects.frameFlashSeconds;
      return;
    }
    this.flashes.push({
      mesh,
      life: GameConfig.effects.frameFlashSeconds,
      baseColor: material.emissiveColor.clone(),
    });
  }

  /** A single expanding ring on the pitch after a score. Never blocks the view. */
  celebrate(position: Vec3, hex: string): void {
    if (this.reduceFlashes) return;
    this.ringMaterial.diffuseColor = Color3.FromHexString(hex);
    this.ringMaterial.emissiveColor = Color3.FromHexString(hex);
    this.ring.position.set(position.x, 0.05, position.z);
    this.ringLife = GameConfig.effects.celebrationSeconds;
    this.ring.setEnabled(true);
  }

  /**
   * Advances every effect. Called once per rendered frame.
   * `ballPosition` and `ballSpeed` drive the trail.
   */
  update(dt: number, ballPosition: Vec3, ballSpeed: number): void {
    this.updateDust(dt);
    this.updateTrail(dt, ballPosition, ballSpeed);
    this.updateFlashes(dt);
    this.updateRing(dt);
  }

  /** Stops everything, e.g. when leaving a match. */
  clear(): void {
    for (const particle of this.dust) {
      particle.life = 0;
      particle.mesh.setEnabled(false);
    }
    for (const segment of this.trail) {
      segment.life = 0;
      segment.mesh.setEnabled(false);
    }
    for (const flash of this.flashes) {
      const material = flash.mesh.material;
      if (material instanceof StandardMaterial) material.emissiveColor = flash.baseColor;
    }
    this.flashes.length = 0;
    this.ringLife = 0;
    this.ring.setEnabled(false);
  }

  private takeDust(): DustParticle | null {
    for (const particle of this.dust) {
      if (particle.life <= 0) return particle;
    }
    // Pool exhausted: drop the request rather than allocating mid-frame.
    return null;
  }

  private updateDust(dt: number): void {
    for (const particle of this.dust) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.mesh.setEnabled(false);
        continue;
      }
      const t = particle.life / particle.maxLife;
      particle.mesh.position.x += particle.vx * dt;
      particle.mesh.position.y += particle.vy * dt;
      particle.mesh.position.z += particle.vz * dt;
      particle.vy -= 1.4 * dt;
      // Dust grows and fades as it drifts.
      particle.mesh.scaling.setAll(particle.size * (1 + (1 - t) * 1.6));
      particle.mesh.visibility = t * 0.5;
    }
  }

  private updateTrail(dt: number, ballPosition: Vec3, ballSpeed: number): void {
    if (this.budget.trail && ballSpeed >= GameConfig.effects.trailMinSpeed) {
      const segment = this.trail[this.trailCursor];
      if (segment) {
        segment.mesh.position.set(ballPosition.x, ballPosition.y, ballPosition.z);
        segment.life = GameConfig.effects.trailFadeSeconds;
        segment.mesh.setEnabled(true);
        this.trailCursor = (this.trailCursor + 1) % this.trail.length;
      }
    }
    for (const segment of this.trail) {
      if (segment.life <= 0) continue;
      segment.life -= dt;
      if (segment.life <= 0) {
        segment.mesh.setEnabled(false);
        continue;
      }
      const t = segment.life / GameConfig.effects.trailFadeSeconds;
      segment.mesh.scaling.setAll(t * 0.9);
      segment.mesh.visibility = t * 0.5;
    }
  }

  private updateFlashes(dt: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      const flash = this.flashes[i];
      if (!flash) continue;
      flash.life -= dt;
      const material = flash.mesh.material;
      if (!(material instanceof StandardMaterial)) {
        this.flashes.splice(i, 1);
        continue;
      }
      if (flash.life <= 0) {
        material.emissiveColor = flash.baseColor;
        this.flashes.splice(i, 1);
        continue;
      }
      const t = flash.life / GameConfig.effects.frameFlashSeconds;
      Color3.LerpToRef(
        flash.baseColor,
        this.flashMaterial.emissiveColor,
        t,
        material.emissiveColor,
      );
    }
  }

  private updateRing(dt: number): void {
    if (this.ringLife <= 0) return;
    this.ringLife -= dt;
    if (this.ringLife <= 0) {
      this.ring.setEnabled(false);
      return;
    }
    const t = 1 - this.ringLife / GameConfig.effects.celebrationSeconds;
    this.ring.scaling.setAll(0.6 + t * 5.5);
    this.ring.visibility = (1 - t) * 0.45;
  }

  dispose(): void {
    this.clear();
    void this.scene;
  }
}
