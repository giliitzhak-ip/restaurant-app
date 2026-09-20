import type { DesignScene, LedPath, LightingFixture, SceneObject } from "@/types/scene";
import { lightColor } from "../scene/lighting";

/**
 * Flattening a design into one image.
 *
 * The editor draws in two places: a canvas for the cladding, and DOM and SVG
 * on top for the objects and the lighting. That split is what keeps dragging
 * at sixty frames — but it means the cladding canvas on its own is a picture
 * of an empty room, and it is the thing `toBlob` would hand to a download, a
 * share, or the saved thumbnail.
 *
 * So this composites the whole stack once, at full resolution, at the moment
 * someone asks for an image. It is the only expensive render in the feature
 * and it runs at most once per save.
 *
 * It is a deliberate second implementation of the same picture, which is a
 * cost worth naming: the browser composites the live view, and this
 * composites the exported one. Keeping them in agreement is what the
 * screenshot tests are for.
 */

/** Loads an asset, resolving to null rather than throwing on a bad url. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  return `rgba(${parseInt(value.slice(0, 2), 16)}, ${parseInt(
    value.slice(2, 4),
    16,
  )}, ${parseInt(value.slice(4, 6), 16)}, ${alpha})`;
}

function paintFixture(
  context: CanvasRenderingContext2D,
  fixture: LightingFixture,
  objects: Map<string, SceneObject>,
  width: number,
  height: number,
) {
  if (!fixture.enabled) return;
  const anchor = fixture.attachedToObjectId
    ? objects.get(fixture.attachedToObjectId)
    : null;
  const position = anchor ? anchor.position : fixture.position;

  const w = fixture.width * width;
  const h = fixture.height * height;
  const cx = position.x * width;
  const cy = position.y * height;
  const color = lightColor(fixture);
  const reach = 0.25 + fixture.spread * 0.75;

  /*
   * Canvas has no elliptical gradient, so the context is scaled to turn a
   * circular one into the ellipse the live view uses. Without this a strip
   * three times wider than it is tall exports as a ball of light.
   */
  const radius = Math.max(w, h) / 2;
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radius * reach);
  gradient.addColorStop(0, withAlpha(color, Math.min(1, fixture.intensity)));
  gradient.addColorStop(0.45, withAlpha(color, fixture.intensity * 0.5));
  gradient.addColorStop(1, withAlpha(color, 0));

  // Two passes, matching the live view: screen to lift a dark wall, soft-light
  // for the colour shift that is all a white one can show.
  for (const mode of ["screen", "soft-light"] as const) {
    context.save();
    context.globalCompositeOperation = mode;
    context.filter = `blur(${Math.max(2, Math.min(64, fixture.blur * 0.22 * Math.min(w, h))).toFixed(1)}px)`;
    context.translate(cx, cy);
    context.rotate((fixture.direction * Math.PI) / 180);
    context.scale(w / (radius * 2) || 1, h / (radius * 2) || 1);
    context.fillStyle = gradient;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();
  }
}

function paintPath(
  context: CanvasRenderingContext2D,
  path: LedPath,
  width: number,
  height: number,
) {
  if (!path.enabled || path.points.length < 2) return;
  const color = lightColor(path);
  const core = Math.max(1, path.thickness * width);
  const halo = core * (2 + path.spread * 8);

  const trace = () => {
    context.beginPath();
    path.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    if (path.closed) context.closePath();
  };

  context.save();
  context.globalCompositeOperation = "screen";
  context.lineCap = "round";
  context.lineJoin = "round";

  context.filter = `blur(${Math.max(1, Math.min(40, path.blur * 0.4 * halo)).toFixed(1)}px)`;
  context.strokeStyle = withAlpha(color, path.intensity * 0.5);
  context.lineWidth = halo;
  trace();
  context.stroke();

  context.filter = "none";
  context.strokeStyle = withAlpha(color, Math.min(1, 0.55 + path.intensity * 0.45));
  context.lineWidth = core;
  trace();
  context.stroke();
  context.restore();
}

/**
 * Draws an image onto four arbitrary corners.
 *
 * Canvas 2D has only affine transforms, so a projective map has to be
 * approximated. The standard way, and the one used here, is to subdivide the
 * source into a grid and draw each cell with its own affine transform: the
 * error inside a cell falls off quickly with the grid size, and at 12×12 it
 * is well under a pixel for the perspectives a room photograph produces.
 *
 * Cells are drawn a fraction oversized so the seams between them do not show
 * as hairlines after anti-aliasing.
 */
