import { describe, expect, it } from 'vitest'
import { buildUtilityPriceMonthlyRows, REFERENCE_CANADA_ELEC_NET_PER_KWH } from './mergeUtilityPriceRows'

describe('buildUtilityPriceMonthlyRows', () => {
  it('uses OEB ratio for Ontario electricity when StatCan fails', () => {
    const rows = buildUtilityPriceMonthlyRows({
      months: ['2026-01'],
      latestSurveyRows: [
        {
          province: 'ON',
          city: 'Toronto',
          surveyYear: 2024,
          bedrooms: 2,
          structureType: 'purpose-built',
          avgRent: 2000,
        },
      ],
      statcan: { ok: false, error: 'test' },
      oeb: {
        summary: { meanNetPerKwh: 0.024, meanServiceCharge: 30, count: 10 },
        rows: [],
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].province).toBe('ON')
    expect(rows[0].electricity).toBeCloseTo(0.024 / REFERENCE_CANADA_ELEC_NET_PER_KWH, 5)
    expect(rows[0].quality).toBe('carried-forward')
  })
})
