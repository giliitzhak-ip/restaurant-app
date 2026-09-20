/**
 * The look of the ball. Client only: it decorates the mesh that BallBody
 * already created, so the server never touches a texture.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { BallBody } from '../entities/BallBody';
import { createBallTexture } from './ProceduralTextures';

export class BallView {
  constructor(scene: Scene, ball: BallBody) {
    const material = new StandardMaterial('ballMat', scene);
    material.diffuseTexture = createBallTexture(scene);
    material.specularColor = new Color3(0.42, 0.42, 0.45);
    material.specularPower = 48;
    ball.mesh.material = material;
    ball.mesh.receiveShadows = true;
  }
}
