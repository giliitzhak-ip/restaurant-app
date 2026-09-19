/**
 * A ground arrow showing where a charged shot will go, and how hard.
 * Purely visual; it reads the match state and never writes to it.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig } from '../config/GameConfig';
import type { PlayerState } from '../game/MatchState';

export class AimIndicator {
  private readonly mesh: Mesh;
  private readonly material: StandardMaterial;

  constructor(scene: Scene) {
    // A flat, tapered strip: reads clearly from the chase camera.
    this.mesh = MeshBuilder.CreateGround('aimIndicator', { width: 0.7, height: 1 }, scene);
    this.mesh.isPickable = false;
    this.mesh.setEnabled(false);
    // Pivot at the near edge so the strip grows away from the player.
    this.mesh.setPivotPoint(new Vector3(0, 0, -0.5));

    this.material = new StandardMaterial('aimIndicatorMat', scene);
    this.material.emissiveColor = Color3.FromHexString('#ffa524');
    this.material.diffuseColor = Color3.Black();
    this.material.specularColor = Color3.Black();
    this.material.alpha = 0.55;
    this.material.zOffset = -4;
    this.mesh.material = this.material;
  }

  update(player: PlayerState | undefined, charge: number, lofted: boolean): void {
    if (!player || !player.charging || charge <= 0.02) {
      this.mesh.setEnabled(false);
      return;
    }
    const length = 1.6 + charge * 7.5;
    this.mesh.setEnabled(true);
    this.mesh.scaling.set(1 + charge * 0.5, 1, length);
    this.mesh.position.set(
      player.position.x + Math.sin(player.facing) * (length / 2 + GameConfig.player.radius),
      0.02,
      player.position.z + Math.cos(player.facing) * (length / 2 + GameConfig.player.radius),
    );
    this.mesh.rotation.y = player.facing;
    this.material.alpha = 0.32 + charge * 0.38;
    this.material.emissiveColor = lofted
      ? Color3.FromHexString('#57b8ff')
      : Color3.FromHexString('#ffa524');
  }

  hide(): void {
    this.mesh.setEnabled(false);
  }
}
