/**
 * Arrows at the edge of the screen for things you cannot see.
 *
 * A chase camera behind one player cannot hold four players and a ball at
 * once, so anything important that is off screen — the ball, your team-mate —
 * gets an arrow pinned to the edge pointing at it, with its distance in
 * metres. Losing the ball behind you is the single most disorienting thing
 * about 2×2, and this is the cheapest honest fix: no minimap, no zoom-out that
 * makes everybody tiny.
 *
 * DOM rather than meshes: an arrow belongs in the HUD, it costs no draw calls,
 * and it stays crisp at any resolution.
 */
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import type { Scene } from '@babylonjs/core/scene';
import type { Vec3 } from '../core/math';

export type EdgeArrowKind = 'ball' | 'mate';

export interface EdgeArrowTarget {
  kind: EdgeArrowKind;
  position: Vec3;
}

/** How far inside the edge an arrow sits, in CSS pixels. */
const INSET = 34;
/** A target this far inside the viewport needs no arrow. */
const SAFE_MARGIN = 28;

interface Arrow {
  element: HTMLElement;
  label: HTMLElement;
}

export class EdgeArrows {
  private readonly arrows = new Map<EdgeArrowKind, Arrow>();
  private readonly projected = new Vector3();
  private readonly viewSpace = new Vector3();
  private readonly viewport = new Viewport(0, 0, 1, 1);
  private enabled = true;

  constructor(container: HTMLElement) {
    for (const kind of ['ball', 'mate'] as const) {
      const element = document.createElement('div');
      element.className = `edge-arrow edge-arrow--${kind}`;
      element.hidden = true;

      const head = document.createElement('span');
      head.className = 'edge-arrow__head';
      const label = document.createElement('span');
      label.className = 'edge-arrow__label';

      element.append(head, label);
      container.append(element);
      this.arrows.set(kind, { element, label });
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.hide();
  }

  hide(): void {
    for (const arrow of this.arrows.values()) arrow.element.hidden = true;
  }

  dispose(): void {
    for (const arrow of this.arrows.values()) arrow.element.remove();
    this.arrows.clear();
  }

  /**
   * @param viewer where the local player is standing, for the distance label.
   */
  update(scene: Scene, targets: readonly EdgeArrowTarget[], viewer: Vec3 | null): void {
    if (!this.enabled) {
      return;
    }
    const camera = scene.activeCamera;
    const engine = scene.getEngine();
    const canvas = engine.getRenderingCanvas();
    if (!camera || !canvas) {
      this.hide();
      return;
    }

    // The canvas is drawn at render resolution but laid out in CSS pixels, so
    // the projection is rescaled rather than assumed to match.
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) {
      this.hide();
      return;
    }
    this.viewport.width = engine.getRenderWidth();
    this.viewport.height = engine.getRenderHeight();
    const scaleX = width / this.viewport.width;
    const scaleY = height / this.viewport.height;

    const view = camera.getViewMatrix();
    const transform = scene.getTransformMatrix();
    const seen = new Set<EdgeArrowKind>();

    for (const target of targets) {
      const arrow = this.arrows.get(target.kind);
      if (!arrow) continue;
      seen.add(target.kind);

      const point = new Vector3(target.position.x, target.position.y, target.position.z);
      Vector3.TransformCoordinatesToRef(point, view, this.viewSpace);
      const behind = this.viewSpace.z <= 0;

      Vector3.ProjectToRef(
        point,
        Matrix.IdentityReadOnly,
        transform,
        this.viewport,
        this.projected,
      );
      let x = this.projected.x * scaleX;
      let y = this.projected.y * scaleY;
      if (behind) {
        // A point behind the camera projects to a mirrored position; flipping
        // it back around the centre keeps the arrow on the correct side.
        x = width - x;
        y = height - y;
      }

      const onScreen =
        !behind &&
        x >= SAFE_MARGIN &&
        x <= width - SAFE_MARGIN &&
        y >= SAFE_MARGIN &&
        y <= height - SAFE_MARGIN;
      if (onScreen) {
        arrow.element.hidden = true;
        continue;
      }

      const centreX = width / 2;
      const centreY = height / 2;
      const dx = x - centreX;
      const dy = y - centreY;

      // Push the direction out to the edge rectangle, then pull it back in.
      const scale = Math.min(
        (centreX - INSET) / Math.max(Math.abs(dx), 1e-3),
        (centreY - INSET) / Math.max(Math.abs(dy), 1e-3),
      );
      const edgeX = centreX + dx * scale;
      const edgeY = centreY + dy * scale;

      arrow.element.hidden = false;
      arrow.element.style.transform = `translate(${edgeX.toFixed(1)}px, ${edgeY.toFixed(1)}px)`;
      arrow.element.style.setProperty('--angle', `${Math.atan2(dy, dx).toFixed(3)}rad`);

      arrow.label.textContent =
        viewer === null
          ? ''
          : `${Math.round(Math.hypot(target.position.x - viewer.x, target.position.z - viewer.z))}מ׳`;
    }

    for (const [kind, arrow] of this.arrows) {
      if (!seen.has(kind)) arrow.element.hidden = true;
    }
  }
}
