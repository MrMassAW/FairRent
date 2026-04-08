import { describe, expect, it, vi } from 'vitest'

import type { CmhcRentRow } from '../data/cmhcRents'
import type { PlacesProvincePayload } from './canadaGeoApi'
import {
  findNearestCmhcRentAnchor,
  placesDatasetFromProvincePayload,
  runMarketRentPipeline,
  tryBundledGeoMarketRent,
} from './resolveMarketRent'

vi.mock('./adminDataStore', () => ({
  getGeoDistanceReductionPolicy: vi.fn(async () => ({
    enabled: true,
    bandsKm: [{ maxKm: Infinity, factor: 0.9 }],
    floorFactor: 0.75,
    maxSearchKm: 10000,
    updatedAt: new Date().toISOString(),
  })),
}))

const rows: CmhcRentRow[] = [
  {
    province: 'ON',
    city: 'Toronto',
    bedrooms: 1,
    structureType: 'apartment',
    avgRent: 2000,
    surveyYear: 2024,
    lat: 43.6532,
    lng: -79.3832,
  },
  {
    province: 'ON',
    city: 'Ottawa',
    bedrooms: 1,
    structureType: 'apartment',
    avgRent: 1800,
    surveyYear: 2024,
    lat: 45.4215,
    lng: -75.6972,
  },
]

const placesPayload: PlacesProvincePayload = {
  province: 'ON',
  municipalities: [{ province: 'ON', name: 'Ottawa', lat: 45.4215, lng: -75.6972 }],
  fsas: [],
}

describe('findNearestCmhcRentAnchor', () => {
  it('picks closest city anchor for bedroom count', () => {
    const hit = findNearestCmhcRentAnchor('ON', 1, 45.42, -75.7, rows)
    expect(hit?.row.city).toBe('Ottawa')
    expect(hit?.km).toBeLessThan(5)
  })
})

describe('tryBundledGeoMarketRent', () => {
  it('applies distance factor', async () => {
    const r = await tryBundledGeoMarketRent({
      province: 'ON',
      city: 'Nowhere',
      bedrooms: 1,
      dataset: rows,
      lat: 45.4215,
      lng: -75.6972,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.selected.city).toBe('Ottawa')
      expect(r.selected.adjustedRent).toBe(1620)
    }
  })
})

describe('runMarketRentPipeline', () => {
  it('returns nameLookup when CMHC string matches', async () => {
    const p = await runMarketRentPipeline({
      formLocation: {
        province: 'ON',
        city: 'Toronto',
        bedrooms: 1,
        buildingType: 'apartment',
        structureType: 'purpose-built',
      },
      dataset: rows,
      places: placesPayload,
    })
    expect(p.nameLookup).not.toBeNull()
    expect(p.nameLookup?.averageRent).toBe(2000)
    expect(p.bundledGeo.ok).toBe(false)
  })

  it('uses bundled geo when name misses and coords match', async () => {
    const p = await runMarketRentPipeline({
      formLocation: {
        province: 'ON',
        city: 'Ottawa',
        bedrooms: 1,
        buildingType: 'apartment',
        structureType: 'purpose-built',
      },
      dataset: rows.filter((x) => x.city !== 'Ottawa'),
      places: placesPayload,
    })
    expect(p.nameLookup).toBeNull()
    expect(p.bundledGeo.ok).toBe(true)
  })

  it('uses fuzzy match on master dataset city names before geo', async () => {
    const torontoRows: CmhcRentRow[] = [
      {
        province: 'ON',
        city: 'Toronto',
        bedrooms: 1,
        structureType: 'apartment',
        avgRent: 2100,
        surveyYear: 2024,
        lat: 43.6532,
        lng: -79.3832,
      },
    ]
    const p = await runMarketRentPipeline({
      formLocation: {
        province: 'ON',
        city: 'Toront',
        bedrooms: 1,
        buildingType: 'apartment',
        structureType: 'purpose-built',
      },
      dataset: torontoRows,
      places: null,
    })
    expect(p.nameLookup).not.toBeNull()
    expect(p.nameLookup?.averageRent).toBe(2100)
    expect(p.nameMatch).toBe('fuzzy-master')
    expect(p.resolvedCityForMarket).toBe('Toronto')
    expect(p.bundledGeo.ok).toBe(false)
  })
})

describe('placesDatasetFromProvincePayload', () => {
  it('builds dataset shape', () => {
    const ds = placesDatasetFromProvincePayload(placesPayload)
    expect(ds.municipalities).toHaveLength(1)
    expect(ds.fsas).toHaveLength(0)
  })
})
