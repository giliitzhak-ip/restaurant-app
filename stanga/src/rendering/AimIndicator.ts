/**
 * What the shot about to be struck will do.
 *
 * Two things, because a strike has two parts a player needs to see: a ground
 * strip under the player for the direction and the power, and a short,
 * translucent arc for the height. The arc is the important one — a game where
 * the ball can be lifted needs a way to tell, before releasing, whether this
 * one goes under the bar or over it.
 *
 * The arc is not an approximation of the shot. It runs the same `resolveShot`
 * the foot will run and the same flight model the simulation steps, so what is
 * drawn is what happens. Purely visual: it reads the match state and never
 * writes to it.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig } from '../config/GameConfig';
import { sampleFlight } from '../game/BallFlight';
import { resolveShot } from '../game/ShotResolver';
import type { Vec3 } from '../core/math';
import type { BallState, PlayerState } from '../game/MatchState';

/** How many points the arc is drawn from. Enough to read as a curve. */
const ARC_POINTS = 18;

/** How far into the flight the preview looks. Short on purpose. */
const ARC_SECONDS = 0.85;

const FLAT_COLOR = Color3.FromHexString('#ffa524');
const HIGH_COLOR = Color3.FromHexString('#57b8ff');

export class AimIndicator {
  private readonly strip: Mesh;
  private readonly stripMaterial: StandardMaterial;
  private readonly landing: Mesh;
  private readonly landingMaterial: StandardMaterial;
  private arc: LinesMesh;
  /** Reused every frame, so drawing the preview allocates nothing. */
  private readonly samples: Vec3[] = Array.from({ length: ARC_POINTS }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));
  private readonly points: Vector3[] = Array.from({ length: ARC_POINTS }, () => new Vector3());

  constructor(private readonly scene: Scene) {
    // A flat, tapered strip: reads clearly from the chase camera.
    this.strip = MeshBuilder.CreateGround('aimIndicator', { width: 0.7, height: 1 }, scene);
    this.strip.isPickable = false;
    this.strip.setEnabled(false);
    // Pivot at the near edge so the strip grows away from the player.
    this.strip.setPivotPoint(new Vector3(0, 0, -0.5));

    this.stripMaterial = new StandardMaterial('aimIndicatorMat', scene);
    this.stripMaterial.emissiveColor = FLAT_COLOR.clone();
    this.stripMaterial.diffuseColor = Color3.Black();
    this.stripMaterial.specularColor = Color3.Black();
    this.stripMaterial.alpha = 0.55;
    this.stripMaterial.zOffset = -4;
    this.strip.material = this.stripMaterial;

    this.arc = MeshBuilder.CreateLines('aimArc', { points: this.points, updatable: true }, scene);
    this.arc.isPickable = false;
    this.arc.alwaysSelectAsActiveMesh = true;
    this.arc.setEnabled(false);
    this.arc.color = FLAT_COLOR.clone();

    // Where it comes down, so a lofted ball can be placed rather than guessed.
    this.landing = MeshBuilder.CreateDisc('aimLanding', { radius: 0.34, tessellation: 18 }, scene);
    this.landing.rotation.x = Math.PI / 2;
    this.landing.isPickable = false;
    this.landing.setEnabled(false);
    this.landingMaterial = new StandardMaterial('aimLandingMat', scene);
    this.landingMaterial.emissiveColor = FLAT_COLOR.clone();
    this.landingMaterial.diffuseColor = Color3.Black();
    this.landingMaterial.specularColor = Color3.Black();
    this.landingMaterial.alpha = 0.4;
    this.landingMaterial.zOffset = -4;
    this.landing.material = this.landingMaterial;
  }

  /**
   * @param player  whoever is charging, or undefined when nobody is
   * @param charge  0..1 of the power meter
   * @param ball    where the ball is, which decides the arc and the volley
   */
  update(player: PlayerState | undefined, charge: number, ball: BallState | undefined): void {
    if (!player || !player.charging || charge <= 0.02) {
      this.hide();
      return;
    }

    const length = 1.6 + charge * 7.5;
    this.strip.setEnabled(true);
    this.strip.scaling.set(1 + charge * 0.5, 1, length);
    this.strip.position.set(
      player.position.x + Math.sin(player.facing) * (length / 2 + GameConfig.player.radius),
      0.02,
      player.position.z + Math.cos(player.facing) * (length / 2 + GameConfig.player.radius),
    );
    this.strip.rotation.y = player.facing;
    this.stripMaterial.alpha = 0.32 + charge * 0.38;

    const high = player.verticalAim > 0.25;
    const color = high ? HIGH_COLOR : FLAT_COLOR;
    this.stripMaterial.emissiveColor.copyFrom(color);
    this.landingMaterial.emissiveColor.copyFrom(color);

    if (!ball) {
      this.arc.setEnabled(false);
      this.landing.setEnabled(false);
      return;
    }

    // Exactly the strike the foot would make, if it connected right now.
    const shot = resolveShot({
      yaw: player.facing,
      power: Math.max(charge, GameConfig.kick.minPower),
      verticalAim: player.verticalAim,
      spin: player.spin,
      style: player.chipRequested ? 'chip' : player.shotStyle,
      runSpeed: Math.hypot(player.velocity.x, player.velocity.z),
      ballHeight: ball.position.y,
    });

    const used = sampleFlight(
      ball.position,
      shot.velocityX,
      shot.velocityY,
      shot.velocityZ,
      shot.spinRate,
      ARC_SECONDS,
      this.samples,
    );

    for (let i = 0; i < this.points.length; i += 1) {
      // Points past the end of the flight collapse onto the last real one, so
      // the line simply stops rather than shooting off somewhere.
      const sample = this.samples[Math.min(i, used - 1)];
      const target = this.points[i];
      if (!sample || !target) continue;
      target.set(sample.x, sample.y, sample.z);
    }

    this.arc = MeshBuilder.CreateLines(
      'aimArc',
      { points: this.points, instance: this.arc },
      this.scene,
    );
    this.arc.setEnabled(true);
    this.arc.color.copyFrom(color);
    this.arc.alpha = 0.3 + charge * 0.35;

    const end = this.samples[used - 1];
    if (end) {
      this.landing.setEnabled(true);
      this.landing.position.set(end.x, 0.025, end.z);
      this.landingMaterial.alpha = 0.22 + charge * 0.28;
    }
  }

  hide(): void {
    this.strip.setEnabled(false);
    this.arc.setEnabled(false);
    this.landing.setEnabled(false);
  }
}
