/**
 * Swinging the chase camera by hand.
 *
 * The automatic angle is a good guess and sometimes the wrong one: you cannot
 * see who is behind you, and you cannot line up a shot from the side. These
 * cover the control that fixes that — including the part that matters most,
 * which is that it gives the view back rather than leaving somebody playing
 * sideways without knowing why.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { GameConfig } from '../src/config/GameConfig';
import { CameraRig } from '../src/rendering/CameraRig';
import type { Vec3 } from '../src/core/math';

const LOOK = GameConfig.camera.look;
const at = (x: number, z: number): Vec3 => ({ x, y: 0, z });

let engine: NullEngine;
let scene: Scene;
let rig: CameraRig;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  rig = new CameraRig(scene);
  rig.snapTo(at(0, 0), at(0, 0), 'home');
});

afterEach(() => {
  scene.dispose();
  engine.dispose();
});

/** Runs the rig for a while with nobody touching it. */
function settle(seconds: number): void {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    rig.update(at(0, 0), at(0, 0), 'home', dt);
  }
}

describe('looking around', () => {
  it('starts at the automatic angle', () => {
    expect(rig.isLookingAround).toBe(false);
  });

  it('swings the view when dragged sideways', () => {
    const before = rig.movementYaw;
    rig.look(0.25, 0);
    expect(rig.isLookingAround).toBe(true);
    expect(Math.abs(rig.movementYaw - before)).toBeGreaterThan(0.3);
  });

  it('carries the movement frame with it, so forward stays forward on screen', () => {
    rig.look(0.5, 0);
    const swung = rig.movementYaw;
    rig.update(at(0, 0), at(0, 0), 'home', 1 / 60);
    // The stick is expressed in the yaw the player is actually looking along.
    expect(rig.movementYaw).toBeCloseTo(swung, 5);
  });

  it('refuses to swing further than its limit, however far you drag', () => {
    for (let i = 0; i < 50; i += 1) rig.look(0.5, 0.5);
    const yawAtLimit = rig.movementYaw;
    rig.look(0.5, 0.5);
    expect(rig.movementYaw).toBeCloseTo(yawAtLimit, 5);
  });

  it('moves the camera itself, not only the bookkeeping', () => {
    rig.update(at(0, 0), at(0, 0), 'home', 1 / 60);
    const before = { x: rig.camera.position.x, z: rig.camera.position.z };
    rig.look(0.4, 0);
    for (let i = 0; i < 90; i += 1) rig.update(at(0, 0), at(0, 0), 'home', 1 / 60);
    const moved = Math.hypot(rig.camera.position.x - before.x, rig.camera.position.z - before.z);
    expect(moved).toBeGreaterThan(1);
  });

  it('holds the view for a moment before giving it back', () => {
    rig.look(0.4, 0);
    const swung = rig.movementYaw;
    settle(LOOK.recentreDelay * 0.5);
    expect(rig.movementYaw).toBeCloseTo(swung, 3);
  });

  it('eases back to the automatic angle once you stop', () => {
    rig.look(0.4, 0.3);
    settle(LOOK.recentreDelay + LOOK.maxYaw / LOOK.recentreRate + 1);
    expect(rig.isLookingAround).toBe(false);
  });

  it('drops the swing at once on a kickoff, where the pitch turns round', () => {
    rig.look(0.5, 0.4);
    expect(rig.isLookingAround).toBe(true);
    rig.snapTo(at(0, 0), at(0, 0), 'home');
    expect(rig.isLookingAround).toBe(false);
  });

  it('ignores a drag of nothing', () => {
    rig.look(0, 0);
    expect(rig.isLookingAround).toBe(false);
  });
});
