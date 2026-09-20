/**
 * The look of the ball. Client only: it decorates the mesh that BallBody
 * already created, so the server never touches a texture.
 *
 * A match ball is the one object on the pitch with a coating on it, and the
 * one the camera is always pointed at. It gets the lowest roughness in the
 * scene so it picks up a highlight and a hint of the sky, which is most of
 * what sells the lighting to somebody watching the ball rather than the pitch.
 */
import { createSurface } from './Surfaces';
import type { Scene } from '@babylonjs/core/scene';
import type { BallBody } from '../entities/BallBody';
import { createBallTexture } from './ProceduralTextures';

export class BallView {
  constructor(scene: Scene, ball: BallBody) {
    ball.mesh.material = createSurface(scene, 'ballMat', {
      roughness: 0.34,
      albedoTexture: createBallTexture(scene),
      ambientLift: 0.22,
    });
    ball.mesh.receiveShadows = true;
  }
}
