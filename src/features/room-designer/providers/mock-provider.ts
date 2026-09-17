import type {
  DetectedObject,
  NormPoint,
  RoomAnalysis,
  RoomAnalysisWarning,
  RoomSurfaceMask,
  SurfaceKind,
} from "@/types/design";
import type { RoomImageInput, RoomVisionProvider } from "./types";

/**
 * Heuristic room segmentation — the default provider.
 *
 * It is not a neural network, and it does not pretend to be: it reads the
 * small RGBA preview the browser sends and uses classic image analysis to find
 * the floor/wall boundary, split the visible walls, spot windows and dark
 * objects, and score the photo's brightness and sharpness. In practice that is
 * enough to put a usable mask on screen in a few milliseconds, with no API key
 * and no image leaving the customer's own device beyond a thumbnail.
 *
 * When a hosted model is configured (ROOM_VISION_PROVIDER=remote) this
 * provider still runs as the fallback if that model fails, and the customer
 * can always mark the surface by hand.
 */

interface Grid {
  width: number;
  height: number;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  luma: Float32Array;
}

function toGrid(image: RoomImageInput): Grid {
  const { width, height, rgba } = image.preview;
  const size = width * height;
  const r = new Float32Array(size);
  const g = new Float32Array(size);
  const b = new Float32Array(size);
  const luma = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const red = Number(rgba[i * 4] ?? 0);
    const green = Number(rgba[i * 4 + 1] ?? 0);
    const blue = Number(rgba[i * 4 + 2] ?? 0);
    r[i] = red;
    g[i] = green;
    b[i] = blue;
    luma[i] = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }
  return { width, height, r, g, b, luma };
}

const at = (grid: Grid, x: number, y: number) => y * grid.width + x;

function colorDistance(grid: Grid, index: number, ref: [number, number, number]) {
  const dr = grid.r[index]! - ref[0];
  const dg = grid.g[index]! - ref[1];
  const db = grid.b[index]! - ref[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Median colour of a block, used as a robust reference sample. */
function blockReference(
  grid: Grid,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): [number, number, number] {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = at(grid, x, y);
      reds.push(grid.r[index]!);
      greens.push(grid.g[index]!);
      blues.push(grid.b[index]!);
    }
  }
  const median = (values: number[]) => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  return [median(reds), median(greens), median(blues)];
}

/**
 * For every column, walks up from the bottom while the pixel still looks like
 * the floor. The resulting line hugs furniture and skirting instead of cutting
 * straight across the room.
 */
function floorBoundary(grid: Grid) {
  const { width, height } = grid;
  const reference = blockReference(
    grid,
    Math.floor(width * 0.3),
    Math.ceil(width * 0.7),
    Math.floor(height * 0.88),
    height,
  );
  const tolerance = 46;
  const boundary = new Float32Array(width);

  for (let x = 0; x < width; x += 1) {
    let top = height - 1;
    let misses = 0;
    for (let y = height - 1; y >= 0; y -= 1) {
      const distance = colorDistance(grid, at(grid, x, y), reference);
      if (distance <= tolerance) {
        top = y;
        misses = 0;
      } else {
        misses += 1;
        // Tolerate a couple of rows (a shadow line, a cable) before stopping.
        if (misses > Math.max(2, height * 0.03)) break;
      }
    }
    boundary[x] = top;
  }

  // Smooth to remove single-column spikes.
  const smoothed = new Float32Array(width);
  const radius = Math.max(1, Math.round(width * 0.03));
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    let count = 0;
    for (let k = -radius; k <= radius; k += 1) {
      const xx = Math.min(width - 1, Math.max(0, x + k));
      sum += boundary[xx]!;
      count += 1;
    }
    smoothed[x] = sum / count;
  }
  return { boundary: smoothed, reference };
}

