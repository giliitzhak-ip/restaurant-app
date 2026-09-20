/**
 * Ground rings that say who is who.
 *
 * With four players on a small pitch, "which one am I" is the first question a
 * 2×2 match asks, and a kit colour alone does not answer it at chase-camera
 * distance. Each player gets a flat ring: bright under the player you drive,
 * softer under your team-mate, thin under the opposition. The team-mate you
 * would pass to right now is picked out with a second, wider ring.
 *
 * Purely visual. It reads `MatchState` and never writes to it.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { GameConfig } from '../config/GameConfig';
import type { MatchState, TeamId } from '../game/MatchState';

/** What a ring is telling you. Drives its colour, size and opacity. */
export type MarkerRole = 'you' | 'mate' | 'rival' | 'passTarget';

interface Marker {
  ring: Mesh;
  material: StandardMaterial;
}

const RING_COLORS: Record<MarkerRole, string> = {
  you: '#ffa524',
  mate: '#ffd79a',
  rival: '#8f97a3',
  passTarget: '#7ee08a',
};

const RING_ALPHA: Record<MarkerRole, number> = {
  you: 0.85,
  mate: 0.5,
  rival: 0.26,
  passTarget: 0.8,
};

export class PlayerMarkers {
  private readonly markers = new Map<string, Marker>();
  private readonly targetRing: Mesh;
  private readonly targetMaterial: StandardMaterial;
  private enabled = true;

  constructor(private readonly scene: Scene) {
    const built = this.buildRing('passTargetRing', 0.82, 'passTarget');
    this.targetRing = built.ring;
    this.targetMaterial = built.material;
    this.targetRing.setEnabled(false);
  }

  /** Rebuilt whenever the line-up changes, like every other view. */
  setPlayers(playerIds: readonly string[]): void {
    for (const [id, marker] of this.markers) {
      if (playerIds.includes(id)) continue;
      marker.ring.dispose();
      marker.material.dispose();
      this.markers.delete(id);
    }
    for (const id of playerIds) {
      if (this.markers.has(id)) continue;
      this.markers.set(id, this.buildRing(`marker-${id}`, 0.58, 'rival'));
    }
  }

  /** Quality presets turn the rings off on the lowest setting. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) return;
    for (const marker of this.markers.values()) marker.ring.setEnabled(false);
    this.targetRing.setEnabled(false);
  }

  /**
   * @param localPlayerIds every player this device drives — one online, two in
   *   a local match, none while watching a replay of somebody else's game.
   * @param passTargetId the team-mate a pass would go to right now, or null.
   */
  update(
    state: MatchState,
    localPlayerIds: readonly string[],
    localTeam: TeamId | null,
    passTargetId: string | null,
  ): void {
    if (!this.enabled) return;

    for (const player of state.players) {
      const marker = this.markers.get(player.id);
      if (!marker) continue;

      const role: MarkerRole = localPlayerIds.includes(player.id)
        ? 'you'
        : player.team === localTeam
          ? 'mate'
          : 'rival';

      marker.ring.setEnabled(true);
      marker.ring.position.set(player.position.x, 0.015, player.position.z);
      this.paint(marker, role);
    }

    const target = passTargetId === null ? null : findPosition(state, passTargetId);
    if (target === null) {
      this.targetRing.setEnabled(false);
      return;
    }
    this.targetRing.setEnabled(true);
    this.targetRing.position.set(target.x, 0.014, target.z);
  }

  hide(): void {
    for (const marker of this.markers.values()) marker.ring.setEnabled(false);
    this.targetRing.setEnabled(false);
  }

  dispose(): void {
    for (const marker of this.markers.values()) {
      marker.ring.dispose();
      marker.material.dispose();
    }
    this.markers.clear();
    this.targetRing.dispose();
    this.targetMaterial.dispose();
  }

  private paint(marker: Marker, role: MarkerRole): void {
    marker.material.emissiveColor = Color3.FromHexString(RING_COLORS[role]);
    marker.material.alpha = RING_ALPHA[role];
    const scale = role === 'you' ? 1 : role === 'mate' ? 0.92 : 0.84;
    marker.ring.scaling.set(scale, 1, scale);
  }

  private buildRing(name: string, radius: number, role: MarkerRole): Marker {
    // A torus flattened onto the ground reads as a ring from any angle a chase
    // camera can take, and costs one draw call.
    const ring = MeshBuilder.CreateTorus(
      name,
      { diameter: radius * 2, thickness: GameConfig.player.radius * 0.28, tessellation: 24 },
      this.scene,
    );
    ring.scaling.y = 0.12;
    ring.isPickable = false;

    const material = new StandardMaterial(`${name}Mat`, this.scene);
    material.emissiveColor = Color3.FromHexString(RING_COLORS[role]);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.alpha = RING_ALPHA[role];
    material.zOffset = -3;
    ring.material = material;

    return { ring, material };
  }
}

function findPosition(state: MatchState, playerId: string): { x: number; z: number } | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return player ? { x: player.position.x, z: player.position.z } : null;
}
