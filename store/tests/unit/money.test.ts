import { describe, expect, it } from 'vitest'
import {
  calculateMargin, discountPercent, effectivePrice, formatAgorot,
  shekelsToAgorot, vatFromGross,
} from '@/lib/money'

describe('money', () => {
  it('keeps monetary values in integer minor units', () => {
    expect(shekelsToAgorot(49.9)).toBe(4990)
    expect(shekelsToAgorot(0.1 + 0.2)).toBe(30)
  })

  it('shows a pending label instead of inventing a price', () => {
    expect(formatAgorot(null)).toBe('ממתין לעדכון')
    expect(formatAgorot(undefined)).toBe('ממתין לעדכון')
  })

  it('extracts VAT contained in a gross amount', () => {
    // 117 including 17% VAT → 17 of VAT
    expect(vatFromGross(11700, 1700)).toBe(1700)
  })

  it('prefers the sale price only when it is genuinely lower', () => {
    expect(effectivePrice(10000, 8000)).toBe(8000)
    expect(effectivePrice(10000, 12000)).toBe(10000)
    expect(effectivePrice(10000, null)).toBe(10000)
    expect(effectivePrice(null, null)).toBeNull()
  })

  it('computes the discount percentage', () => {
    expect(discountPercent(10000, 7500)).toBe(25)
    expect(discountPercent(10000, 10000)).toBeNull()
    expect(discountPercent(null, 7500)).toBeNull()
  })

  it('computes gross profit and margin, and withholds both when data is missing', () => {
    expect(calculateMargin(10000, 6000)).toEqual({ grossProfit: 4000, grossMarginPercent: 40 })
    expect(calculateMargin(10000, null)).toEqual({ grossProfit: null, grossMarginPercent: null })
    expect(calculateMargin(null, 6000)).toEqual({ grossProfit: null, grossMarginPercent: null })
  })
})
