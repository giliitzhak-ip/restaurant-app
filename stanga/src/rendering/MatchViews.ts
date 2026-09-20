/**
 * The client-side skin over the simulation.
 *
 * MatchEngine owns only bodies (`BallBody`, `PlayerBody`) so it can run on the
 * authoritative server under NullEngine. Everything you can actually see —
 * kits, limbs, the possession ring, the ball texture — lives here and is driven
 * at render rate from the serializable MatchState. Nothing in this file may
 * write back into the simulation.
 */
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { MatchEngine } from '../game/MatchEngine';
import type { TeamId } from '../game/MatchState';
import { BallView } from './BallView';
import { PlayerView } from './PlayerView';

export class MatchViews {
  readonly ball: BallView;
  private readonly players = new Map<string, PlayerView>();

  constructor(
    private readonly scene: Scene,
    private readonly match: MatchEngine,
  ) {
    this.ball = new BallView(scene, match.ball);
    this.rebuild();
    // A kickoff teleports the bodies, so the characters must snap too rather
    // than interpolate across the pitch.
    match.events.on('kickoff', () => {
      for (const player of match.state.players) {
        this.players.get(player.id)?.reset(player.facing);
      }
    });
    // A new line-up replaces every physics body, so every view is stale.
    match.events.on('rosterChanged', () => {
      this.rebuild();
      this.onRebuilt?.();
    });
  }

  /** Called after the views were rebuilt, so shadows and casters can follow. */
  onRebuilt: (() => void) | null = null;

  private rebuild(): void {
    for (const view of this.players.values()) view.dispose();
    this.players.clear();
    for (const body of this.match.players) {
      this.players.set(body.id, new PlayerView(this.scene, body, false));
    }
  }

  viewFor(playerId: string): PlayerView | undefined {
    return this.players.get(playerId);
  }

  /** Every mesh that should cast a shadow, ball included. */
  get shadowCasters(): Mesh[] {
    const meshes: Mesh[] = [this.match.ball.mesh];
    for (const view of this.players.values()) meshes.push(...view.meshes);
    return meshes;
  }

  /** Player ids currently rendered, in roster order. */
  get playerIds(): string[] {
    return [...this.players.keys()];
  }

  /** Render-rate update. Never touches physics or rules. */
  update(dt: number, celebratingTeam: TeamId | null, defeatedTeam: TeamId | null): void {
    const controlling = this.match.controllingPlayerId;
    for (const player of this.match.state.players) {
      const view = this.players.get(player.id);
      if (!view) continue;
      const triggers = this.match.consumeAnimationTriggers(player.id);
      view.updateVisual(
        player,
        {
          speed: Math.hypot(player.velocity.x, player.velocity.z),
          hasBall: controlling === player.id,
          kickTriggered: triggers.kick,
          tackleTriggered: triggers.tackle,
          celebrating: celebratingTeam === player.team,
          defeated: defeatedTeam === player.team,
        },
        dt,
      );
      view.setInControl(controlling === player.id);
    }
  }
}
