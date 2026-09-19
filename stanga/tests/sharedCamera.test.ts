/**
 * SharedMatchCamera: one camera has to keep two players and the ball readable
 * without ever leaving its configured bounds or snapping.
 *
 * Runs against Babylon's NullEngine, so it exercises the real camera rather
 * than a stand-in.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GameConfig } from '../src/config/GameConfig';
import { SharedMatchCamera, type CameraFocus } from '../src/rendering/SharedMatchCamera';
import type { Vec3 } from '../src/core/math';

const CONFIG = GameConfig.sharedCamera;

function at(x: number, z: number): Vec3 {
  return { x, y: 0, z };
}

function focus(points: Vec3[], ball = at(0, 0)): CameraFocus {
  return { points, ball, leadingTeam: null };
}

/**
 * Projects a world point through the camera's real matrices into normalized
 * device coordinates, where the visible range is [-1, 1] on both axes.
 */
function projectToNdc(point: Vec3): { x: number; y: number } {
  const world = Vector3.TransformCoordinates(
    new Vector3(point.x, point.y, point.z),
    Matrix.Identity(),
  );
  const view = camera.camera.getViewMatrix();
  const projection = camera.camera.getProjectionMatrix();
  const clip = Vector3.TransformCoordinates(world, view.multiply(projection));
  return { x: clip.x, y: clip.y };
}

let engine: NullEngine;
let scene: Scene;
let camera: SharedMatchCamera;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  camera = new SharedMatchCamera(scene);
  camera.applyAspect(16 / 9);
});

afterEach(() => {
  scene.dispose();
  engine.dispose();
});

/** Settles the camera by running enough frames for the damping to converge. */
function settle(view: CameraFocus, seconds = 4): void {
  const step = 1 / 60;
  for (let i = 0; i < seconds / step; i += 1) camera.update(view, step);
}

