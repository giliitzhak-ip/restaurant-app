/**
 * The bulge a ball puts in the back of the net.
 *
 * A goal that does nothing to the net reads as the ball passing through a
 * poster, and it is the one moment in the game that most wants to feel
 * physical. So the back panel is a subdivided sheet whose vertices are pushed
 * away from the point of impact and then spring back, with the push falling
 * off with distance and the whole thing decaying over about a second.
 *
 * Deliberately not physics: no cloth solver, no constraints, no bodies. It is
 * a decaying radial displacement on a vertex buffer, which is cheap enough to
 * run on a phone and is indistinguishable from the real thing at the speed a
 * ball arrives.
 */
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { clamp } from '../core/math';
import type { Vec3 } from '../core/math';
import type { TeamId } from '../game/MatchState';

/** Seconds a bulge takes to settle. */
const SETTLE_SECONDS = 0.9;

/** How far from the impact the push still reaches, in metres. */
const REACH = 1.1;

/** Metres of bulge at the centre of a full-speed impact. */
const MAX_DEPTH = 0.42;

/** How many times it swings back and forth while settling. */
const OSCILLATIONS = 2.4;

interface Panel {
  mesh: Mesh;
  /** The undeformed vertex positions, in the mesh's own space. */
  rest: Float32Array;
  /** Working copy handed to the vertex buffer. */
  live: Float32Array;
  /** Where the ball arrived, in the mesh's own space. */
  impactX: number;
  impactY: number;
  strength: number;
  elapsed: number;
}

export class NetRipple {
  private readonly panels = new Map<TeamId, Panel>();
  private readonly local = new Vector3();

  add(team: TeamId, mesh: Mesh): void {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (!positions) return;
    this.panels.set(team, {
      mesh,
      rest: Float32Array.from(positions),
      live: Float32Array.from(positions),
      impactX: 0,
      impactY: 0,
      strength: 0,
      elapsed: 0,
    });
  }

  /**
   * A ball reached the back of this net.
   *
   * @param point world position of the ball
   * @param speed how fast it arrived, which decides how deep the bulge goes
   */
  impact(team: TeamId, point: Vec3, speed: number): void {
    const panel = this.panels.get(team);
    if (!panel) return;

    // Into the panel's own space, where the sheet lies in X and Y with the
    // push along Z. Doing it here rather than in world space is what keeps
    // the maths the same for both goals, which face opposite ways.
    this.local.set(point.x, point.y, point.z);
    const inverse = panel.mesh.getWorldMatrix().clone().invert();
    Vector3.TransformCoordinatesToRef(this.local, inverse, this.local);

    panel.impactX = this.local.x;
    panel.impactY = this.local.y;
    panel.strength = clamp(speed / 18, 0.25, 1);
    panel.elapsed = 0;
  }

  /** Advances every settling net. Does nothing at all while they are all at rest. */
  update(dt: number): void {
    for (const panel of this.panels.values()) {
      if (panel.strength <= 0) continue;
      panel.elapsed += dt;

      const life = panel.elapsed / SETTLE_SECONDS;
      if (life >= 1) {
        panel.strength = 0;
        panel.live.set(panel.rest);
        panel.mesh.updateVerticesData(VertexBuffer.PositionKind, panel.live, false, false);
        continue;
      }

      // A decaying swing: deep on arrival, back through the rest position a
      // couple of times, smaller each pass.
      const decay = (1 - life) * (1 - life);
      const swing = Math.cos(life * Math.PI * 2 * OSCILLATIONS);
      const depth = MAX_DEPTH * panel.strength * decay * swing;

      for (let i = 0; i < panel.rest.length; i += 3) {
        const x = panel.rest[i] ?? 0;
        const y = panel.rest[i + 1] ?? 0;
        panel.live[i] = x;
        panel.live[i + 1] = y;
        const distance = Math.hypot(x - panel.impactX, y - panel.impactY);
        // Cosine falloff: zero at the edge of the reach and flat-topped at the
        // impact, so the sheet bulges rather than growing a spike.
        const falloff = distance >= REACH ? 0 : 0.5 + 0.5 * Math.cos((distance / REACH) * Math.PI);
        panel.live[i + 2] = (panel.rest[i + 2] ?? 0) + depth * falloff;
      }
      panel.mesh.updateVerticesData(VertexBuffer.PositionKind, panel.live, false, false);
    }
  }

  /** Puts every net back at rest. Used on a reset, so nothing carries over. */
  clear(): void {
    for (const panel of this.panels.values()) {
      if (panel.strength === 0) continue;
      panel.strength = 0;
      panel.live.set(panel.rest);
      panel.mesh.updateVerticesData(VertexBuffer.PositionKind, panel.live, false, false);
    }
  }
}
