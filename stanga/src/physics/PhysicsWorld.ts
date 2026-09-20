/**
 * PhysicsWorld — owns the Havok world and, crucially, owns *when* it steps.
 *
 * Babylon normally advances physics once per rendered frame with a variable delta.
 * STANGA needs a fixed timestep that is independent of the render rate, so the
 * automatic advance is neutralised and SimulationLoop drives `step()` instead.
 */
import '@babylonjs/core/Physics/physicsEngineComponent';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { IPhysicsCollisionEvent } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { IPhysicsEngine } from '@babylonjs/core/Physics/IPhysicsEngine';
import type { Scene } from '@babylonjs/core/scene';
import type HavokPhysics from '@babylonjs/havok';
import { GameConfig, type GoalPart } from '../config/GameConfig';
import type { TeamId } from '../game/MatchState';

/** What a physics body represents, so collisions can be translated into game events. */
export type BodyTag =
  | { kind: 'ball' }
  | { kind: 'player'; playerId: string; team: TeamId }
  | { kind: 'goalPart'; goal: TeamId; part: GoalPart }
  | { kind: 'ground' }
  | { kind: 'wall' };

export interface RawCollision {
  a: BodyTag;
  b: BodyTag;
  impulse: number;
}

/**
 * The initialised Havok WASM module. How it is loaded differs by platform — the
 * browser fetches a URL, Node reads the file — so the caller supplies it.
 */
export type HavokModule = Awaited<ReturnType<typeof HavokPhysics>>;

/** Narrow view of the internal Babylon hook we override to take over stepping. */
interface ManualStepScene {
  _advancePhysicsEngineStep(step: number): void;
}

export class PhysicsWorld {
  readonly plugin: HavokPlugin;
  private readonly engine: IPhysicsEngine;
  private readonly tags = new Map<PhysicsBody, BodyTag>();
  private readonly collisionBuffer: RawCollision[] = [];
  private readonly teleporting = new Set<PhysicsBody>();

  private constructor(
    private readonly scene: Scene,
    plugin: HavokPlugin,
    engine: IPhysicsEngine,
  ) {
    this.plugin = plugin;
    this.engine = engine;

    // Take manual control: the simulation loop decides when and by how much to step.
    (scene as unknown as ManualStepScene)._advancePhysicsEngineStep = () => {
      /* stepping is driven by PhysicsWorld.step */
    };

    this.plugin.onCollisionObservable.add(this.handleCollision);
  }

  static create(scene: Scene, havok: HavokModule): PhysicsWorld {
    const plugin = new HavokPlugin(true, havok);
    const enabled = scene.enablePhysics(new Vector3(0, GameConfig.physics.gravity, 0), plugin);
    const engine = scene.getPhysicsEngine();
    if (!enabled || !engine) {
      throw new Error('Havok physics failed to initialise');
    }
    return new PhysicsWorld(scene, plugin, engine);
  }

  private readonly handleCollision = (event: IPhysicsCollisionEvent): void => {
    const a = this.tags.get(event.collider);
    const b = this.tags.get(event.collidedAgainst);
    if (!a || !b) return;
    this.collisionBuffer.push({ a, b, impulse: event.impulse });
  };

  /** Registers what a body represents. Required for collisions to be reported. */
  tag(body: PhysicsBody, tag: BodyTag): void {
    this.tags.set(body, tag);
  }

  untag(body: PhysicsBody): void {
    this.tags.delete(body);
    this.teleporting.delete(body);
  }

  /**
   * Hard-teleports a body to wherever its mesh now sits, on the next step.
   *
   * Havok has no "move this body here" call: `setTargetTransform` gives the
   * body a *velocity* towards the target, so a kickoff reset would send the
   * ball flying across the pitch instead of placing it. The one real teleport
   * is the pre-step transform sync, which is off by default for performance.
   * This turns it on for exactly one step.
   */
  teleport(body: PhysicsBody): void {
    body.disablePreStep = false;
    this.teleporting.add(body);
  }

  /**
   * Advances the world by exactly `dt` seconds, split into fixed substeps.
   * Returns the collisions observed during this step; the array is reused.
   */
  step(dt: number, substepOverride?: number): readonly RawCollision[] {
    this.collisionBuffer.length = 0;
    const substeps = Math.max(1, substepOverride ?? GameConfig.physics.substeps);
    const subDelta = dt / substeps;
    for (let i = 0; i < substeps; i += 1) {
      this.engine._step(subDelta);
      // One substep is all a teleport needs; leaving the sync on would drag
      // the body back to the mesh on every later substep.
      if (this.teleporting.size > 0) {
        for (const body of this.teleporting) body.disablePreStep = true;
        this.teleporting.clear();
      }
    }
    return this.collisionBuffer;
  }

  dispose(): void {
    this.plugin.onCollisionObservable.removeCallback(this.handleCollision);
    this.tags.clear();
    this.scene.disablePhysicsEngine();
  }
}