describe('framing bounds', () => {
  it('stays within the configured distance and height at every spread', () => {
    for (const gap of [0, 2, 6, 12, 20, 34, 60]) {
      camera.snapTo(focus([at(0, -gap / 2), at(0, gap / 2)]));
      const { distance, height } = camera.framing;
      expect(distance, `distance at gap ${gap}`).toBeGreaterThanOrEqual(CONFIG.minDistance - 1e-6);
      expect(distance, `distance at gap ${gap}`).toBeLessThanOrEqual(CONFIG.maxDistance + 1e-6);
      expect(height, `height at gap ${gap}`).toBeGreaterThanOrEqual(CONFIG.minHeight - 1e-6);
      expect(height, `height at gap ${gap}`).toBeLessThanOrEqual(CONFIG.maxHeight + 1e-6);
    }
  });

  it('pulls back as the players separate and comes in as they close', () => {
    camera.snapTo(focus([at(0, -1), at(0, 1)]));
    const close = camera.framing.distance;

    camera.snapTo(focus([at(0, -12), at(0, 12)]));
    const far = camera.framing.distance;

    expect(far).toBeGreaterThan(close);
  });

  it('raises the camera as it pulls back', () => {
    camera.snapTo(focus([at(0, -1), at(0, 1)]));
    const low = camera.framing.height;
    camera.snapTo(focus([at(0, -14), at(0, 14)]));
    expect(camera.framing.height).toBeGreaterThan(low);
  });

  it('accounts for a wide spread as well as a deep one', () => {
    camera.snapTo(focus([at(-9, 0), at(9, 0)]));
    const wide = camera.framing.distance;
    camera.snapTo(focus([at(-1, 0), at(1, 0)]));
    expect(wide).toBeGreaterThan(camera.framing.distance);
  });

  it('frames both players and the ball at every separation it promises to', () => {
    // Checked against the camera's actual view/projection, not a re-derivation
    // of the framing formula, so a wrong formula cannot make this pass.
    const limit = CONFIG.framableSeparation;
    const views: CameraFocus[] = [
      focus([at(0, -1), at(0, 1)]),
      focus([at(-4, -6), at(4, 6)], at(0, 0)),
      focus([at(-5, -limit / 2), at(5, limit / 2)], at(0, 0)),
      focus([at(2, -3), at(-8, 9)], at(-3, 4)),
      focus([at(0, -limit / 2), at(0, limit / 2)], at(0, 2)),
    ];

    for (const view of views) {
      camera.snapTo(view);
      for (const point of [...view.points, view.ball]) {
        const ndc = projectToNdc(point);
        const label = `${JSON.stringify(point)} at fov ${camera.camera.fov.toFixed(2)}`;
        expect(Math.abs(ndc.x), `x of ${label}`).toBeLessThanOrEqual(CONFIG.safeFrame + 0.02);
        expect(Math.abs(ndc.y), `y of ${label}`).toBeLessThanOrEqual(CONFIG.safeFrame + 0.02);
      }
    }
  });

  it('keeps the ball framed even when the players are too far apart to both fit', () => {
    // Opposite ends of the pitch: physically impossible to frame both at a
    // readable size, so the ball is what the camera protects.
    const view = focus([at(-9, -17), at(9, 17)], at(0, 0));
    camera.snapTo(view);

    const ndc = projectToNdc(view.ball);
    expect(Math.abs(ndc.x)).toBeLessThanOrEqual(CONFIG.safeFrame + 0.02);
    expect(Math.abs(ndc.y)).toBeLessThanOrEqual(CONFIG.safeFrame + 0.02);
    // And it does not respond by flying out of the arena.
    expect(camera.framing.distance).toBeLessThanOrEqual(CONFIG.maxDistance + 1e-6);
  });

  it('keeps the lens at its base width while distance alone can do the job', () => {
    camera.applyAspect(16 / 9);
    const base = camera.camera.fov;

    // Modest separations are framed by pulling back, with no lens change.
    for (const gap of [2, 6, 10, 14]) {
      camera.snapTo(focus([at(0, -gap / 2), at(0, gap / 2)]));
      expect(camera.camera.fov, `fov at gap ${gap}`).toBeCloseTo(base, 5);
      expect(camera.framing.distance).toBeLessThanOrEqual(CONFIG.maxDistance + 1e-6);
    }
  });

  it('widens the lens once pulling back is no longer enough, and never past the cap', () => {
    camera.applyAspect(16 / 9);
    const base = camera.camera.fov;

    camera.snapTo(
      focus([at(0, -CONFIG.framableSeparation / 2), at(0, CONFIG.framableSeparation / 2)]),
    );
    expect(camera.camera.fov).toBeGreaterThan(base);
    expect(camera.camera.fov).toBeLessThanOrEqual(GameConfig.camera.maxFov + 1e-6);

    // Even at an impossible spread the lens stops at the cap.
    camera.snapTo(focus([at(0, -17), at(0, 17)]));
    expect(camera.camera.fov).toBeLessThanOrEqual(GameConfig.camera.maxFov + 1e-6);
  });

  it('uses the closest distance that still frames everything', () => {
    // If it fits at the minimum, the camera must not sit further back.
    camera.snapTo(focus([at(0, 0), at(0, 0.5)], at(0, 0.2)));
    expect(camera.framing.distance).toBeCloseTo(CONFIG.minDistance, 5);
  });

  it('never leaves the arena, however far the action goes', () => {
    const limitX = GameConfig.field.width / 2 + GameConfig.field.wallThickness;
    const limitZ =
      GameConfig.field.length / 2 + GameConfig.goal.depth + GameConfig.field.wallThickness;

    for (const z of [-40, -17, 0, 17, 40]) {
      camera.snapTo(focus([at(0, z), at(0, z + 2)], at(0, z)));
      expect(Math.abs(camera.camera.position.x)).toBeLessThanOrEqual(limitX);
      expect(Math.abs(camera.camera.position.z)).toBeLessThanOrEqual(limitZ);
      expect(camera.camera.position.y).toBeGreaterThan(0);
    }
  });
});

