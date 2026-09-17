"use client";

import * as React from "react";
import { track } from "@/lib/analytics";
import { roundTo } from "@/lib/format";
import { analyzeRoomAction } from "@/server/actions/room-vision";
import type { ProductSwatch } from "@/types/catalog";
import type {
  NormPoint,
  RoomAnalysis,
  RoomDesignRecord,
  RoomSurfaceMask,
  SurfaceKind,
  TextureSettings,
} from "@/types/design";
import {
  buildSurfacePlane,
  defaultSettings,
  estimateAreaSqm,
  loadTexture,
  rasterizeMask,
  renderSurface,
  type RasterMask,
} from "../engine";
import { prepareImage, type WorkingImage } from "../utils/image";

export type DesignerStep = "upload" | "analyzing" | "design";

export interface SurfaceState {
  mask: RoomSurfaceMask;
  productId: string | null;
  settings: TextureSettings;
  areaSqm: number;
}

interface DesignerState {
  step: DesignerStep;
  image: WorkingImage | null;
  analysis: RoomAnalysis | null;
  surfaces: SurfaceState[];
  activeSurfaceId: string | null;
  activeKind: SurfaceKind;
  roomWidthM: number;
  error: string | null;
  rendering: boolean;
  designId: string | null;
  designName: string;
}

const MANUAL_FLOOR_ID = "manual-floor";
const MANUAL_WALL_ID = "manual-wall";

