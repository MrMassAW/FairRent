import { describe, expect, it } from 'vitest'
import { calculateRent } from './rentModel'

describe('calculateRent', () => {
  it('computes recurring, bare minimum, and fair target', () => {
    const result = calculateRent(
      {
        mortgage: 1000,
        propertyTax: 300,
        insurance: 100,
        condoFees: 100,
        utilities: 100,
        fixedFees: 50,
        other: 50,
        annualCapex: 1200,
      },
      {
        vacancyRate: 2,
        maintenanceRate: 5,
        annualReturnRate: 4,
        capitalInvested: 60000,
      },
    )

    expect(result.monthlyRecurring).toBe(1700)
    expect(result.bareMinimum).toBe(1834.69)
    expect(result.fairTarget).toBe(2126.43)
  })

  it('clamps invalid percentages', () => {
    const result = calculateRent(
      {
        mortgage: 1000,
        propertyTax: 0,
        insurance: 0,
        condoFees: 0,
        utilities: 0,
        fixedFees: 0,
        other: 0,
        annualCapex: 0,
      },
      {
        vacancyRate: 500,
        maintenanceRate: -10,
        annualReturnRate: 1000,
        capitalInvested: 1200,
      },
    )

    expect(result.adjustedRecurring).toBe(20000)
    expect(result.maintenanceReserve).toBe(0)
    expect(result.monthlyReturnTarget).toBe(100)
  })
})
