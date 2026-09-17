/**
 * Media path helpers.
 *
 * All demo imagery is procedurally generated into `public/media` by
 * `npm run media:generate` (see docs/MEDIA.md). Real photography replaces it
 * by overriding the URL stored on the product / category record — no code
 * change required, which is why nothing outside this file builds a media path.
 */
export const mediaRoot = "/media";

export type ProductShot = "studio" | "room" | "detail";

export const media = {
  texture: (slug: string) => `${mediaRoot}/textures/${slug}.png`,
  textureThumb: (slug: string) => `${mediaRoot}/textures/${slug}-thumb.png`,
  product: (slug: string, shot: ProductShot) =>
    `${mediaRoot}/products/${slug}-${shot}.png`,
  scene: (name: string) => `${mediaRoot}/scenes/${name}.png`,
  category: (slug: string) => `${mediaRoot}/categories/${slug}.png`,
  collection: (slug: string) => `${mediaRoot}/collections/${slug}.png`,
} as const;

/** Blur placeholder used while large imagery streams in. */
export const blurDataUrl = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjYiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjYiIGZpbGw9IiNlZmViZTUiLz48L3N2Zz4=";
