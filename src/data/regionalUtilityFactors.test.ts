import { describe, expect, it } from 'vitest'
import { getRegionalUtilityFactors, getUtilityRegionalMultiplier } from './regionalUtilityFactors'

describe('getRegionalUtilityFactors', () => {
  it('returns 1 for all fuels for unknown province', () => {
    const f = getRegionalUtilityFactors('XX')
    expect(f.electricity).toBe(1)
    expect(f.naturalGas).toBe(1)
    expect(f.oil).toBe(1)
  })

  it('normalizes province casing', () => {
    const a = getRegionalUtilityFactors('on')
    const b = getRegionalUtilityFactors('ON')
    expect(a).toEqual(b)
  })
})

describe('getUtilityRegionalMultiplier', () => {
  const factors = { electricity: 1.2, naturalGas: 0.9, oil: 1.1 }

  it('maps electricity and heating options to the correct fuel', () => {
    expect(getUtilityRegionalMultiplier('electricity', 'base', factors)).toBe(1.2)
    expect(getUtilityRegionalMultiplier('heating', 'electric', factors)).toBe(1.2)
    expect(getUtilityRegionalMultiplier('heating', 'gas', factors)).toBe(0.9)
    expect(getUtilityRegionalMultiplier('heating', 'oil', factors)).toBe(1.1)
    expect(getUtilityRegionalMultiplier('naturalGas', 'basic', factors)).toBe(0.9)
  })

  it('returns 1 for non-utility amenities', () => {
    expect(getUtilityRegionalMultiplier('parking', 'reserved', factors)).toBe(1)
    expect(getUtilityRegionalMultiplier('storage', 'locker', factors)).toBe(1)
  })
})
