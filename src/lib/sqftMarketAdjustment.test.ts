import { describe, expect, it } from 'vitest'
import { applySquareFootageToMarketRent, getTypicalSqftForBedrooms, SQFT_RENT_ELASTICITY } from './sqftMarketAdjustment'

describe('applySquareFootageToMarketRent', () => {
  it('returns null when sqft is missing or zero', () => {
    expect(applySquareFootageToMarketRent(2000, 2, undefined)).toBeNull()
    expect(applySquareFootageToMarketRent(2000, 2, 0)).toBeNull()
  })

  it('returns null when CMHC average is not positive', () => {
    expect(applySquareFootageToMarketRent(0, 2, 900)).toBeNull()
  })

  it('applies no change when unit matches typical size for bedrooms', () => {
    const typical = getTypicalSqftForBedrooms(2)
    const r = applySquareFootageToMarketRent(2000, 2, typical)
    expect(r).not.toBeNull()
    expect(r!.rentDeltaFraction).toBeCloseTo(0, 6)
    expect(r!.adjustedRent).toBeCloseTo(2000, 6)
  })

  it('increases rent when unit is larger than typical', () => {
    const typical = getTypicalSqftForBedrooms(1)
    const larger = typical * 1.2
    const r = applySquareFootageToMarketRent(1800, 1, larger)
    expect(r).not.toBeNull()
    const expectedDelta = 0.2 * SQFT_RENT_ELASTICITY
    expect(r!.rentDeltaFraction).toBeCloseTo(expectedDelta, 6)
    expect(r!.adjustedRent).toBeCloseTo(1800 * (1 + expectedDelta), 4)
  })

  it('decreases rent when unit is smaller than typical', () => {
    const typical = getTypicalSqftForBedrooms(2)
    const smaller = typical * 0.85
    const r = applySquareFootageToMarketRent(2200, 2, smaller)
    expect(r).not.toBeNull()
    expect(r!.rentDeltaFraction).toBeLessThan(0)
    expect(r!.adjustedRent).toBeLessThan(2200)
  })
})
