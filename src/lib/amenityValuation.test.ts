import { describe, expect, it } from 'vitest'
import { computeAmenityMonthlyDelta, resolveAmenityMonthlyValue } from './amenityValuation'

describe('computeAmenityMonthlyDelta', () => {
  it('applies discounted additional quantity for parking', () => {
    const value = computeAmenityMonthlyDelta({
      amenityId: 'parking',
      baseDelta: 70,
      modifier: { quantity: 2 },
    })
    expect(value).toBe(129.5)
  })

  it('applies shared-garage discount factor', () => {
    const value = computeAmenityMonthlyDelta({
      amenityId: 'garage',
      baseDelta: 150,
      modifier: { quantity: 1.5, shared: true },
    })
    expect(value).toBeCloseTo(149.625, 6)
  })

  it('adds tiered sqft premium for storage', () => {
    const value = computeAmenityMonthlyDelta({
      amenityId: 'storage',
      baseDelta: 35,
      modifier: { quantity: 1, areaSqft: 1000 },
    })
    expect(value).toBe(420)
  })

  it('uses override value when provided', () => {
    const value = resolveAmenityMonthlyValue({
      amenityId: 'parking',
      baseDelta: 70,
      modifier: { quantity: 2 },
      override: 200,
    })
    expect(value).toBe(200)
  })

  it('falls back to computed value when override is cleared', () => {
    const value = resolveAmenityMonthlyValue({
      amenityId: 'parking',
      baseDelta: 70,
      modifier: { quantity: 2 },
      override: undefined,
    })
    expect(value).toBe(129.5)
  })

  it('clamps negative override to zero', () => {
    const value = resolveAmenityMonthlyValue({
      amenityId: 'parking',
      baseDelta: 70,
      modifier: { quantity: 1 },
      override: -12,
    })
    expect(value).toBe(0)
  })

  it('ignores override when amenity is disabled', () => {
    const value = resolveAmenityMonthlyValue({
      enabled: false,
      amenityId: 'parking',
      baseDelta: 70,
      modifier: { quantity: 1 },
      override: 400,
    })
    expect(value).toBe(0)
  })

  it('scales utility baseline by regionalMultiplier for flat amenities', () => {
    const value = resolveAmenityMonthlyValue({
      amenityId: 'electricity',
      baseDelta: 70,
      regionalMultiplier: 1.1,
    })
    expect(value).toBe(77)
  })

  it('does not scale when override is set', () => {
    const value = resolveAmenityMonthlyValue({
      amenityId: 'electricity',
      baseDelta: 70,
      regionalMultiplier: 1.1,
      override: 65,
    })
    expect(value).toBe(65)
  })

  it('applies regionalMultiplier before parking quantity math', () => {
    const value = resolveAmenityMonthlyValue({
      amenityId: 'parking',
      baseDelta: 70,
      modifier: { quantity: 2 },
      regionalMultiplier: 2,
    })
    // effective base 140; 1 + 0.85 * second stall
    expect(value).toBe(259)
  })
})
