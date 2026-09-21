import { describe, expect, it } from 'vitest'
import { canTransition, evaluatePublish, type PublishCandidate } from '@/lib/catalog/publish-guard'

function candidate(overrides: Partial<PublishCandidate> = {}): PublishCandidate {
  return {
    name: 'מוצר',
    kind: 'GENERAL',
    status: 'READY_TO_PUBLISH',
    price: 4900,
    mediaCount: 1,
    regulatory: null,
    ...overrides,
  }
}

describe('publish guard', () => {
  it('allows a complete general product', () => {
    expect(evaluatePublish(candidate()).allowed).toBe(true)
  })

  it('blocks a product with no price', () => {
    const result = evaluatePublish(candidate({ price: null }))
    expect(result.allowed).toBe(false)
    expect(result.blockers).toContain('לא הוגדר מחיר מכירה')
  })

  it('blocks a product with no image', () => {
    const result = evaluatePublish(candidate({ mediaCount: 0 }))
    expect(result.allowed).toBe(false)
    expect(result.blockers).toContain('לא הועלתה אף תמונה למוצר')
  })

  it('refuses to publish an unverified pest-control product', () => {
    const result = evaluatePublish(
      candidate({
        kind: 'PEST_CONTROL',
        regulatory: {
          status: 'REQUIRES_VERIFICATION',
          publicUseAllowed: null,
          registrationNumber: null,
          labelVerifiedAt: null,
          expiresAt: null,
        },
      }),
    )
    expect(result.allowed).toBe(false)
    expect(result.blockers).toContain('המוצר טרם אומת לשימוש הקהל הרחב')
    expect(result.blockers).toContain('לא אומת כי המוצר מותר לשימוש הקהל הרחב')
    expect(result.blockers).toContain('חסר מספר רישום')
  })

  it('refuses a pest-control product with no regulatory record at all', () => {
    const result = evaluatePublish(candidate({ kind: 'PEST_CONTROL', regulatory: null }))
    expect(result.allowed).toBe(false)
    expect(result.blockers).toContain('אין רשומה רגולטורית למוצר')
  })

  it('publishes a fully verified pest-control product', () => {
    const result = evaluatePublish(
      candidate({
        kind: 'PEST_CONTROL',
        regulatory: {
          status: 'VERIFIED_PUBLIC_USE',
          publicUseAllowed: true,
          registrationNumber: 'REG-123',
          labelVerifiedAt: new Date('2026-01-01'),
          expiresAt: new Date('2030-01-01'),
        },
      }),
    )
    expect(result.blockers).toEqual([])
    expect(result.allowed).toBe(true)
  })

  it('blocks an expired verification even when everything else is filled in', () => {
    const result = evaluatePublish(
      candidate({
        kind: 'PEST_CONTROL',
        regulatory: {
          status: 'VERIFIED_PUBLIC_USE',
          publicUseAllowed: true,
          registrationNumber: 'REG-123',
          labelVerifiedAt: new Date('2020-01-01'),
          expiresAt: new Date('2021-01-01'),
        },
      }),
      new Date('2026-09-21'),
    )
    expect(result.allowed).toBe(false)
    expect(result.blockers).toContain('תוקף האימות הרגולטורי פג')
  })

  it('never publishes a professional-only product', () => {
    const result = evaluatePublish(
      candidate({
        kind: 'GENERAL',
        regulatory: {
          status: 'PROFESSIONAL_ONLY',
          publicUseAllowed: false,
          registrationNumber: 'REG-9',
          labelVerifiedAt: new Date(),
          expiresAt: null,
        },
      }),
    )
    expect(result.allowed).toBe(false)
    expect(result.blockers).toContain('המוצר מסומן לאנשי מקצוע בלבד ואינו ניתן לפרסום בחנות')
  })

  it('holds a trap whose regulatory record is still awaiting review', () => {
    const result = evaluatePublish(
      candidate({
        kind: 'TRAP',
        regulatory: {
          status: 'REQUIRES_VERIFICATION',
          publicUseAllowed: null,
          registrationNumber: null,
          labelVerifiedAt: null,
          expiresAt: null,
        },
      }),
    )
    expect(result.allowed).toBe(false)
    expect(result.blockers).toContain('הרשומה הרגולטורית של המוצר ממתינה לאימות')
  })

  it('restricts status transitions', () => {
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(false)
    expect(canTransition('READY_TO_PUBLISH', 'PUBLISHED')).toBe(true)
    expect(canTransition('ARCHIVED', 'PUBLISHED')).toBe(false)
  })
})
