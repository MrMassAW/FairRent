import { describe, expect, it } from 'vitest'
import type { CmhcRentRow } from '../data/cmhcRents'
import {
  getCmhcCityCandidates,
  isDisplayFriendlyCatalogCity,
  isUsableCityMatchForLookup,
  resolveClosestCmhcCity,
  resolveClosestInCityList,
  resolveClosestMasterCity,
} from './cmhcLookup'

const rows: CmhcRentRow[] = [
  { province: 'AB', city: 'Calgary', bedrooms: 1, structureType: 'purpose-built', avgRent: 1500, surveyYear: 2025 },
  { province: 'AB', city: 'Edmonton', bedrooms: 1, structureType: 'purpose-built', avgRent: 1400, surveyYear: 2025 },
  { province: 'ON', city: 'London', bedrooms: 1, structureType: 'purpose-built', avgRent: 1600, surveyYear: 2025 },
]

describe('resolveClosestCmhcCity', () => {
  it('returns exact city match when present', () => {
    const resolved = resolveClosestCmhcCity('AB', 'Calgary', rows)
    expect(resolved.selectedCity).toBe('Calgary')
    expect(resolved.usedFallback).toBe(false)
    expect(resolved.reason).toBe('exact-match')
  })

  it('returns fuzzy nearest match for typo variants', () => {
    const resolved = resolveClosestCmhcCity('AB', 'Calgery', rows)
    expect(resolved.selectedCity).toBe('Calgary')
    expect(resolved.usedFallback).toBe(true)
    expect(resolved.reason).toBe('fuzzy-match')
  })

  it('falls back to province first city for unknown city', () => {
    const resolved = resolveClosestCmhcCity('AB', 'Atlantis', rows)
    expect(resolved.selectedCity).toBe('Calgary')
    expect(resolved.usedFallback).toBe(true)
  })

  it('does not leak to other province city matches', () => {
    const resolved = resolveClosestCmhcCity('AB', 'London', rows)
    expect(resolved.selectedCity).not.toBe('London')
    expect(['Calgary', 'Edmonton']).toContain(resolved.selectedCity)
  })
})

describe('isDisplayFriendlyCatalogCity', () => {
  it('rejects municipal-district style labels', () => {
    expect(isDisplayFriendlyCatalogCity('Bonnyville No. 87 MD')).toBe(false)
    expect(isDisplayFriendlyCatalogCity('Grande Prairie County No. 1 MD')).toBe(false)
  })

  it('accepts common urban names', () => {
    expect(isDisplayFriendlyCatalogCity('Calgary')).toBe(true)
    expect(isDisplayFriendlyCatalogCity('Kitchener - Cambridge - Waterloo')).toBe(true)
  })
})

describe('resolveClosestInCityList', () => {
  it('matches against the provided list only', () => {
    const list = ['Alpha', 'Bravo', 'Calgary']
    const r = resolveClosestInCityList('AB', 'Calgery', list)
    expect(r.selectedCity).toBe('Calgary')
    expect(r.reason).toBe('fuzzy-match')
  })
})

describe('resolveClosestMasterCity', () => {
  it('matches only rent-row city names', () => {
    const r = resolveClosestMasterCity('AB', 'Calgery', rows)
    expect(r.selectedCity).toBe('Calgary')
    expect(isUsableCityMatchForLookup(r)).toBe(true)
  })

  it('does not treat default fallback as a confident match', () => {
    const r = resolveClosestMasterCity('AB', 'Atlantis', rows)
    expect(r.usedFallback).toBe(true)
    expect(isUsableCityMatchForLookup(r)).toBe(false)
  })
})

describe('getCmhcCityCandidates', () => {
  it('omits No.-style catalog entries but keeps rent-row cities', () => {
    const custom: CmhcRentRow[] = [
      ...rows,
      { province: 'AB', city: 'Custom No. 99 Row', bedrooms: 1, structureType: 'purpose-built', avgRent: 1, surveyYear: 2025 },
    ]
    const list = getCmhcCityCandidates('AB', custom)
    expect(list.some((c) => c.includes('No. 87'))).toBe(false)
    expect(list).toContain('Custom No. 99 Row')
  })
})
