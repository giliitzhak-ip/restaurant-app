import { describe, expect, it } from 'vitest'
import { parseOptions } from '@/lib/solver/service'

describe('solver option parsing', () => {
  it('reads well-formed options', () => {
    const options = parseOptions([
      { value: 'kitchen', label: 'מטבח', tags: ['indoor'] },
      { value: 'yard', label: 'חצר' },
    ])
    expect(options).toHaveLength(2)
    expect(options[0].tags).toEqual(['indoor'])
    expect(options[1].tags).toEqual([])
  })

  it('discards malformed entries instead of throwing', () => {
    expect(parseOptions([{ label: 'ללא ערך' }, null, 'string', 7])).toEqual([])
    expect(parseOptions(null)).toEqual([])
    expect(parseOptions({})).toEqual([])
  })
})