/** Mirror of `floorBoundary`, walking down from the top for the ceiling. */
function ceilingBoundary(grid: Grid) {
  const { width, height } = grid;
  const reference = blockReference(
    grid,
    Math.floor(width * 0.3),
    Math.ceil(width * 0.7),
    0,
    Math.max(1, Math.floor(height * 0.08)),
  );
  const tolerance = 34;
  const boundary = new Float32Array(width);

  for (let x = 0; x < width; x += 1) {
    let bottom = 0;
    let misses = 0;
    for (let y = 0; y < height; y += 1) {
      const distance = colorDistance(grid, at(grid, x, y), reference);
      if (distance <= tolerance) {
        bottom = y;
        misses = 0;
      } else {
        misses += 1;
        if (misses > Math.max(2, height * 0.03)) break;
      }
    }
    boundary[x] = bottom;
  }
  return boundary;
}

function samplePolygonFromBoundary(
  grid: Grid,
  boundary: Float32Array,
  samples = 12,
): NormPoint[] {
  const { width, height } = grid;
  const points: NormPoint[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = Math.min(width - 1, Math.round((i / samples) * (width - 1)));
    points.push({
      x: x / (width - 1),
      y: Math.min(1, boundary[x]! / (height - 1)),
    });
  }
  points.push({ x: 1, y: 1 });
  points.push({ x: 0, y: 1 });
  return points;
}

