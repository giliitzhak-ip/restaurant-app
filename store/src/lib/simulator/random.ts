/**
 * Deterministic pseudo-random source. Passing the same seed reproduces the
 * same run, which makes a simulated dataset reviewable and comparable.
 */
export class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0 || 1
  }

  /** mulberry32 — small, fast, good enough for generating demo data. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1))
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('cannot pick from an empty list')
    return items[this.int(0, items.length - 1)]
  }

  /** Picks `count` distinct items, or fewer when the pool is smaller. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items]
    const out: T[] = []
    while (out.length < count && pool.length > 0) {
      out.push(pool.splice(this.int(0, pool.length - 1), 1)[0])
    }
    return out
  }

  bool(probability: number): boolean {
    return this.next() < probability
  }
}

/**
 * Generic Hebrew demo identities. These are obviously synthetic — no real
 * person's details are generated or used.
 */
export const FIRST_NAMES = ['נועה', 'איתי', 'יעל', 'עומר', 'שירה', 'דניאל', 'תמר', 'אורי', 'מאיה', 'רון', 'ליאת', 'גיא'] as const
export const LAST_NAMES = ['לוי', 'כהן', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'דהן', 'שרון', 'אזולאי', 'בר'] as const
export const CITIES = ['תל אביב', 'חיפה', 'ירושלים', 'באר שבע', 'ראשון לציון', 'פתח תקווה', 'נתניה', 'חולון', 'רעננה', 'מודיעין'] as const
export const STREETS = ['הרצל', 'ויצמן', 'בן גוריון', 'ז׳בוטינסקי', 'הזית', 'האלון', 'סוקולוב', 'רוטשילד'] as const
export const COURIER_NOTES = ['נא להשאיר בשער', 'לצלצל לפני הגעה', 'יש כלב בחצר', ''] as const

/** Simulated identities always use this domain, so cleanup is unambiguous. */
export const SIMULATION_EMAIL_DOMAIN = 'sim.local'
