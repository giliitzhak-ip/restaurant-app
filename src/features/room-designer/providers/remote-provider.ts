import type {
  NormPoint,
  RoomAnalysis,
  RoomAnalysisWarning,
  RoomSurfaceMask,
  SurfaceKind,
} from "@/types/design";
import { mockVisionProvider } from "./mock-provider";
import type { RoomImageInput, RoomVisionProvider } from "./types";

/**
 * Adapter for a hosted segmentation model (SAM / Mask2Former / a Replicate or
 * Fal endpoint / your own service).
 *
 * The contract is deliberately small — POST the image, get polygons back:
 *
 * ```json
 * {
 *   "surfaces": [
 *     { "kind": "FLOOR", "label": "floor", "confidence": 0.94,
 *       "polygon": [[0.02,0.61],[0.98,0.58],[1,1],[0,1]],
 *       "holes": [[[0.3,0.7],[0.5,0.7],[0.5,0.9],[0.3,0.9]]] }
 *   ],
 *   "objects": [ { "kind": "WINDOW", "label": "window", "polygon": [...] } ]
 * }
 * ```
 *
 * Coordinates are normalised 0..1. Configure with ROOM_VISION_API_URL and
 * ROOM_VISION_API_KEY; keys live in the environment and never in the client
 * bundle. If the call fails the heuristic provider answers instead, so the
 * customer still gets a mask (and can always redraw it by hand).
 */

interface RemoteSurface {
  kind?: string;
  label?: string;
  confidence?: number;
  polygon?: [number, number][];
  holes?: [number, number][][];
}

interface RemoteResponse {
  surfaces?: RemoteSurface[];
  objects?: { kind?: string; label?: string; polygon?: [number, number][] }[];
  warnings?: string[];
}

const toPoints = (pairs?: [number, number][]): NormPoint[] =>
  (pairs ?? []).map(([x, y]) => ({
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  }));

const surfaceKind = (value?: string): SurfaceKind => {
  const normalised = value?.toUpperCase();
  if (normalised === "WALL") return "WALL";
  if (normalised === "CEILING") return "CEILING";
  return "FLOOR";
};

export const remoteVisionProvider: RoomVisionProvider = {
  id: "remote",
  label: "מודל סגמנטציה מרוחק",

  async analyzeRoom(image: RoomImageInput): Promise<RoomAnalysis> {
    const endpoint = process.env.ROOM_VISION_API_URL;
    const key = process.env.ROOM_VISION_API_KEY;

    if (!endpoint || !key || (!image.bytes && !image.imageUrl)) {
      // Misconfigured or no full-resolution image to send — fall back rather
      // than fail the customer's flow.
      return mockVisionProvider.analyzeRoom(image);
    }

    try {
      const body = image.imageUrl
        ? JSON.stringify({ imageUrl: image.imageUrl })
        : (() => {
            const form = new FormData();
            form.append(
              "image",
              new Blob([new Uint8Array(image.bytes!)], {
                type: image.contentType ?? "image/jpeg",
              }),
              "room.jpg",
            );
            return form;
          })();

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          ...(image.imageUrl ? { "content-type": "application/json" } : {}),
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) throw new Error(`vision provider ${response.status}`);
      const payload = (await response.json()) as RemoteResponse;

      const surfaces: RoomSurfaceMask[] = (payload.surfaces ?? [])
        .map((surface, index): RoomSurfaceMask => {
          const kind = surfaceKind(surface.kind);
          return {
            id: `${kind.toLowerCase()}-${index}`,
            kind,
            label:
              surface.label ??
              (kind === "FLOOR" ? "רצפה" : kind === "WALL" ? "קיר" : "תקרה"),
            polygon: toPoints(surface.polygon),
            holes: (surface.holes ?? []).map(toPoints),
            confidence: surface.confidence ?? 0.8,
            source: "AUTO",
          };
        })
        .filter((surface) => surface.polygon.length >= 3);

      if (!surfaces.length) return mockVisionProvider.analyzeRoom(image);

      const warnings = (payload.warnings ?? []).filter((warning): warning is
        RoomAnalysisWarning =>
        [
          "NO_FLOOR_DETECTED",
          "NO_WALL_DETECTED",
          "LOW_LIGHT",
          "BLURRY",
          "LOW_RESOLUTION",
        ].includes(warning),
      );

      // Quality metrics still come from the local preview — they are cheap and
      // do not depend on the model.
      const local = await mockVisionProvider.analyzeRoom(image);

      return {
        imageWidth: image.width,
        imageHeight: image.height,
        surfaces,
        objects: (payload.objects ?? []).map((object) => ({
          kind:
            (object.kind?.toUpperCase() as RoomAnalysis["objects"][number]["kind"]) ??
            "OTHER",
          label: object.label ?? "אובייקט",
          polygon: toPoints(object.polygon),
        })),
        brightness: local.brightness,
        sharpness: local.sharpness,
        warnings: [...new Set([...warnings, ...local.warnings.filter((w) =>
          ["LOW_LIGHT", "BLURRY", "LOW_RESOLUTION"].includes(w),
        )])],
        providerId: this.id,
        analysedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[vision] remote provider failed", error);
      return mockVisionProvider.analyzeRoom(image);
    }
  },

  async segmentFloor(image) {
    const analysis = await this.analyzeRoom(image);
    return analysis.surfaces.find((surface) => surface.kind === "FLOOR") ?? null;
  },

  async segmentWalls(image) {
    const analysis = await this.analyzeRoom(image);
    return analysis.surfaces.filter((surface) => surface.kind === "WALL");
  },

  async generateMask(image, surface) {
    const analysis = await this.analyzeRoom(image);
    return analysis.surfaces.find((entry) => entry.kind === surface) ?? null;
  },
};