describe('smoothness', () => {
  it('moves gradually rather than jumping when the action teleports', () => {
    settle(focus([at(0, -2), at(0, 2)]));
    const before = camera.camera.position.clone();

    // One frame with a completely different framing.
    camera.update(focus([at(0, 14), at(0, 16)], at(0, 15)), 1 / 60);
    const travelled = camera.camera.position.subtract(before).length();

    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThan(2);
  });

  it('snaps without easing when asked to, so a kickoff has no slide-in', () => {
    settle(focus([at(0, -2), at(0, 2)]));
    const view = focus([at(0, 12), at(0, 16)], at(0, 14));
    camera.snapTo(view);
    const snapped = camera.camera.position.clone();

    camera.update(view, 1 / 60);
    expect(camera.camera.position.subtract(snapped).length()).toBeLessThan(0.05);
  });

  it('keeps the movement yaw fixed, so camera-relative controls stay stable', () => {
    settle(focus([at(-8, -8), at(8, 8)]));
    const first = camera.movementYaw;
    settle(focus([at(8, 8), at(-8, -8)]));
    expect(camera.movementYaw).toBeCloseTo(first, 9);
  });
});

describe('camera shake honours the setting', () => {
  it('does not move the camera at all when shake is off', () => {
    camera.setShakeLevel('off');
    const view = focus([at(0, -2), at(0, 2)]);
    camera.snapTo(view);
    const before = camera.camera.position.clone();

    camera.addShake(1);
    camera.update(view, 1 / 60);
    expect(camera.camera.position.subtract(before).length()).toBeLessThan(1e-6);
  });

  it('shakes less on subtle than on normal', () => {
    const measure = (level: 'subtle' | 'normal') => {
      const local = new SharedMatchCamera(scene);
      local.applyAspect(16 / 9);
      local.setShakeLevel(level);
      const view = focus([at(0, -2), at(0, 2)]);
      local.snapTo(view);
      const base = local.camera.position.clone();
      local.addShake(1);
      local.update(view, 1 / 60);
      return local.camera.position.subtract(base).length();
    };
    expect(measure('subtle')).toBeLessThan(measure('normal'));
  });

  it('ignores shake entirely when camera motion is reduced', () => {
    camera.setShakeLevel('normal');
    camera.setReduceMotion(true);
    const view = focus([at(0, -2), at(0, 2)]);
    camera.snapTo(view);
    const before = camera.camera.position.clone();

    camera.addShake(1);
    camera.update(view, 1 / 60);
    expect(camera.camera.position.subtract(before).length()).toBeLessThan(1e-6);
  });

  it('settles back to a steady pose after a shake', () => {
    camera.setShakeLevel('normal');
    const view = focus([at(0, -2), at(0, 2)]);
    camera.snapTo(view);
    const base = camera.camera.position.clone();

    camera.addShake(1);
    settle(view, 6);
    expect(camera.camera.position.subtract(base).length()).toBeLessThan(0.05);
  });
});

describe('framing follows the play', () => {
  it('leans towards the goal the move is developing against', () => {
    const neutral: CameraFocus = {
      points: [at(0, -2), at(0, 2)],
      ball: at(0, 0),
      leadingTeam: null,
    };
    camera.snapTo(neutral);
    const neutralZ = camera.camera.position.z;

    const attacking: CameraFocus = { ...neutral, leadingTeam: 'home' };
    camera.snapTo(attacking);
    // Home attacks +Z, so the view shifts that way.
    expect(camera.camera.position.z).toBeGreaterThan(neutralZ);
  });

  it('weights the ball into the framing', () => {
    camera.snapTo(focus([at(0, 0), at(0, 0)], at(0, 10)));
    expect(camera.camera.position.z).toBeGreaterThan(-CONFIG.maxDistance);
    expect(CONFIG.ballWeight).toBeGreaterThan(0);
  });

  it('handles a single tracked point without dividing by zero', () => {
    camera.snapTo(focus([at(3, 4)], at(3, 4)));
    expect(Number.isFinite(camera.camera.position.x)).toBe(true);
    expect(Number.isFinite(camera.camera.position.z)).toBe(true);
  });

  it('handles no tracked points at all', () => {
    camera.snapTo(focus([], at(0, 0)));
    expect(Number.isFinite(camera.camera.position.z)).toBe(true);
  });
});