function detectWindows(
  grid: Grid,
  floor: Float32Array,
  ceiling: Float32Array,
): DetectedObject[] {
  const { width, height } = grid;
  let sum = 0;
  let count = 0;
  for (let x = 0; x < width; x += 1) {
    const top = Math.ceil(ceiling[x]!);
    const bottom = Math.floor(floor[x]!);
    for (let y = top; y < bottom; y += 1) {
      sum += grid.luma[at(grid, x, y)]!;
      count += 1;
    }
  }
  if (!count) return [];
  const mean = sum / count;
  const threshold = Math.min(250, mean + 42);

  const visited = new Uint8Array(width * height);
  const objects: DetectedObject[] = [];

  for (let x = 0; x < width; x += 1) {
    const top = Math.ceil(ceiling[x]!);
    const bottom = Math.floor(floor[x]!);
    for (let y = top; y < bottom; y += 1) {
      const index = at(grid, x, y);
      if (visited[index] || grid.luma[index]! < threshold) continue;

      // Flood fill the bright blob and keep its bounding box.
      const stack = [index];
      visited[index] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let size = 0;

      while (stack.length) {
        const current = stack.pop()!;
        const cx = current % width;
        const cy = Math.floor(current / width);
        size += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbours = [
          cx > 0 ? current - 1 : -1,
          cx < width - 1 ? current + 1 : -1,
          cy > 0 ? current - width : -1,
          cy < height - 1 ? current + width : -1,
        ];
        for (const next of neighbours) {
          if (next < 0 || visited[next]) continue;
          if (grid.luma[next]! < threshold) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }

      const area = size / (width * height);
      if (area < 0.01 || area > 0.3) continue;
      objects.push({
        kind: "WINDOW",
        label: "חלון",
        polygon: rectPolygon(minX, minY, maxX, maxY, width, height),
      });
      if (objects.length >= 3) return objects;
    }
  }
  return objects;
}

/** Freestanding items inside the floor area become holes in the mask. */
function detectFloorObjects(
  grid: Grid,
  floor: Float32Array,
  reference: [number, number, number],
): { objects: DetectedObject[]; holes: NormPoint[][] } {
  const { width, height } = grid;
  const visited = new Uint8Array(width * height);
  const objects: DetectedObject[] = [];
  const holes: NormPoint[][] = [];
  const tolerance = 58;

  for (let x = 0; x < width; x += 1) {
    const top = Math.ceil(floor[x]!) + 1;
    for (let y = top; y < height; y += 1) {
      const index = at(grid, x, y);
      if (visited[index]) continue;
      if (colorDistance(grid, index, reference) <= tolerance) continue;

      const stack = [index];
      visited[index] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let size = 0;

      while (stack.length) {
        const current = stack.pop()!;
        const cx = current % width;
        const cy = Math.floor(current / width);
        if (cy < Math.ceil(floor[cx]!)) continue;
        size += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbours = [
          cx > 0 ? current - 1 : -1,
          cx < width - 1 ? current + 1 : -1,
          cy > 0 ? current - width : -1,
          cy < height - 1 ? current + width : -1,
        ];
        for (const next of neighbours) {
          if (next < 0 || visited[next]) continue;
          if (colorDistance(grid, next, reference) <= tolerance) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }

      const area = size / (width * height);
      if (area < 0.008 || area > 0.35) continue;
      const polygon = rectPolygon(minX, minY, maxX, maxY, width, height);
      objects.push({ kind: "FURNITURE", label: "אובייקט על הרצפה", polygon });
      holes.push(polygon);
      if (holes.length >= 4) return { objects, holes };
    }
  }

  return { objects, holes };
}

function polygonCentre(polygon: NormPoint[]): NormPoint {
  const sum = polygon.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
}

function pointInPolygon(point: NormPoint, polygon: NormPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function rectPolygon(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  width: number,
  height: number,
): NormPoint[] {
  const x0 = minX / (width - 1);
  const x1 = (maxX + 1) / (width - 1);
  const y0 = minY / (height - 1);
  const y1 = (maxY + 1) / (height - 1);
  return [
    { x: x0, y: y0 },
    { x: Math.min(1, x1), y: y0 },
    { x: Math.min(1, x1), y: Math.min(1, y1) },
    { x: x0, y: Math.min(1, y1) },
  ];
}

/** Variance of the Laplacian — the usual quick blur score. */
function sharpnessScore(grid: Grid) {
  const { width, height, luma } = grid;
  let sum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = at(grid, x, y);
      const value =
        4 * luma[index]! -
        luma[index - 1]! -
        luma[index + 1]! -
        luma[index - width]! -
        luma[index + width]!;
      sum += Math.abs(value);
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function buildWalls(
  grid: Grid,
  floor: Float32Array,
  ceiling: Float32Array,
): RoomSurfaceMask[] {
  const { width, height } = grid;

  // Average colour of each column's wall band, then look for the two strongest
  // vertical changes — those are the room's corners.
  const columnColor = new Float32Array(width * 3);
  for (let x = 0; x < width; x += 1) {
    const top = Math.ceil(ceiling[x]!);
    const bottom = Math.floor(floor[x]!);
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let y = top; y < bottom; y += 1) {
      const index = at(grid, x, y);
      r += grid.r[index]!;
      g += grid.g[index]!;
      b += grid.b[index]!;
      n += 1;
    }
    if (!n) n = 1;
    columnColor[x * 3] = r / n;
    columnColor[x * 3 + 1] = g / n;
    columnColor[x * 3 + 2] = b / n;
  }

  const edges: { x: number; strength: number }[] = [];
  const span = Math.max(2, Math.round(width * 0.05));
  for (let x = span; x < width - span; x += 1) {
    const dr = columnColor[(x + span) * 3]! - columnColor[(x - span) * 3]!;
    const dg = columnColor[(x + span) * 3 + 1]! - columnColor[(x - span) * 3 + 1]!;
    const db = columnColor[(x + span) * 3 + 2]! - columnColor[(x - span) * 3 + 2]!;
    edges.push({ x, strength: Math.sqrt(dr * dr + dg * dg + db * db) });
  }
  edges.sort((a, b) => b.strength - a.strength);

  const cuts: number[] = [];
  for (const edge of edges) {
    if (edge.strength < 12) break;
    if (cuts.some((cut) => Math.abs(cut - edge.x) < width * 0.18)) continue;
    cuts.push(edge.x);
    if (cuts.length === 2) break;
  }
  cuts.sort((a, b) => a - b);

  const bounds = [0, ...cuts, width - 1];
  const masks: RoomSurfaceMask[] = [];
  const labels = ["קיר שמאל", "קיר מרכזי", "קיר ימין"];

  for (let i = 0; i < bounds.length - 1; i += 1) {
    const xa = bounds[i]!;
    const xb = bounds[i + 1]!;
    if (xb - xa < width * 0.12) continue;

    const polygon: NormPoint[] = [];
    const samples = 6;
    for (let s = 0; s <= samples; s += 1) {
      const x = Math.round(xa + ((xb - xa) * s) / samples);
      polygon.push({
        x: x / (width - 1),
        y: Math.max(0, ceiling[x]! / (height - 1)),
      });
    }
    for (let s = samples; s >= 0; s -= 1) {
      const x = Math.round(xa + ((xb - xa) * s) / samples);
      polygon.push({
        x: x / (width - 1),
        y: Math.min(1, floor[x]! / (height - 1)),
      });
    }

    masks.push({
      id: `wall-${i}`,
      kind: "WALL",
      label: labels[Math.min(labels.length - 1, i)] ?? `קיר ${i + 1}`,
      polygon,
      holes: [],
      confidence: cuts.length ? 0.68 : 0.5,
      source: "AUTO",
    });
  }

  return masks;
}

export const mockVisionProvider: RoomVisionProvider = {
  id: "heuristic",
  label: "זיהוי מקומי (ללא ספק חיצוני)",

  async analyzeRoom(image) {
    const grid = toGrid(image);
    const { boundary, reference } = floorBoundary(grid);
    const ceiling = ceilingBoundary(grid);

    const floorPolygon = samplePolygonFromBoundary(grid, boundary);
    const { objects: floorObjects, holes } = detectFloorObjects(
      grid,
      boundary,
      reference,
    );
    const windows = detectWindows(grid, boundary, ceiling);
    const walls = buildWalls(grid, boundary, ceiling);
    // A window inside a wall becomes a hole in that wall's mask, so cladding
    // stops at the frame instead of painting over the glass.
    for (const window of windows) {
      const centre = polygonCentre(window.polygon);
      const host = walls.find((wall) => pointInPolygon(centre, wall.polygon));
      if (host) host.holes.push(window.polygon);
    }

    // Coverage checks: how much of the frame each surface actually claims.
    const floorCoverage =
      1 -
      Array.from(boundary).reduce((sum, value) => sum + value, 0) /
        (boundary.length * (grid.height - 1));
    const wallCoverage =
      Array.from(boundary).reduce((sum, value, index) => {
        return sum + Math.max(0, value - ceiling[index]!);
      }, 0) /
      (boundary.length * (grid.height - 1));

    let brightnessSum = 0;
    for (let i = 0; i < grid.luma.length; i += 1) brightnessSum += grid.luma[i]!;
    const brightness = brightnessSum / grid.luma.length;
    const sharpness = sharpnessScore(grid);

    const warnings: RoomAnalysisWarning[] = [];
    const surfaces: RoomSurfaceMask[] = [];

    if (floorCoverage > 0.06) {
      surfaces.push({
        id: "floor-0",
        kind: "FLOOR",
        label: "רצפה",
        polygon: floorPolygon,
        holes,
        confidence: Math.min(0.9, 0.45 + floorCoverage),
        source: "AUTO",
      });
    } else {
      warnings.push("NO_FLOOR_DETECTED");
    }

    if (wallCoverage > 0.08) {
      surfaces.push(...walls);
    } else {
      warnings.push("NO_WALL_DETECTED");
    }

    if (brightness < 58) warnings.push("LOW_LIGHT");
    if (sharpness < 3.2) warnings.push("BLURRY");
    if (Math.min(image.width, image.height) < 600) warnings.push("LOW_RESOLUTION");

    return {
      imageWidth: image.width,
      imageHeight: image.height,
      surfaces,
      objects: [...windows, ...floorObjects],
      brightness,
      sharpness,
      warnings,
      providerId: this.id,
      analysedAt: new Date().toISOString(),
    } satisfies RoomAnalysis;
  },

  async segmentFloor(image) {
    const analysis = await this.analyzeRoom(image);
    return analysis.surfaces.find((surface) => surface.kind === "FLOOR") ?? null;
  },

  async segmentWalls(image) {
    const analysis = await this.analyzeRoom(image);
    return analysis.surfaces.filter((surface) => surface.kind === "WALL");
  },

  async generateMask(image: RoomImageInput, surface: SurfaceKind) {
    const analysis = await this.analyzeRoom(image);
    return analysis.surfaces.find((entry) => entry.kind === surface) ?? null;
  },
};
