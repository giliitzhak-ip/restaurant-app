import { afterEach, describe, expect, it, vi } from 'vitest'
import { SeededRandom } from '@/lib/simulator/random'
import { SCENARIOS, SCENARIO_BY_KEY } from '@/lib/simulator/scenarios'
import { simulatorEnabled } from '@/lib/simulator/engine'

describe('seeded random', () => {
  it('is deterministic for the same seed', () => {
    const a = new SeededRandom(1234)
    const b = new SeededRandom(1234)
    const seqA = Array.from({ length: 20 }, () => a.next())
    const seqB = Array.from({ length: 20 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('differs across seeds', () => {
    const a = Array.from({ length: 10 }, (_, i) => new SeededRandom(1).next() + i)
    const b = Array.from({ length: 10 }, (_, i) => new SeededRandom(2).next() + i)
    expect(a).not.toEqual(b)
  })

  it('stays inside the requested integer range', () => {
    const random = new SeededRandom(99)
    for (let i = 0; i < 500; i += 1) {
      const value = random.int(3, 7)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(7)
      expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('samples distinct items and never more than the pool', () => {
    const random = new SeededRandom(5)
    const items = ['a', 'b', 'c']
    const sample = random.sample(items, 10)
    expect(sample).toHaveLength(3)
    expect(new Set(sample).size).toBe(3)
  })

  it('refuses to pick from an empty list', () => {
    expect(() => new SeededRandom(1).pick([])).toThrow()
  })
})

describe('scenario catalogue', () => {
  it('gives every scenario a label and description', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.label.length).toBeGreaterThan(0)
      expect(scenario.description.length).toBeGreaterThan(0)
      expect(SCENARIO_BY_KEY.get(scenario.key)).toBe(scenario)
    }
  })

  it('keeps the overselling probe out of the default mix', () => {
    expect(SCENARIO_BY_KEY.get('OUT_OF_STOCK')!.weight).toBe(0)
    expect(SCENARIOS.filter((s) => s.weight > 0).length).toBeGreaterThan(3)
  })
})

describe('production guard', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is available outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(simulatorEnabled()).toBe(true)
  })

  it('is off in production unless explicitly enabled', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_SIMULATOR', '')
    expect(simulatorEnabled()).toBe(false)

    vi.stubEnv('ENABLE_SIMULATOR', 'true')
    expect(simulatorEnabled()).toBe(true)
  })
})
