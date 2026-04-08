import { describe, expect, it } from 'vitest'
import { haversineKm, stepwiseFactorForKm } from './geoDistance'

describe('geoDistance', () => {
  it('haversineKm returns ~0 for identical points', () => {
    expect(haversineKm({ lat: 43.7, lng: -79.4 }, { lat: 43.7, lng: -79.4 })).toBeCloseTo(0, 6)
  })

  it('haversineKm is roughly symmetric and sane', () => {
    const toronto = { lat: 43.6532, lng: -79.3832 }
    const ottawa = { lat: 45.4215, lng: -75.6972 }
    const a = haversineKm(toronto, ottawa)
    const b = haversineKm(ottawa, toronto)
    expect(a).toBeGreaterThan(300)
    expect(a).toBeLessThan(500)
    expect(a).toBeCloseTo(b, 6)
  })

  it('stepwiseFactorForKm picks band and respects floor', () => {
    const bands = [
      { maxKm: 10, factor: 1 },
      { maxKm: 50, factor: 0.9 },
      { maxKm: Infinity, factor: 0.8 },
    ]
    expect(stepwiseFactorForKm(0, bands, 0.75)).toBe(1)
    expect(stepwiseFactorForKm(10, bands, 0.75)).toBe(1)
    expect(stepwiseFactorForKm(11, bands, 0.75)).toBe(0.9)
    expect(stepwiseFactorForKm(9999, bands, 0.75)).toBe(0.8)
    // Floor wins if band factor is too low.
    expect(stepwiseFactorForKm(9999, [{ maxKm: Infinity, factor: 0.5 }], 0.75)).toBe(0.75)
  })
})

