import { describe, expect, it } from 'vitest'
import { parseImportFileName, sortMatchRows, type MatchRow } from '@/lib/media/filename-match'

describe('bulk media filename parsing', () => {
  it('reads the main-image convention', () => {
    expect(parseImportFileName('RPC-001-main.jpg')).toEqual({
      fileName: 'RPC-001-main.jpg', sku: 'RPC-001', isMain: true, order: 0,
    })
  })

  it('reads numbered gallery images', () => {
    expect(parseImportFileName('RPC-001-2.jpg')).toMatchObject({ sku: 'RPC-001', isMain: false, order: 2 })
    expect(parseImportFileName('RPC-001-1.png')).toMatchObject({ sku: 'RPC-001', isMain: true, order: 1 })
  })

  it('falls back to the whole basename', () => {
    expect(parseImportFileName('fix-gel.webp')).toMatchObject({ sku: 'fix-gel', isMain: true })
  })

  it('sorts rows by sku then position', () => {
    const rows: MatchRow[] = ['B-1.jpg', 'A-2.jpg', 'A-1.jpg'].map((name) => ({
      ...parseImportFileName(name), productId: null, productName: null, matchedBy: null, existingImages: 0,
    }))
    expect(sortMatchRows(rows).map((r) => r.fileName)).toEqual(['A-1.jpg', 'A-2.jpg', 'B-1.jpg'])
  })
})