export function useDesigner({
  swatches,
  initialProductSlug,
  initialSurface,
  savedDesign,
}: {
  swatches: ProductSwatch[];
  initialProductSlug?: string;
  initialSurface?: SurfaceKind;
  /** Reopening a design from "my designs". */
  savedDesign?: RoomDesignRecord | null;
}) {
  const [state, setState] = React.useState<DesignerState>({
    // A saved design goes straight to the loading state; the photo and masks
    // are restored in the effect below. A design whose photo the customer
    // deleted starts at the upload step instead.
    step: savedDesign?.originalImageUrl ? "analyzing" : "upload",
    image: null,
    analysis: null,
    surfaces: [],
    activeSurfaceId: null,
    activeKind: initialSurface ?? "FLOOR",
    roomWidthM: 4,
    error: null,
    rendering: false,
    designId: savedDesign?.id ?? null,
    designName: savedDesign?.name ?? "",
  });

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const maskCache = React.useRef(new Map<string, RasterMask>());
  const frame = React.useRef<number | null>(null);
  const swatchById = React.useMemo(
    () => new Map(swatches.map((swatch) => [swatch.id, swatch])),
    [swatches],
  );

  /* ----------------------------- image intake ---------------------------- */

  const applyAnalysis = React.useCallback(
    (image: WorkingImage, analysis: RoomAnalysis) => {
      const surfaces: SurfaceState[] = analysis.surfaces.map((mask) => {
        const plane = buildSurfacePlane(mask, image.width, image.height, 4);
        return {
          mask,
          productId: null,
          settings: { ...defaultSettings },
          areaSqm: estimateAreaSqm(mask, plane, image.width, image.height),
        };
      });

      const preferred =
        surfaces.find((surface) => surface.mask.kind === (initialSurface ?? "FLOOR")) ??
        surfaces[0];

      // A deep link from a product page ("see it in my room") applies straight
      // away, so the customer lands on a finished visualisation.
      const deepLinked = initialProductSlug
        ? swatches.find((swatch) => swatch.slug === initialProductSlug)
        : undefined;
      if (deepLinked && preferred) {
        preferred.productId = deepLinked.id;
        preferred.settings = {
          ...preferred.settings,
          orientation: deepLinked.orientation,
          scale: deepLinked.scaleFactor,
        };
      }

      setState((current) => ({
        ...current,
        step: "design",
        image,
        analysis,
        surfaces,
        activeSurfaceId: preferred?.mask.id ?? null,
        activeKind: preferred?.mask.kind ?? current.activeKind,
        error: null,
      }));
    },
    [initialProductSlug, initialSurface, swatches],
  );

  const loadImage = React.useCallback(
    async (source: File | string, origin: "camera" | "file" | "demo") => {
      setState((current) => ({ ...current, step: "analyzing", error: null }));
      maskCache.current.clear();

      let image: WorkingImage;
      try {
        image = await prepareImage(source);
      } catch {
        setState((current) => ({
          ...current,
          step: "upload",
          error: "IMAGE_DECODE_FAILED",
        }));
        return;
      }

      track("upload_room", {
        source: origin,
        width: image.width,
        height: image.height,
      });

      const started = performance.now();
      const previewPayload = JSON.stringify({
        width: image.preview.width,
        height: image.preview.height,
        rgba: Array.from(image.preview.rgba),
      });

      const formData = new FormData();
      formData.set("width", String(image.width));
      formData.set("height", String(image.height));
      formData.set("preview", previewPayload);

      const result = await analyzeRoomAction(formData);

      if (!result.ok) {
        // The customer can still mark the surface by hand.
        setState((current) => ({
          ...current,
          step: "design",
          image,
          analysis: null,
          surfaces: [],
          activeSurfaceId: null,
          error: "PROVIDER_FAILED",
        }));
        return;
      }

      track("analyze_room", {
        provider: result.analysis.providerId,
        durationMs: Math.round(performance.now() - started),
        surfaces: result.analysis.surfaces.length,
        warnings: result.analysis.warnings,
      });

      applyAnalysis(image, result.analysis);

      // A provider that needs the full photo gets it in a second call, so the
      // first (fast, local) answer is already on screen.
      if (result.needsFullImage && image.file) {
        const fullForm = new FormData();
        fullForm.set("width", String(image.width));
        fullForm.set("height", String(image.height));
        fullForm.set("preview", previewPayload);
        fullForm.set("image", image.file);
        void analyzeRoomAction(fullForm).then((upgraded) => {
          if (upgraded.ok) applyAnalysis(image, upgraded.analysis);
        });
      }
    },
    [applyAnalysis],
  );

  /* --------------------------- restore a design -------------------------- */

  const restoreDesign = React.useCallback(
    async (design: RoomDesignRecord) => {
      maskCache.current.clear();
      let image: WorkingImage;
      try {
        image = await prepareImage(design.originalImageUrl);
      } catch {
        setState((current) => ({
          ...current,
          step: "upload",
          error: "IMAGE_DECODE_FAILED",
        }));
        return;
      }

      const surfaces: SurfaceState[] = design.surfaces.map((surface) => ({
        mask: surface.mask,
        productId: surface.productId,
        settings: surface.settings,
        areaSqm: surface.areaSqm,
      }));
      const preferred =
        surfaces.find((surface) => surface.mask.kind === "FLOOR") ?? surfaces[0];

      setState((current) => ({
        ...current,
        step: "design",
        image,
        analysis: design.analysis,
        surfaces,
        activeSurfaceId: preferred?.mask.id ?? null,
        activeKind: preferred?.mask.kind ?? current.activeKind,
        designId: design.id,
        designName: design.name,
        error: null,
      }));
    },
    [],
  );

  const restored = React.useRef(false);
  React.useEffect(() => {
    if (!savedDesign?.originalImageUrl || restored.current) return;
    restored.current = true;
    void restoreDesign(savedDesign);
  }, [restoreDesign, savedDesign]);

  /* ------------------------------ selection ------------------------------ */

  const setActiveKind = React.useCallback((kind: SurfaceKind) => {
    setState((current) => {
      const match = current.surfaces.find((surface) => surface.mask.kind === kind);
      if (match) {
        track("select_surface", {
          surface: kind === "WALL" ? "WALL" : "FLOOR",
          source: match.mask.source,
        });
      }
      return {
        ...current,
        activeKind: kind,
        activeSurfaceId: match?.mask.id ?? null,
      };
    });
  }, []);

  const setActiveSurface = React.useCallback((surfaceId: string) => {
    setState((current) => {
      const match = current.surfaces.find((surface) => surface.mask.id === surfaceId);
      return {
        ...current,
        activeSurfaceId: surfaceId,
        activeKind: match?.mask.kind ?? current.activeKind,
      };
    });
  }, []);

  const applyProduct = React.useCallback(
    (productId: string, surfaceIds?: string[]) => {
      setState((current) => {
        const targets =
          surfaceIds ??
          (current.activeSurfaceId ? [current.activeSurfaceId] : []);
        if (!targets.length) return current;

        const swatch = swatchById.get(productId);
        if (swatch) {
          const kind = current.surfaces.find((s) => s.mask.id === targets[0])?.mask.kind;
          track("apply_product", {
            slug: swatch.slug,
            surface: kind === "WALL" ? "WALL" : "FLOOR",
          });
        }

        return {
          ...current,
          surfaces: current.surfaces.map((surface) =>
            targets.includes(surface.mask.id)
              ? {
                  ...surface,
                  productId,
                  settings: {
                    ...surface.settings,
                    orientation:
                      swatch?.orientation ?? surface.settings.orientation,
                    scale: swatch?.scaleFactor ?? surface.settings.scale,
                  },
                }
              : surface,
          ),
        };
      });
    },
    [swatchById],
  );

  const clearSurfaceProduct = React.useCallback((surfaceId: string) => {
    setState((current) => ({
      ...current,
      surfaces: current.surfaces.map((surface) =>
        surface.mask.id === surfaceId ? { ...surface, productId: null } : surface,
      ),
    }));
  }, []);

  const updateSettings = React.useCallback(
    (patch: Partial<TextureSettings>) => {
      setState((current) => ({
        ...current,
        surfaces: current.surfaces.map((surface) =>
          surface.mask.id === current.activeSurfaceId
            ? { ...surface, settings: { ...surface.settings, ...patch } }
            : surface,
        ),
      }));
    },
    [],
  );

  const resetSettings = React.useCallback(() => {
    setState((current) => ({
      ...current,
      surfaces: current.surfaces.map((surface) =>
        surface.mask.id === current.activeSurfaceId
          ? { ...surface, settings: { ...defaultSettings } }
          : surface,
      ),
    }));
  }, []);

  const setRoomWidth = React.useCallback((value: number) => {
    setState((current) => {
      if (!current.image) return { ...current, roomWidthM: value };
      const image = current.image;
      return {
        ...current,
        roomWidthM: value,
        surfaces: current.surfaces.map((surface) => {
          const plane = buildSurfacePlane(
            surface.mask,
            image.width,
            image.height,
            value,
          );
          return {
            ...surface,
            areaSqm: estimateAreaSqm(surface.mask, plane, image.width, image.height),
          };
        }),
      };
    });
  }, []);

  /* ---------------------------- manual masking --------------------------- */

  const commitManualMask = React.useCallback(
    (kind: SurfaceKind, polygon: NormPoint[], holes: NormPoint[][] = []) => {
      setState((current) => {
        if (!current.image || polygon.length < 3) return current;
        const image = current.image;
        const id = kind === "WALL" ? MANUAL_WALL_ID : MANUAL_FLOOR_ID;
        const mask: RoomSurfaceMask = {
          id,
          kind,
          label: kind === "WALL" ? "קיר (סימון ידני)" : "רצפה (סימון ידני)",
          polygon,
          holes,
          confidence: 1,
          source: "MANUAL",
        };
        maskCache.current.delete(id);

        const plane = buildSurfacePlane(
          mask,
          image.width,
          image.height,
          current.roomWidthM,
        );
        const areaSqm = estimateAreaSqm(mask, plane, image.width, image.height);
        const existing = current.surfaces.find((surface) => surface.mask.id === id);

        const surfaces = existing
          ? current.surfaces.map((surface) =>
              surface.mask.id === id ? { ...surface, mask, areaSqm } : surface,
            )
          : [
              ...current.surfaces,
              {
                mask,
                productId:
                  current.surfaces.find((s) => s.mask.kind === kind)?.productId ?? null,
                settings: { ...defaultSettings },
                areaSqm,
              },
            ];

        track("select_surface", {
          surface: kind === "WALL" ? "WALL" : "FLOOR",
          source: "MANUAL",
        });

        return { ...current, surfaces, activeSurfaceId: id, activeKind: kind };
      });
    },
    [],
  );

  const addHoleToActiveSurface = React.useCallback((hole: NormPoint[]) => {
    setState((current) => {
      if (!current.activeSurfaceId || hole.length < 3) return current;
      maskCache.current.delete(current.activeSurfaceId);
      return {
        ...current,
        surfaces: current.surfaces.map((surface) =>
          surface.mask.id === current.activeSurfaceId
            ? {
                ...surface,
                mask: { ...surface.mask, holes: [...surface.mask.holes, hole] },
              }
            : surface,
        ),
      };
    });
  }, []);

  /* ------------------------------ rendering ------------------------------ */

  const renderNow = React.useCallback(async () => {
    const canvas = canvasRef.current;
    const image = state.image;
    if (!canvas || !image) return;

    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const target = new ImageData(
      new Uint8ClampedArray(image.base.data),
      image.width,
      image.height,
    );

    const painted = state.surfaces.filter((surface) => surface.productId);
    if (painted.length) {
      setState((current) => ({ ...current, rendering: true }));
    }

    for (const surface of painted) {
      const swatch = swatchById.get(surface.productId!);
      if (!swatch) continue;

      let mask = maskCache.current.get(surface.mask.id);
      if (!mask) {
        mask = rasterizeMask(
          surface.mask,
          image.width,
          image.height,
          Math.max(1, Math.round(Math.min(image.width, image.height) * 0.004)),
        );
        maskCache.current.set(surface.mask.id, mask);
      }

      try {
        const texture = await loadTexture(swatch.textureUrl);
        const plane = buildSurfacePlane(
          surface.mask,
          image.width,
          image.height,
          state.roomWidthM,
        );
        renderSurface({
          base: image.base,
          target,
          mask,
          plane,
          texture: {
            data: texture,
            widthCm: swatch.textureWidthCm,
            heightCm: swatch.textureHeightCm,
            patternType: swatch.patternType,
          },
          settings: surface.settings,
        });
      } catch (error) {
        console.error("[designer] render failed", error);
      }
    }

    ctx.putImageData(target, 0, 0);
    setState((current) => ({ ...current, rendering: false }));
  }, [state.image, state.roomWidthM, state.surfaces, swatchById]);

  // Re-render on any change, coalesced into one animation frame.
  React.useEffect(() => {
    if (state.step !== "design") return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      void renderNow();
    });
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [renderNow, state.step]);

  /* -------------------------------- derived ------------------------------ */

  const activeSurface =
    state.surfaces.find((surface) => surface.mask.id === state.activeSurfaceId) ?? null;

  const selectedProducts = React.useMemo(() => {
    const entries = state.surfaces
      .filter((surface) => surface.productId)
      .map((surface) => ({
        surface,
        swatch: swatchById.get(surface.productId!) ?? null,
      }))
      .filter((entry): entry is { surface: SurfaceState; swatch: ProductSwatch } =>
        Boolean(entry.swatch),
      );
    return entries;
  }, [state.surfaces, swatchById]);

  const estimate = React.useMemo(() => {
    let area = 0;
    let price = 0;
    for (const { surface, swatch } of selectedProducts) {
      area += surface.areaSqm;
      const perSqm =
        swatch.pricePerSqm ??
        (swatch.packageCoverageSqm
          ? swatch.pricePerUnit / swatch.packageCoverageSqm
          : swatch.pricePerUnit);
      price += perSqm * surface.areaSqm;
    }
    return { areaSqm: roundTo(area, 2), price: roundTo(price, 0) };
  }, [selectedProducts]);

  const reset = React.useCallback(() => {
    maskCache.current.clear();
    setState({
      step: "upload",
      image: null,
      analysis: null,
      surfaces: [],
      activeSurfaceId: null,
      activeKind: initialSurface ?? "FLOOR",
      roomWidthM: 4,
      error: null,
      rendering: false,
      designId: null,
      designName: "",
    });
  }, [initialSurface]);

  const setDesignMeta = React.useCallback(
    (meta: { designId?: string | null; designName?: string }) => {
      setState((current) => ({
        ...current,
        designId: meta.designId ?? current.designId,
        designName: meta.designName ?? current.designName,
      }));
    },
    [],
  );

  return {
    ...state,
    canvasRef,
    activeSurface,
    selectedProducts,
    estimate,
    loadImage,
    setActiveKind,
    setActiveSurface,
    applyProduct,
    clearSurfaceProduct,
    updateSettings,
    resetSettings,
    setRoomWidth,
    commitManualMask,
    addHoleToActiveSurface,
    reset,
    setDesignMeta,
    renderNow,
  };
}

export type DesignerController = ReturnType<typeof useDesigner>;
