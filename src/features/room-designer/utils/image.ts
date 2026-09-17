import { designerConfig } from "@/config/brand";

export interface WorkingImage {
  /** Object URL for display and for the before/after slider. */
  url: string;
  width: number;
  height: number;
  /** Pixels at working resolution — the render engine reads these. */
  base: ImageData;
  /** Small RGBA preview sent to the vision provider. */
  preview: { width: number; height: number; rgba: Uint8ClampedArray };
  /** The file itself, kept in memory for saving or for a remote provider. */
  file: File | null;
}

const PREVIEW_EDGE = 128;

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function decode(source: Blob | string): Promise<HTMLImageElement> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
    image.src = url;
  });
  return image;
}

/**
 * Prepares an uploaded photo for the engine: one downscale to a working
 * resolution (so a 12 MP phone photo does not cost a second per render), plus
 * a thumbnail for the segmentation provider.
 */
export async function prepareImage(
  source: File | string,
  maxEdge = designerConfig.maxRenderEdge,
): Promise<WorkingImage> {
  const image = await decode(source);
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  const ratio = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * ratio));
  const height = Math.max(1, Math.round(naturalHeight * ratio));

  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  ctx.drawImage(image, 0, 0, width, height);
  const base = ctx.getImageData(0, 0, width, height);

  const previewRatio = Math.min(1, PREVIEW_EDGE / Math.max(width, height));
  const previewWidth = Math.max(16, Math.round(width * previewRatio));
  const previewHeight = Math.max(16, Math.round(height * previewRatio));
  const previewCanvas = canvasOf(previewWidth, previewHeight);
  const previewCtx = previewCanvas.getContext("2d", { willReadFrequently: true });
  if (!previewCtx) throw new Error("CANVAS_UNAVAILABLE");
  previewCtx.drawImage(canvas, 0, 0, previewWidth, previewHeight);
  const previewData = previewCtx.getImageData(0, 0, previewWidth, previewHeight);

  return {
    url: typeof source === "string" ? source : URL.createObjectURL(source),
    width,
    height,
    base,
    preview: {
      width: previewWidth,
      height: previewHeight,
      rgba: previewData.data,
    },
    file: typeof source === "string" ? null : source,
  };
}

/** Turns a canvas into a JPEG file, for saving the render. */
export async function canvasToFile(
  canvas: HTMLCanvasElement,
  name: string,
  quality = 0.86,
): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((value) => resolve(value), "image/jpeg", quality),
  );
  if (!blob) throw new Error("RENDER_EXPORT_FAILED");
  return new File([blob], name, { type: "image/jpeg" });
}
