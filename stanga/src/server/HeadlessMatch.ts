/**
 * A full STANGA match with no renderer at all.
 *
 * This is what makes the server authoritative rather than a second, drifting
 * implementation: it builds the same scene graph, the same collision geometry
 * and the same `MatchEngine` the browser runs, on Babylon's NullEngine. If a
 * rule changes, it changes for both at once.
 *
 * Everything reachable from here must stay free of the DOM, of materials and of
 * Vite-only imports.
 */
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { MatchEngine, type MatchEngineOptions } from '../game/MatchEngine';
import { buildArenaColliders, type ArenaColliders } from '../physics/ArenaColliders';
import { PhysicsWorld, type HavokModule } from '../physics/PhysicsWorld';

export type HeadlessMatchOptions = MatchEngineOptions;

export class HeadlessMatch {
  private constructor(
    private readonly engine: NullEngine,
    readonly scene: Scene,
    readonly world: PhysicsWorld,
    readonly arena: ArenaColliders,
    readonly match: MatchEngine,
  ) {}

  static create(havok: HavokModule, options: HeadlessMatchOptions = {}): HeadlessMatch {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const world = PhysicsWorld.create(scene, havok);
    const arena = buildArenaColliders(scene, world);
    const match = new MatchEngine(scene, world, options);
    return new HeadlessMatch(engine, scene, world, arena, match);
  }

  /** Advances the simulation by exactly one fixed tick. */
  step(dt: number, tick: number): void {
    this.match.step(dt, tick);
  }

  dispose(): void {
    this.world.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