function drawPerspective(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  quad: { x: number; y: number }[],
  width: number,
  height: number,
  steps = 12,
) {
  const [p0, p1, p2, p3] = quad.map((point) => ({
    x: point.x * width,
    y: point.y * height,
  })) as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];

  // Bilinear interpolation across the quad. The projective divide is absorbed
  // by the grid: each cell is small enough that linear is close enough.
  const at = (u: number, v: number) => ({
    x: (1 - u) * (1 - v) * p0.x + u * (1 - v) * p1.x + u * v * p2.x + (1 - u) * v * p3.x,
    y: (1 - u) * (1 - v) * p0.y + u * (1 - v) * p1.y + u * v * p2.y + (1 - u) * v * p3.y,
  });

  const sw = image.naturalWidth / steps;
  const sh = image.naturalHeight / steps;

  for (let row = 0; row < steps; row += 1) {
    for (let column = 0; column < steps; column += 1) {
      const u0 = column / steps;
      const u1 = (column + 1) / steps;
      const v0 = row / steps;
      const v1 = (row + 1) / steps;

      const a = at(u0, v0);
      const b = at(u1, v0);
      const c = at(u0, v1);

      context.save();
      context.transform(
        (b.x - a.x) / (u1 - u0) / image.naturalWidth,
        (b.y - a.y) / (u1 - u0) / image.naturalWidth,
        (c.x - a.x) / (v1 - v0) / image.naturalHeight,
        (c.y - a.y) / (v1 - v0) / image.naturalHeight,
        a.x,
        a.y,
      );
      context.drawImage(
        image,
        column * sw,
        row * sh,
        sw,
        sh,
        0,
        0,
        // A hair oversized, so the seams do not show.
        sw * 1.02,
        sh * 1.02,
      );
      context.restore();
    }
  }
}

async function paintObject(
  context: CanvasRenderingContext2D,
  object: SceneObject,
  width: number,
  height: number,
) {
  if (!object.visible) return;
  const image = await loadImage(object.assetUrl);
  if (!image) return;

  context.save();
  context.globalAlpha = object.opacity;

  if (object.perspectivePoints) {
    if (object.flipX) {
      // Flip by swapping the quad's left and right corners, which is what a
      // mirrored object actually is — negating the transform would also
      // mirror the perspective.
      const [a, b, c, d] = object.perspectivePoints;
      drawPerspective(context, image, [b, a, d, c], width, height);
    } else {
      drawPerspective(context, image, object.perspectivePoints, width, height);
    }
    context.restore();
    return;
  }

  const w = object.width * width;
  const h = object.height * height;
  context.translate(object.position.x * width, object.position.y * height);
  context.rotate((object.rotation * Math.PI) / 180);
  if (object.flipX) context.scale(-1, 1);
  context.drawImage(image, -w / 2, -h / 2, w, h);
  context.restore();
}

/**
 * Composites the cladding canvas and the scene into one image.
 *
 * Returns a new canvas; the source is never touched, because it is the live
 * view the customer is still looking at.
 */
export async function composeScene(
  base: HTMLCanvasElement,
  scene: DesignScene,
): Promise<HTMLCanvasElement> {
  const width = base.width;
  const height = base.height;

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) return base;

  context.drawImage(base, 0, 0);

  const hidden = new Set(scene.layers.hidden);
  const objects = new Map(scene.objects.map((object) => [object.id, object]));

  if (!hidden.has("backLight")) {
    for (const fixture of scene.lightingFixtures.filter((f) => f.placement === "HIDDEN")) {
      paintFixture(context, fixture, objects, width, height);
    }
    for (const path of scene.ledPaths.filter((p) => p.placement === "HIDDEN")) {
      paintPath(context, path, width, height);
    }
  }

  if (!hidden.has("objects")) {
    // Paint order, exactly as the live view stacks them.
    for (const object of [...scene.objects].sort((a, b) => a.layerIndex - b.layerIndex)) {
      await paintObject(context, object, width, height);
    }
  }

  if (!hidden.has("frontLight")) {
    for (const fixture of scene.lightingFixtures.filter((f) => f.placement === "FRONT")) {
      paintFixture(context, fixture, objects, width, height);
    }
    for (const path of scene.ledPaths.filter((p) => p.placement === "FRONT")) {
      paintPath(context, path, width, height);
    }
  }

  return output;
}
