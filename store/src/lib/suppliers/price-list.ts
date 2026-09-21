import ExcelJS from 'exceljs'

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, string>[]
}

/** Column roles the importer understands. */
export const IMPORT_FIELDS = ['supplierSku', 'sku', 'barcode', 'name', 'cost', 'vatRate', 'minimumQuantity', 'availability'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  supplierSku: 'מק״ט ספק',
  sku: 'מק״ט שלנו',
  barcode: 'ברקוד',
  name: 'שם מוצר',
  cost: 'מחיר עלות',
  vatRate: 'מע״מ (%)',
  minimumQuantity: 'כמות מינימלית',
  availability: 'זמינות',
}

export type ColumnMapping = Partial<Record<ImportField, string>>

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      out.push(current)
      current = ''
    } else {
      current += char
    }
  }
  out.push(current)
  return out.map((cell) => cell.trim())
}

export function parseCsv(text: string): ParsedSheet {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = splitCsvLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? ''
    })
    return record
  })
  return { headers, rows }
}

export async function parseXlsx(buffer: Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [] }

  const headers: string[] = []
  sheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim()
  })

  const rows: Record<string, string>[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      if (!header) return
      const value = row.getCell(index + 1).value
      record[header] = value === null || value === undefined ? '' : String(typeof value === 'object' && 'text' in value ? value.text : value).trim()
    })
    if (Object.values(record).some((v) => v !== '')) rows.push(record)
  })

  return { headers: headers.filter(Boolean), rows }
}

/** Best-effort mapping suggestion from common Hebrew/English header names. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const patterns: [ImportField, RegExp][] = [
    ['supplierSku', /(supplier.?sku|מק.?ט\s*ספק|קוד\s*ספק)/i],
    ['sku', /^(sku|מק.?ט|קטלוגי)/i],
    ['barcode', /(barcode|ean|ברקוד)/i],
    ['name', /(name|description|שם|תיאור)/i],
    ['cost', /(cost|price|מחיר|עלות)/i],
    ['vatRate', /(vat|מע.?מ)/i],
    ['minimumQuantity', /(min|מינימום|כמות\s*מינימלית)/i],
    ['availability', /(availab|stock|מלאי|זמינות)/i],
  ]
  for (const [field, pattern] of patterns) {
    const header = headers.find((h) => pattern.test(h))
    if (header && !Object.values(mapping).includes(header)) mapping[field] = header
  }
  return mapping
}

export type RowChange = 'NEW_PRODUCT' | 'PRICE_CHANGED' | 'UNCHANGED' | 'NOT_FOUND' | 'DUPLICATE_SKU' | 'INVALID'

export interface PreviewRow {
  index: number
  supplierSku: string | null
  sku: string | null
  barcode: string | null
  name: string | null
  /** agorot */
  cost: number | null
  currentCost: number | null
  productId: string | null
  productName: string | null
  change: RowChange
  note?: string
}

export function parseCostToAgorot(raw: string | undefined): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  if (cleaned === '') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}
