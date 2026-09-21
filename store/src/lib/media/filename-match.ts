/**
 * Bulk import filename convention:
 *   RPC-001-main.jpg → SKU "RPC-001", main image
 *   RPC-001-2.jpg    → SKU "RPC-001", gallery position 2
 *   RPC-001.jpg      → SKU "RPC-001", first image
 */
export interface ParsedFileName {
  fileName: string
  sku: string
  isMain: boolean
  order: number
}

export function parseImportFileName(fileName: string): ParsedFileName {
  const withoutExt = fileName.replace(/\.[a-z0-9]+$/i, '')
  const mainMatch = withoutExt.match(/^(.+?)[-_](main|ראשי)$/i)
  if (mainMatch) return { fileName, sku: mainMatch[1], isMain: true, order: 0 }

  const indexMatch = withoutExt.match(/^(.+?)[-_](\d{1,3})$/)
  if (indexMatch) {
    const order = Number(indexMatch[2])
    return { fileName, sku: indexMatch[1], isMain: order === 1, order }
  }

  return { fileName, sku: withoutExt, isMain: true, order: 0 }
}

export interface MatchRow extends ParsedFileName {
  productId: string | null
  productName: string | null
  matchedBy: 'sku' | 'barcode' | 'supplierSku' | 'name' | null
  existingImages: number
}

export function sortMatchRows(rows: MatchRow[]): MatchRow[] {
  return [...rows].sort((a, b) => (a.sku === b.sku ? a.order - b.order : a.sku.localeCompare(b.sku)))
}
