import { describe, expect, it, vi } from 'vitest'

import { buildGeoFallbackMarketRent } from './geoFallbackMarket'

vi.mock('./adminDataStore', () => {
  return {
    getGeoDistanceReductionPolicy: vi.fn(async () => ({
      enabled: true,
      bandsKm: [{ maxKm: Infinity, factor: 0.9 }],
      floorFactor: 0.75,
      maxSearchKm: 10000,
      updatedAt: new Date().toISOString(),
    })),
    getAvailableHistoryMonths: vi.fn(async () => ['2026-03']),
    getRentsForMonth: vi.fn(async () => [
      // Same province, two CMAs, coords provided.
      {
        id: '2026-03|ON|Toronto|1',
        month: '2026-03',
        province: 'ON',
        cma: 'Toronto',
        bedrooms: 1,
        avgRent: 2000,
        lat: 43.6532,
        lng: -79.3832,
        source: 'CMHC',
        sourceDate: '2025-12-31',
        quality: 'verified',
      },
      {
        id: '2026-03|ON|Ottawa|1',
        month: '2026-03',
        province: 'ON',
        cma: 'Ottawa',
        bedrooms: 1,
        avgRent: 1800,
        lat: 45.4215,
        lng: -75.6972,
        source: 'CMHC',
        sourceDate: '2025-12-31',
        quality: 'verified',
      },
    ]),
  }
})

vi.mock('./geocode', () => {
  return {
    isGeocodioConfigured: vi.fn(() => true),
    geocodeBatchGeocodio: vi.fn(async () => [
      {
        query: 'Somewhere, ON, Canada',
        ok: true,
        lat: 45.4215,
        lng: -75.6972,
      },
    ]),
  }
})

describe('buildGeoFallbackMarketRent', () => {
  it('selects nearest CMA and applies factor', async () => {
    const r = await buildGeoFallbackMarketRent({ province: 'ON', city: 'Somewhere', bedrooms: 1 })
    expect(r?.ok).toBe(true)
    expect(r?.selected.cma).toBe('Ottawa')
    expect(r?.selected.baseRent).toBe(1800)
    expect(r?.selected.factor).toBe(0.9)
    expect(r?.selected.adjustedRent).toBe(1620)
  })
})

