/** Image renditions generated for every uploaded product image. */
export const RENDITIONS = {
  thumbnail: { width: 160, height: 160 },
  card: { width: 600, height: 600 },
  page: { width: 1200, height: 1200 },
  zoom: { width: 2000, height: 2000 },
} as const

export type RenditionName = keyof typeof RENDITIONS

export interface RenditionRecord {
  key: string
  url: string
  width: number
  height: number
}

export type MediaVariants = Partial<Record<RenditionName, RenditionRecord>>

export function variantsFromJson(value: unknown): MediaVariants {
  if (!value || typeof value !== 'object') return {}
  const out: MediaVariants = {}
  for (const name of Object.keys(RENDITIONS) as RenditionName[]) {
    const entry = (value as Record<string, unknown>)[name]
    if (entry && typeof entry === 'object' && 'url' in entry) {
      const r = entry as Record<string, unknown>
      out[name] = {
        key: String(r.key ?? ''),
        url: String(r.url ?? ''),
        width: Number(r.width ?? 0),
        height: Number(r.height ?? 0),
      }
    }
  }
  return out
}

/** Best available URL for a given rendition, falling back to the original. */
export function pickRendition(
  variants: unknown,
  preferred: RenditionName,
  originalUrl: string,
): string {
  const parsed = variantsFromJson(variants)
  const order: RenditionName[] = ['thumbnail', 'card', 'page', 'zoom']
  const startIndex = order.indexOf(preferred)
  for (let i = startIndex; i < order.length; i += 1) {
    const found = parsed[order[i]]
    if (found?.url) return found.url
  }
  return parsed[preferred]?.url ?? originalUrl
}
