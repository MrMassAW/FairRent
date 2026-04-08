import { describe, expect, it } from 'vitest'

import type { CanadaPlacesDataset } from '../types/canadaPlaces'
import { findFsaInPlaces, normalizeCanadianFsa, resolveLatLngFromPlaces, resolveMunicipalityFromPlaces } from './canadaPlacesLookup'

const sample: CanadaPlacesDataset = {
  source: 'test',
  generatedNote: '',
  generatedAt: '',
  municipalities: [
    { province: 'ON', name: 'Toronto', lat: 43.7, lng: -79.38 },
    { province: 'ON', name: 'Ottawa', lat: 45.42, lng: -75.7 },
  ],
  fsas: [{ province: 'ON', fsa: 'M5H', lat: 43.65, lng: -79.38, label: 'Downtown' }],
}

describe('normalizeCanadianFsa', () => {
  it('parses spaced and compact input', () => {
    expect(normalizeCanadianFsa('m5h 1a1')).toBe('M5H')
    expect(normalizeCanadianFsa('M5H')).toBe('M5H')
  })

  it('rejects invalid', () => {
    expect(normalizeCanadianFsa('123')).toBeNull()
  })
})

describe('resolveMunicipalityFromPlaces', () => {
  it('exact match', () => {
    const r = resolveMunicipalityFromPlaces(sample, 'ON', 'Toronto')
    expect(r.method).toBe('exact')
    expect(r.municipality?.lat).toBeCloseTo(43.7, 4)
  })

  it('fuzzy match', () => {
    const r = resolveMunicipalityFromPlaces(sample, 'ON', 'Toront')
    expect(r.method).toBe('fuzzy')
    expect(r.municipality?.name).toBe('Toronto')
  })
})

describe('findFsaInPlaces', () => {
  it('finds FSA', () => {
    const f = findFsaInPlaces(sample, 'ON', 'M5H')
    expect(f?.label).toBe('Downtown')
  })
})

describe('resolveLatLngFromPlaces', () => {
  it('prefers FSA over municipality when provided', () => {
    const r = resolveLatLngFromPlaces(sample, 'ON', 'Toronto', 'M5H')
    expect(r?.via).toBe('fsa')
    expect(r?.lat).toBeCloseTo(43.65, 4)
  })

  it('falls back to municipality', () => {
    const r = resolveLatLngFromPlaces(sample, 'ON', 'Toronto', null)
    expect(r?.via).toBe('municipality')
    expect(r?.lat).toBeCloseTo(43.7, 4)
  })
})
