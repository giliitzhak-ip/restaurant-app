/**
 * The people watching.
 *
 * A street pitch with nobody around it reads as a test level, and a crowd is
 * the cheapest thing that fixes it — as long as it stays cheap. These are thin
 * instances of one low-poly figure: a single draw call for the whole crowd,
 * one shared material, no skeletons and no per-figure meshes.
 *
 * They sway rather than animate. The matrices are rewritten a few times a
 * second, not every frame, because a crowd fifteen metres behind a chain-link
 * fence does not need sixty.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig } from '../config/GameConfig';
import { Rng } from '../core/Rng';

/** How often the sway is rewritten, in seconds. */
const SWAY_INTERVAL = 1 / 12;

interface Spectator {
  x: number;
  z: number;
  scale: number;
  yaw: number;
  phase: number;
  speed: number;
  amplitude: number;
}

export class Crowd {
  private readonly body: Mesh;
  private readonly material: StandardMaterial;
  private readonly spectators: Spectator[] = [];
  private matrices = new Float32Array(0);
  private readonly scratch = Matrix.Identity();
  private readonly scaling = new Vector3();
  private readonly translation = new Vector3();
  private readonly rotation = new Quaternion();
  private elapsed = 0;
  private sinceSway = 0;
  private count = 0;

  constructor(scene: Scene) {
    // One capsule: at this distance a silhouette is all anybody can make out,
    // and a silhouette is what a crowd is.
    this.body = MeshBuilder.CreateCapsule(
      'spectator',
      { height: 1.7, radius: 0.24, tessellation: 6, subdivisions: 1 },
      scene,
    );
    this.body.isPickable = false;
    this.body.alwaysSelectAsActiveMesh = true;

    this.material = new StandardMaterial('spectatorMat', scene);
    this.material.diffuseColor = Color3.FromHexString('#2a2d33');
    this.material.specularColor = Color3.Black();
    this.material.emissiveColor = Color3.FromHexString('#0b0c0e');
    this.body.material = this.material;
    this.body.setEnabled(false);
  }

  /**
   * Places `count` spectators around the outside of the fence. Called when the
   * quality preset changes; 0 removes them entirely.
   */
  setCount(count: number): void {
    if (count === this.count) return;
    this.count = count;
    this.spectators.length = 0;

    if (count <= 0) {
      this.body.setEnabled(false);
      this.body.thinInstanceCount = 0;
      return;
    }

    const rng = new Rng(0x5eed1);
    const { field, goal } = GameConfig;
    const halfWidth = field.width / 2;
    const halfLength = field.length / 2 + goal.depth;

    for (let i = 0; i < count; i += 1) {
      // Along the two long sides, in a couple of ragged rows, because a crowd
      // standing on a perfect line looks like a fence of its own.
      const side = i % 2 === 0 ? 1 : -1;
      const row = Math.floor(rng.next() * 3);
      const along = (rng.next() * 2 - 1) * halfLength * 0.94;
      this.spectators.push({
        x: side * (halfWidth + 1.5 + row * 0.85 + rng.next() * 0.5),
        z: along,
        scale: 0.88 + rng.next() * 0.28,
        yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
        phase: rng.next() * Math.PI * 2,
        speed: 0.6 + rng.next() * 0.7,
        amplitude: 0.03 + rng.next() * 0.05,
      });
    }

    this.matrices = new Float32Array(count * 16);
    this.body.setEnabled(true);
    this.writeMatrices();
  }

  update(dt: number): void {
    if (this.count === 0) return;
    this.elapsed += dt;
    this.sinceSway += dt;
    if (this.sinceSway < SWAY_INTERVAL) return;
    this.sinceSway = 0;
    this.writeMatrices();
  }

  dispose(): void {
    this.body.dispose();
    this.material.dispose();
    this.spectators.length = 0;
    this.count = 0;
  }

  private writeMatrices(): void {
    for (let i = 0; i < this.spectators.length; i += 1) {
      const person = this.spectators[i];
      if (!person) continue;
      const sway = Math.sin(this.elapsed * person.speed + person.phase) * person.amplitude;
      this.scaling.set(person.scale, person.scale, person.scale);
      this.translation.set(person.x, (1.7 * person.scale) / 2, person.z);
      Quaternion.RotationYawPitchRollToRef(person.yaw + sway, 0, sway * 0.6, this.rotation);
      Matrix.ComposeToRef(this.scaling, this.rotation, this.translation, this.scratch);
      this.scratch.copyToArray(this.matrices, i * 16);
    }
    this.body.thinInstanceSetBuffer('matrix', this.matrices, 16);
  }
}
