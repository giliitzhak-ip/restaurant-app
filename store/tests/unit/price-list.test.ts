import { describe, expect, it } from 'vitest'
import { parseCsv, parseCostToAgorot, suggestMapping } from '@/lib/suppliers/price-list'

describe('supplier price list parsing', () => {
  it('parses CSV with quoted cells and commas', () => {
    const sheet = parseCsv('sku,name,cost\nA-1,"מוצר, עם פסיק",12.50\nA-2,שני,8\n')
    expect(sheet.headers).toEqual(['sku', 'name', 'cost'])
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[0].name).toBe('מוצר, עם פסיק')
    expect(sheet.rows[1].cost).toBe('8')
  })

  it('suggests a column mapping from Hebrew and English headers', () => {
    const mapping = suggestMapping(['מק״ט ספק', 'שם', 'מחיר', 'ברקוד'])
    expect(mapping.supplierSku).toBe('מק״ט ספק')
    expect(mapping.name).toBe('שם')
    expect(mapping.cost).toBe('מחיר')
    expect(mapping.barcode).toBe('ברקוד')
  })

  it('converts costs to agorot and refuses junk', () => {
    expect(parseCostToAgorot('12.50')).toBe(1250)
    expect(parseCostToAgorot('₪ 1,234.5')).toBe(123450)
    expect(parseCostToAgorot('')).toBeNull()
    expect(parseCostToAgorot('abc')).toBeNull()
    expect(parseCostToAgorot(undefined)).toBeNull()
  })
})
